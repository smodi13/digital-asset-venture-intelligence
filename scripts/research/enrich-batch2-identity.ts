/**
 * Merge the Phase 4C-B Batch 2 identity-enrichment packet into the canonical
 * research input.
 *
 * ONE-TIME, DETERMINISTIC, MECHANICAL.
 *
 * This is an identity-data pass, not new research. It:
 *
 *   1. Fills the five identity fields (stage, headquarters, foundingYear,
 *      operatingOriginYear, founders) on the 20 existing Batch 2 company
 *      records in research/input/companies.yaml. It edits only the identity
 *      stub inside each Batch 2 block and touches nothing else.
 *   2. Appends the genuinely new identity SourceRecords to sources.yaml behind
 *      a one-time guard. Packet URLs already in the corpus are reused by
 *      identity, never re-added.
 *   3. Appends atomic identity EvidenceClaims to evidence.yaml behind the same
 *      guard: one founding/origin claim, one headquarters claim and one stage
 *      claim per company, one current-role claim per founder, and the two
 *      public-launch-year claims (Canva, Lovable) that the Company schema has
 *      no typed field for.
 *
 * It authors no facts. Every value is copied from the packet YAML or produced
 * by a stated mapping table below. Unknown stays unknown: OpenEvidence keeps a
 * null foundingYear and its founding-year conflict is preserved as an
 * inspectable claim rather than resolved.
 *
 * No new SignalEvents. No scoring. No schema change (schema version stays 6).
 *
 * Run:  npx tsx scripts/research/enrich-batch2-identity.ts <extracted-packet-dir>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { slugify, normalizeUrlForIdentity } from "@/lib/research/ids";

/* ------------------------------- packet types -------------------------- */

interface PacketFounder {
  name: string;
  current_role: string;
}
interface PacketSourceRef {
  url: string;
  role: string;
}
interface PacketCompany {
  name: string;
  domain: string;
  founded_year: number | null;
  operating_origin_year: number | null;
  public_launch_year?: number | null;
  headquarters: string;
  current_stage: string;
  founders: PacketFounder[];
  sources: PacketSourceRef[];
  notes?: string;
}
interface Packet {
  companies: PacketCompany[];
}

/* ----------------------------- mapping tables -------------------------- */

const AS_OF = "2026-09-07";
const GUARD = "# --- BATCH 2 IDENTITY ENRICHMENT (Phase 4C-B) ---";
const B2_COMPANY_GUARD = "# --- BATCH 2 (Phase 4B ingestion) ---";

/**
 * Packet current_stage to the canonical Company stage enum.
 *
 * The enum has no "late stage" or "growth stage" distinction: both a
 * non-numbered growth round and a late-stage secondary profile map to `growth`.
 * The packet's exact wording ("Growth-stage private", "Late-stage private") is
 * preserved verbatim in the stage EvidenceClaim so the distinction is not lost.
 * A numbered round past D (Series F) maps to `series_d_plus`, never invented as
 * its own enum value.
 */
const STAGE: Record<string, string> = {
  "Series B": "series_b",
  "Series C": "series_c",
  "Series D": "series_d_plus",
  "Series F": "series_d_plus",
  "Growth-stage private": "growth",
  "Late-stage private": "growth",
};

/**
 * URL to canonical sourceType, by host / path shape.
 *
 * A LinkedIn company profile is the company's own self-maintained page: it is a
 * first-party assertion carried on a platform, so it maps to identified_social
 * (an identified account, not independent, cannot corroborate) rather than
 * official_company. A LinkedIn personal profile stating a role is a named
 * individual's attributable statement: founder_or_executive. A YC company page,
 * a fund's portfolio/research page (Sequoia, Contrary) is an interested party
 * writing about a company it backs: investor_industry. Nasdaq Private Market is
 * a data vendor: structured_secondary. A Forbes profile or bylined piece is
 * independent_journalism. Everything else here is a company-owned page:
 * official_company.
 */
