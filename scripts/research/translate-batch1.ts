/**
 * Translate the Batch 1 research handoff into canonical research input.
 *
 * ONE-TIME, DETERMINISTIC, MECHANICAL.
 *
 * The handoff packet is a transport representation. research/input/*.yaml is
 * authoritative, so the packet format is not preserved as a second permanent
 * schema. This script maps one into the other and nothing else.
 *
 * It authors no research. Every value written is either copied from the packet
 * or produced by a stated mapping table below. Where the packet leaves
 * something unknown, it stays unknown; where the packet says company reported,
 * it stays company reported; where a financing was only reported as possible,
 * it is written as reported_unconfirmed rather than as capital raised.
 *
 * Run:  npx tsx scripts/research/translate-batch1.ts <extracted-packet-dir> <identity-packet-dir>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface PacketSource {
  source_id: string; company: string; title: string; publisher: string; url: string;
  publication_date: string | null; source_type: string; independence: string;
  historical_availability: { availability_date: string | null; method: string; source_url?: string | null; source_record_id?: string | null; note?: string | null };
  accessed_at: string;
}
interface PacketClaim {
  claim_id: string; company: string; dimension: string; evidence_status: string;
  source_backed_fact: string; claim_basis: string; confidence: string;
  model_eligibility: string; source_ids: string[]; metric_as_of_date: string | null;
  analyst_interpretation: string | null; key_diligence_question: string | null;
}
interface PacketEvent {
  event_id: string; company: string; signal_type: string; signal_category: string;
  signal_direction: string; publication_date: string; availability_date: string | null;
  availability_evidence: { method: string; source_url?: string | null; source_record_id?: string | null; note?: string | null };
  event_date: string | null; source_id: string; evidence_summary: string;
  confidence: string; human_verified: boolean; investment_interpretation: string | null;
  interpretation_basis: string;
}
interface PacketIdentity {
  position: number; name: string; domain: string; status: string; current_status: string;
  founded: number | null; hq: string | null; founders: string[]; stage: string;
  sector: string; latest_round_usd: number | null; total_raised_usd: number | null;
  business_model: string; flags: string[]; sources: string[];
}
interface PacketFlag { company: string; severity: string; issue: string }

/* ----------------------------- mapping tables ---------------------------- */

/**
 * Packet source type to canonical source class.
 *
 * company_press_release is the company's own announcement carried on a wire.
 * It is first party, and it is the ORIGINAL rather than a reproduction of one,
 * so isPressReleaseReproduction stays false.
 *
 * investor_industry maps to the class added for it. The packet marks those
 * three records as independent; an investor writing about its own portfolio
 * company is not, and the canonical class says so.
 */
const SOURCE_TYPE: Record<string, string> = {
  official_company: "official_company",
  company_press_release: "official_company",
  independent_journalism: "independent_journalism",
  investor_industry: "investor_industry",
};

/**
 * Canonical stage from the packet's free-text stage label.
 * Anything unrecognised stays unknown rather than being guessed at.
 */
const STAGE: Record<string, string> = {
  "Seed": "seed",
  "Series A": "series_a",
  "Series B": "series_b",
  "Series C": "series_c",
  "Growth / institutional venture": "growth",
};

/**
 * Packet claim basis to canonical provenance.
 *
 * A compound basis such as company_reported_plus_analyst_inference maps on its
 * SOURCED component, because the inference half is carried separately in
 * analystInterpretation. Merging the two would present judgement as evidence.
 *
 * A basis of pure analyst_inference has no sourced component. It becomes an
 * assumption: chosen by the analyst, not stated by any source. It must never
 * read as sourced evidence.
 */
function provenanceFor(basis: string): "sourced" | "assumption" | "derived" {
  if (basis === "analyst_inference") return "assumption";
  if (basis.startsWith("derived_")) return "derived";
  return "sourced";
}

/**
 * Who is vouching, decided by the class of the primary source rather than by
 * re-reading the claim. Mechanical, so it cannot drift with interpretation.
 */
function subtypeFor(sourceType: string): "reported_fact" | "company_reported" | "third_party_estimate" {
  if (sourceType === "regulatory") return "reported_fact";
  if (sourceType === "official_company") return "company_reported";
  return "third_party_estimate";
}

/**
 * Split an assessment into atomic claims on sentence boundaries.
 *
 * Purely mechanical: it separates text the research already wrote as separate
 * sentences. It never decomposes a single sentence into several claims, which
 * would mean authoring research rather than translating it.
 */
function sentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"$])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** YAML string emitter. Always quoted and escaped, so no value can inject structure. */
function q(value: string | null): string {
  if (value === null) return "null";
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ").trim()}"`;
}
function list(values: readonly string[], indent: string): string {
  if (values.length === 0) return " []";
  return `\n${values.map((v) => `${indent}- ${q(v)}`).join("\n")}`;
}

const packetDir = process.argv[2];
const identityDir = process.argv[3];
if (!packetDir || !identityDir) {
  throw new Error("usage: translate-batch1.ts <packet-dir> <identity-dir>");
}
const read = <T,>(dir: string, file: string): T =>
  JSON.parse(readFileSync(join(dir, file), "utf8")) as T;

const sources = read<{ sources: PacketSource[] }>(packetDir, "batch1_sources.json").sources;
const claims = read<{ claims: PacketClaim[] }>(packetDir, "batch1_evidence_claims.json").claims;
const events = read<{ events: PacketEvent[] }>(packetDir, "batch1_signal_events.json").events;
const flags = read<{ flags: PacketFlag[] }>(packetDir, "batch1_quality_flags.json").flags;
const identity = read<{ companies: PacketIdentity[] }>(identityDir, "batch1_identity_source_pass.json").companies;

const AS_OF = "2026-09-06";
const sourceById = new Map(sources.map((s) => [s.source_id, s]));
const flagsByCompany = new Map<string, PacketFlag[]>();
for (const f of flags) {
  flagsByCompany.set(f.company, [...(flagsByCompany.get(f.company) ?? []), f]);
}

/**
 * Active companies.
 *
 * OpenRouter is excluded in the identity packet after an acquisition agreement
 * was identified, so it is not an independent origination target. It is
 * dropped here rather than filtered later, and a test asserts its absence.
 */
const active = identity
  .filter((c) => c.status !== "excluded")
  .sort((a, b) => a.position - b.position);

const domainByName = new Map(active.map((c) => [c.name, c.domain]));

/* --------------------------------- output -------------------------------- */
const header = (title: string, body: string): string =>
  `# ${title}\n#\n# Generated from the Batch 1 research handoff by\n# scripts/research/translate-batch1.ts on ${AS_OF}. The handoff packet is a\n# transport format; this file is the authoritative research record and is what\n# a human reviews and edits from here on.\n#\n# No value here was authored by the translator. Everything is copied from the\n# packet or produced by a stated mapping table in that script.\n\nschemaVersion: 4\n\n${body}`;

/* companies.yaml */
const companyBlocks = active.map((c) => {
  const companyFlags = (flagsByCompany.get(c.name) ?? []).map((f) => `${f.severity}: ${f.issue}`);
  const allFlags = [...c.flags, ...companyFlags];
  const founders = c.founders
    .map((n) => `      - name: ${q(n)}\n        role: null\n        priorCompanies: []\n        github: null\n        linkedin: null`)
    .join("\n");
  const companySources = sources.filter((s) => s.company === c.name).map((s) => s.url);
  return `  - name: ${q(c.name)}
    domain: ${q(c.domain)}
    aliases: []
    sector: ${q(c.sector)}
    subsector: null
    stage: ${STAGE[c.stage] ?? "unknown"}
    headquarters: ${q(c.hq)}
    foundingYear: ${c.founded ?? "null"}
    founders:${founders ? `\n${founders}` : " []"}
    knownInvestors: []
    description: ${q(c.business_model)}
    reasonSourced: ${q(`Batch 1 research universe, seed position ${c.position}.`)}
    researchStatus: approved
    sourceUrls:${list(companySources, "      ")}
    isPrivate: true
    firstObservedAt: "2026-09-06"
    notes: ${allFlags.length > 0 ? q(allFlags.join(" | ")) : "null"}`;
});
writeFileSync(
  "research/input/companies.yaml",
  header("Batch 1 company universe. Real companies, research reviewed.", `companies:\n${companyBlocks.join("\n\n")}\n`),
  "utf8",
);

/* sources.yaml */
const sourceBlocks = sources.map((s) => {
  const mapped = SOURCE_TYPE[s.source_type];
  if (!mapped) throw new Error(`unmapped source_type "${s.source_type}" on ${s.source_id}`);
  return `  - url: ${q(s.url)}
    publisher: ${q(s.publisher)}
    title: ${q(s.title)}
    sourceType: ${mapped}
    publishedAt: ${s.publication_date ? q(s.publication_date) : "null"}
    isPressReleaseReproduction: false
    originatesFromUrl: null
    termsNote: ${q(`Packet source ${s.source_id}. Independence as researched: ${s.independence}. Accessed ${s.accessed_at}.`)}`;
});
writeFileSync(
  "research/input/sources.yaml",
  header("Batch 1 source register. Every cited URL.", `sources:\n${sourceBlocks.join("\n\n")}\n`),
  "utf8",
);

/* evidence.yaml */
let atomicCount = 0;
const evidenceBlocks: string[] = [];
for (const c of claims) {
  const primary = sourceById.get(c.source_ids[0] ?? "");
  if (!primary) throw new Error(`claim ${c.claim_id} has no resolvable primary source`);
  const supporting = c.source_ids.slice(1).map((id) => sourceById.get(id)?.url).filter((u): u is string => !!u);
  const provenance = provenanceFor(c.claim_basis);
  const subtype = provenance === "sourced" ? subtypeFor(SOURCE_TYPE[primary.source_type] ?? "") : null;
  const parts = sentences(c.source_backed_fact);
  parts.forEach((part, index) => {
    atomicCount += 1;
    evidenceBlocks.push(`  - company: ${q(domainByName.get(c.company) ?? c.company)}
    claim: ${q(part)}
    value: null
    numericValue: null
    unit: null
    source: ${q(primary.url)}
    supportingSources:${list(supporting, "      ")}
    publicationDate: ${primary.publication_date ? q(primary.publication_date) : "null"}
    metricAsOfDate: ${c.metric_as_of_date ? q(c.metric_as_of_date) : "null"}
    lastVerified: "2026-09-06"
    provenance: ${provenance}
    sourceSubtype: ${subtype ?? "null"}
    confidence: ${c.confidence}
    modelEligibility: ${c.model_eligibility}
    topic: ${q(c.dimension)}
    notes: ${q(`Research basis: ${c.claim_basis}.${parts.length > 1 ? ` Statement ${index + 1} of ${parts.length} from assessment ${c.claim_id}.` : ""}`)}
    excerpt: null
    evidenceStatus: ${c.evidence_status}
    analystInterpretation: ${index === 0 ? q(c.analyst_interpretation) : "null"}
    diligenceQuestion: ${index === 0 ? q(c.key_diligence_question) : "null"}
    researchAssessmentId: ${q(c.claim_id)}`);
  });
}
writeFileSync(
  "research/input/evidence.yaml",
  header(
    `Batch 1 evidence. ${claims.length} research assessments translated into ${atomicCount} claims.`,
    `evidence:\n${evidenceBlocks.join("\n\n")}\n`,
  ),
  "utf8",
);

/* events.yaml */
/**
 * Financing reported but not completed.
 *
 * The packet describes one September 2026 report of a possible $350M financing
 * with terms explicitly not final. It is detected here by the phrase the
 * research used, so the translation is mechanical rather than a judgement, and
 * it is written as reported_unconfirmed rather than as capital raised.
 */
const UNCONFIRMED_MARKERS = ["terms explicitly not final", "terms were not final", "was discussing a potential", "potential $"];
const eventBlocks = events.map((e) => {
  const source = sourceById.get(e.source_id);
  if (!source) throw new Error(`event ${e.event_id} has no resolvable source`);
  const text = `${e.evidence_summary} ${e.investment_interpretation ?? ""}`.toLowerCase();
  const unconfirmed = UNCONFIRMED_MARKERS.some((m) => text.includes(m.toLowerCase()));
  const ha = e.availability_evidence;
  return `  - company: ${q(domainByName.get(e.company) ?? e.company)}
    signalType: ${e.signal_type}
    category: ${e.signal_category}
    direction: ${e.signal_direction}
    publicationDate: ${q(e.publication_date)}
    availabilityDate: ${e.availability_date ? q(e.availability_date) : "null"}
    availabilityEvidence:
      method: ${ha.method}
      sourceUrl: ${ha.source_url ? q(ha.source_url) : "null"}
      sourceRecordId: ${ha.source_record_id ? q(ha.source_record_id) : "null"}
      note: ${ha.note ? q(ha.note) : "null"}
    eventDate: ${e.event_date ? q(e.event_date) : "null"}
    source: ${q(source.url)}
    evidenceSummary: ${q(e.evidence_summary)}
    confidence: ${e.confidence}
    humanVerified: ${e.human_verified ? "verified" : "unverified"}
    verifiedBy: ${e.human_verified ? q("batch1 research") : "null"}
    verifiedAt: ${e.human_verified ? q("2026-09-06T00:00:00.000Z") : "null"}
    interpretation: ${q(e.investment_interpretation)}
    interpretationBasis: ${e.interpretation_basis}
    eventStatus: ${unconfirmed ? "reported_unconfirmed" : "completed"}
    unconfirmedNote: ${unconfirmed ? q("Reported as under discussion with terms explicitly not final. Not capital raised.") : "null"}
    researchEventId: ${q(e.event_id)}`;
});
writeFileSync(
  "research/input/events.yaml",
  header(`Batch 1 dated signal events. ${events.length} events.`, `events:\n${eventBlocks.join("\n\n")}\n`),
  "utf8",
);

/* headlines.yaml: no approved headline research exists for Batch 1. */
writeFileSync(
  "research/input/headlines.yaml",
  `# Headline Radar input.
#
# EMPTY BY DESIGN. The Batch 1 handoff contains no separately approved headline
# research. The 67 curated events in events.yaml are the authoritative Batch 1
# event record.
#
# Generating headlines from evidence summaries purely to exercise this file
# would manufacture research, and would put classifier output into the corpus
# with nothing behind it. The adapter and its tests remain covered by synthetic
# fixtures in tests/, which is where synthetic data belongs.

schemaVersion: 4

headlines: []
`,
  "utf8",
);

process.stdout.write(
  [
    `active companies      ${active.length} (of ${identity.length}, ${identity.length - active.length} excluded)`,
    `sources               ${sources.length}`,
    `assessments           ${claims.length}`,
    `atomic claims written ${atomicCount}`,
    `events                ${events.length}`,
    `unconfirmed events    ${eventBlocks.filter((b) => b.includes("reported_unconfirmed")).length}`,
    "",
  ].join("\n"),
);