function sourceTypeFor(url: string): string {
  const u = url.toLowerCase();
  if (/linkedin\.com\/company\//.test(u)) return "identified_social";
  if (/linkedin\.com\/in\//.test(u)) return "founder_or_executive";
  if (/ycombinator\.com\/companies\//.test(u)) return "investor_industry";
  if (/research\.contrary\.com/.test(u)) return "investor_industry";
  if (/sequoiacap\.com/.test(u)) return "investor_industry";
  if (/nasdaqprivatemarket\.com/.test(u)) return "structured_secondary";
  if (/forbes\.com/.test(u)) return "independent_journalism";
  return "official_company";
}

/** Source classes that can be cited by an identity claim without moving any
 *  independence metric: first-party or interested-party only. */
const CLAIM_SAFE_TYPES = new Set([
  "official_company",
  "identified_social",
  "founder_or_executive",
  "investor_industry",
]);

function supportRoleFor(sourceType: string, url: string): string {
  if (/terms-of-service|\/msa$/.test(url.toLowerCase())) return "legal_entity_disclosure";
  switch (sourceType) {
    case "official_company":
    case "identified_social":
    case "founder_or_executive":
      return "direct_company_disclosure";
    case "investor_industry":
    case "independent_journalism":
      return "contextual";
    case "structured_secondary":
      return "third_party_estimate";
    default:
      return "contextual";
  }
}

/** Human label for the stage enum, for claim prose. */
const STAGE_LABEL: Record<string, string> = {
  series_b: "Series B",
  series_c: "Series C",
  series_d_plus: "Series D or later",
  growth: "growth-stage private",
};

/* -------------------------------- helpers ------------------------------ */

function q(value: string | null | undefined): string {
  if (value === null || value === undefined) return "null";
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\s+/g, " ").trim()}"`;
}

/** Publisher name from a URL host. Deterministic, no lookups. */
function publisherFor(url: string, company: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const map: Record<string, string> = {
    "linkedin.com": "LinkedIn",
    "ycombinator.com": "Y Combinator",
    "research.contrary.com": "Contrary Research",
    "sequoiacap.com": "Sequoia Capital",
    "nasdaqprivatemarket.com": "Nasdaq Private Market",
    "forbes.com": "Forbes",
  };
  return map[host] ?? company;
}

/* ---------------------------------- main ------------------------------- */

const packetDir = process.argv[2];
if (!packetDir) throw new Error("usage: enrich-batch2-identity.ts <packet-dir>");

const packet = yaml.load(
  readFileSync(join(packetDir, "originationiq_phase4c_batch2_identity_enrichment.yaml"), "utf8"),
) as Packet;

const INPUT_DIR = join(process.cwd(), "research", "input");

/* ----- 1. companies.yaml: fill the identity stub, Batch 2 region only ---- */

const companiesPath = join(INPUT_DIR, "companies.yaml");
const companiesText = readFileSync(companiesPath, "utf8");
if (companiesText.includes("# identity enriched (Phase 4C-B)")) {
  throw new Error("companies.yaml already carries the Phase 4C-B identity marker; refusing to run twice");
}
const guardIdx = companiesText.indexOf(B2_COMPANY_GUARD);
if (guardIdx === -1) throw new Error("Batch 2 company guard marker not found");
const head = companiesText.slice(0, guardIdx);
let region = companiesText.slice(guardIdx);

const STUB = '    stage: unknown\n    headquarters: null\n    foundingYear: null\n    founders: []';

for (const c of packet.companies) {
  const stage = STAGE[c.current_stage];
  if (!stage) throw new Error(`unmapped current_stage "${c.current_stage}" for ${c.name}`);

  const anchor = `  - name: ${q(c.name)}\n`;
  const at = region.indexOf(anchor);
  if (at === -1) throw new Error(`company block for ${c.name} not found in Batch 2 region`);
  const stubAt = region.indexOf(STUB, at);
  const nextName = region.indexOf("\n  - name:", at + anchor.length);
  if (stubAt === -1 || (nextName !== -1 && stubAt > nextName)) {
    throw new Error(`identity stub for ${c.name} not found (already enriched?)`);
  }

  const founderLines = c.founders
    .map(
      (f) =>
        `      - name: ${q(f.name)}\n` +
        `        role: ${q(f.current_role)}\n` +
        `        priorCompanies: []\n` +
        `        github: null\n` +
        `        linkedin: null`,
    )
    .join("\n");

  const originLine =
    c.operating_origin_year !== null && c.operating_origin_year !== c.founded_year
      ? `\n    operatingOriginYear: ${c.operating_origin_year}`
      : "";

  const replacement =
    `    stage: ${stage}\n` +
    `    headquarters: ${q(c.headquarters)}\n` +
    `    foundingYear: ${c.founded_year === null ? "null" : c.founded_year}` +
    originLine +
    `\n    founders:\n${founderLines}`;

  region = region.slice(0, stubAt) + replacement + region.slice(stubAt + STUB.length);
}

region = region.replace(B2_COMPANY_GUARD, `${B2_COMPANY_GUARD}  # identity enriched (Phase 4C-B)`);
writeFileSync(companiesPath, head + region, "utf8");

/* --------------- 2. sources.yaml: append new identity sources ----------- */

const existingSources = (
  JSON.parse(readFileSync(join(process.cwd(), "data/generated/sources.json"), "utf8")) as {
    records: Array<{ url: string | null; sourceType: string }>;
  }
).records;
const existingNorm = new Set(
  existingSources.map((s) => (s.url ? normalizeUrlForIdentity(s.url) : "")).filter(Boolean),
);
/** Normalized URL to its already-canonical sourceType, for reused packet URLs. */
const existingTypeByNorm = new Map(
  existingSources
    .filter((s) => s.url)
    .map((s) => [normalizeUrlForIdentity(s.url as string), s.sourceType]),
);

/** The effective canonical sourceType of a packet URL: the corpus type if the
 *  URL is already a SourceRecord, otherwise the type this pass would assign. */
function effectiveType(url: string): string {
  return existingTypeByNorm.get(normalizeUrlForIdentity(url)) ?? sourceTypeFor(url);
}

const seen = new Set<string>();
let reused = 0;
const newSourceUrls: Array<{ url: string; role: string; company: string }> = [];
for (const c of packet.companies) {
  for (const s of c.sources) {
    const norm = normalizeUrlForIdentity(s.url);
    if (seen.has(norm)) continue;
    seen.add(norm);
    if (existingNorm.has(norm)) {
      reused += 1;
      continue;
    }
    newSourceUrls.push({ url: s.url, role: s.role, company: c.name });
  }
}

function appendGuarded(file: string, block: string): void {
  const path = join(INPUT_DIR, file);
  const current = readFileSync(path, "utf8");
  if (current.includes(GUARD)) {
    throw new Error(`${file} already carries the Phase 4C-B identity guard; refusing to append twice`);
  }
  writeFileSync(path, `${current.replace(/\s*$/, "")}\n\n${GUARD}\n${block}\n`, "utf8");
}

const sourceBlocks = newSourceUrls.map(({ url, role, company }) => {
  const sourceType = sourceTypeFor(url);
  const supportRole = supportRoleFor(sourceType, url);
  return `  - url: ${q(url)}
    publisher: ${q(publisherFor(url, company))}
    title: ${q(`${company} identity reference (${role.replace(/_/g, " ")})`)}
    sourceType: ${sourceType}
    publishedAt: null
    isPressReleaseReproduction: false
    originatesFromUrl: null
    supportRole: ${supportRole}
    termsNote: ${q(`Batch 2 identity source (Phase 4C-B). Packet role as researched: ${role}. Identity fact only; not an investment input. Accessed ${AS_OF}.`)}`;
});

/* --------------- 3. evidence.yaml: atomic identity claims -------------- */

/** Pick a claim-safe source for a fact, by matching the packet role, else the
 *  company's identity anchor. */
function pickSource(c: PacketCompany, re: RegExp): string {
  const safe = (s: PacketSourceRef) => CLAIM_SAFE_TYPES.has(effectiveType(s.url));
  const match = c.sources.find((s) => re.test(s.role) && safe(s));
  if (match) return match.url;
  const anchor = c.sources.find(safe);
  if (!anchor) throw new Error(`no claim-safe identity source for ${c.name}`);
  return anchor.url;
}

function claim(fields: {
  company: string;
  claim: string;
  source: string;
  confidence: string;
  topic: string;
  notes: string;
  id: string;
  supporting?: string[];
}): string {
  const supporting = fields.supporting ?? [];
  const supportingBlock =
    supporting.length === 0
      ? " []"
      : `\n${supporting.map((u) => `      - ${q(u)}`).join("\n")}`;
  return `  - company: ${q(fields.company)}
    claim: ${q(fields.claim)}
    value: null
    numericValue: null
    unit: null
    source: ${q(fields.source)}
    supportingSources:${supportingBlock}
    publicationDate: null
    metricAsOfDate: null
    lastVerified: ${q(AS_OF)}
    provenance: sourced
    sourceSubtype: company_reported
    confidence: ${fields.confidence}
    modelEligibility: context_only
    topic: ${q(fields.topic)}
    notes: ${q(fields.notes)}
    excerpt: null
    analystInterpretation: null
    diligenceQuestion: null
    researchAssessmentId: ${q(fields.id)}
    hardeningRef: null`;
}

const evidenceBlocks: string[] = [];
for (const c of packet.companies) {
  const dslug = slugify(c.domain.replace(/\./g, "-"));
  const origin = c.operating_origin_year;
  const stageEnum = STAGE[c.current_stage];
  if (!stageEnum) throw new Error(`unmapped current_stage "${c.current_stage}" for ${c.name}`);

  // Founding / operating-origin claim. OpenEvidence keeps its conflict, with
  // both sides linked: the primary source carries the 2021 assertion and the
  // packet's explicit 2022 founding source is attached as supporting evidence,
  // so both origins named in the claim text are traceable. This does not make
  // the claim independent-origin: the founding year is company-origin data
  // that publishers report differently, so sourceSubtype stays company_reported.
  if (c.founded_year === null) {
    const forbes2022 = c.sources.find((s) => /2022.*found|found.*2022/.test(s.role))?.url;
    evidenceBlocks.push(
      claim({
        company: c.domain,
        claim:
          `${c.name} has conflicting published founding-year evidence: LinkedIn and Contrary Research report 2021 ` +
          `while Forbes reports 2022, so the founding year is unresolved and recorded as unknown. Its earliest ` +
          `defensible operating origin is ${origin}; ${c.name} began operating in ${origin}.`,
        source: pickSource(c, /found|origin|2021/),
        supporting: forbes2022 ? [forbes2022] : [],
        confidence: "medium",
        topic: "identity",
        notes:
          "Batch 2 identity fact (Phase 4C-B). Founding-year conflict preserved as inspectable evidence; " +
          "foundedYear stays null rather than inventing certainty. Not an investment input.",
        id: `b2-identity-${dslug}-founding`,
      }),
    );
  } else {
    const sameYear = origin === null || origin === c.founded_year;
    evidenceBlocks.push(
      claim({
        company: c.domain,
        claim: sameYear
          ? `${c.name} was founded in ${c.founded_year} and began operating that year.`
          : `${c.name} was founded in ${c.founded_year} and began operating in ${origin}.`,
        source: pickSource(c, /found|origin|inception|2012|hq_founding/),
        confidence: "medium",
        topic: "identity",
        notes: "Batch 2 identity fact (Phase 4C-B). Enduring fact, not a signal event. Not an investment input.",
        id: `b2-identity-${dslug}-founding`,
      }),
    );
  }

  // Headquarters claim.
  evidenceBlocks.push(
    claim({
      company: c.domain,
      claim: `${c.name} is headquartered in ${c.headquarters}.`,
      source: pickSource(c, /hq/),
      confidence: "medium",
      topic: "identity",
      notes:
        "Batch 2 identity fact (Phase 4C-B). Current primary headquarters, not an office list or an " +
        "incorporation jurisdiction. Not an investment input.",
      id: `b2-identity-${dslug}-hq`,
    }),
  );

  // Current-stage claim. Packet wording preserved verbatim.
  evidenceBlocks.push(
    claim({
      company: c.domain,
      claim:
        `${c.name}'s current financing stage, based on its latest completed round, is "${c.current_stage}" ` +
        `(recorded on the Company record as ${STAGE_LABEL[stageEnum]}). ` +
        `Unconfirmed later financing does not advance the stage.`,
      source: pickSource(c, /stage/),
      confidence: "medium",
      topic: "identity",
      notes:
        "Batch 2 identity fact (Phase 4C-B). Stage reflects the latest completed financing state only; " +
        "tenders and reported talks do not advance it. Not an investment input.",
      id: `b2-identity-${dslug}-stage`,
    }),
  );

  // One current-role claim per founder.
  c.founders.forEach((f, i) => {
    evidenceBlocks.push(
      claim({
        company: c.domain,
        claim: `${f.name} is ${f.current_role} of ${c.name}.`,
        source: pickSource(c, /founder|roles|leadership|ceo|current|origin/),
        confidence: "medium",
        topic: "identity",
        notes:
          "Batch 2 identity fact (Phase 4C-B). Current role uses the packet's exact wording; no title is " +
          "invented or upgraded. Not an investment input and not a founder-alignment assessment.",
        id: `b2-identity-${dslug}-founder-${i + 1}`,
      }),
    );
  });

  // Public-launch-year, where the packet records it as distinct from founding.
  if (c.public_launch_year != null) {
    evidenceBlocks.push(
      claim({
        company: c.domain,
        claim:
          `${c.name}'s company founding (${c.founded_year}) and its public product launch ` +
          `(${c.public_launch_year}) are distinct years and are kept separate; foundedYear is not ` +
          `overwritten with the launch year.`,
        source: pickSource(c, /public_launch|launch|found|origin/),
        confidence: "medium",
        topic: "identity",
        notes:
          "Batch 2 identity fact (Phase 4C-B). The Company schema has no typed publicLaunchYear field; the " +
          "distinction is preserved here as an atomic sourced claim rather than a schema change. Not an investment input.",
        id: `b2-identity-${dslug}-public-launch`,
      }),
    );
  }
}

appendGuarded("sources.yaml", sourceBlocks.join("\n\n"));
appendGuarded("evidence.yaml", evidenceBlocks.join("\n\n"));

process.stdout.write(
  [
    `companies enriched        ${packet.companies.length}`,
    `packet source rows        ${packet.companies.reduce((n, c) => n + c.sources.length, 0)}`,
    `distinct packet urls      ${seen.size}`,
    `existing urls reused      ${reused}`,
    `new source records        ${sourceBlocks.length}`,
    `identity evidence claims  ${evidenceBlocks.length}`,
    `founder role claims       ${packet.companies.reduce((n, c) => n + c.founders.length, 0)}`,
    "",
  ].join("\n"),
);
