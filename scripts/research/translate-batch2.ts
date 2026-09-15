/**
 * Translate the Batch 2 research handoff into canonical research input.
 *
 * ONE-TIME, DETERMINISTIC, MECHANICAL. APPEND ONLY.
 *
 * research/input/*.yaml is the authoritative research record and is already
 * hand-maintained for Batch 1 (Phase 3D hardening added atomic splits and
 * hardeningRefs that are not in any packet). So this script does NOT regenerate
 * those files: it appends the Batch 2 records to the end of each top-level list,
 * behind a one-time guard marker, and touches nothing above it.
 *
 * It authors no research. Every value written is copied from the packet or
 * produced by a stated mapping table below. Where the packet leaves something
 * unknown it stays unknown; where the packet says company reported it stays
 * company reported; a third-party estimate stays an estimate; a reported
 * financing that has not closed is written as reported_unconfirmed, never as
 * capital raised.
 *
 * The packet YAML is authoritative for structure. The source register TSV is
 * the only place carrying source URLs, so both are read.
 *
 * Run:  npx tsx scripts/research/translate-batch2.ts <extracted-packet-dir>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { slugify } from "@/lib/research/ids";

/* ------------------------------- packet types --------------------------- */

interface DimAssessment {
  company: string;
  dimension: string;
  evidence_status: string;
  analyst_assessment: string;
  diligence_question: string | null;
  model_eligibility: string;
}
interface HighImpactClaim {
  company: string;
  topic: string;
  fact: string;
  provenance: string;
  source_subtype: string | null;
  confidence: string;
  model_eligibility: string;
  primary_source_id: string;
  supporting_source_ids: string[] | null;
  metric_as_of_date: string | null;
  notes: string | null;
}
interface EventCandidate {
  company: string;
  event_date: string | null;
  publication_date: string | null;
  availability_date: string | null;
  availability_method: string;
  event_type: string;
  direction: string;
  status: string;
  summary: string;
  source_ids: string[];
}
interface ResearchIssue {
  company: string;
  issue: string;
  status: string;
  decision: string;
  impact: string;
}
interface PacketCompany {
  name: string;
  domain: string;
  business_model_boundary: string;
  dimension_assessments: DimAssessment[];
  high_impact_claims: HighImpactClaim[];
  event_candidates: EventCandidate[];
  research_issues: ResearchIssue[];
}
interface Packet {
  companies: PacketCompany[];
}
interface RegisterSource {
  id: string;
  company: string;
  publisher: string;
  title: string;
  url: string;
  publication_date: string;
  source_type: string;
  support_role: string;
  origin_scope: string;
  date_note: string;
}

/* ----------------------------- mapping tables --------------------------- */

/** The deterministic research timestamp for the corpus. Not a clock read. */
const AS_OF = "2026-09-07";

/**
 * Packet source_type to canonical sourceType.
 *
 * official_press_distribution is a company announcement carried on a wire: it is
 * a first-party press release reproduction, so it maps to official_company and
 * sets isPressReleaseReproduction. investor_disclosure is a fund writing about
 * its own investment, which the canonical investor_industry class already
 * captures. No new SourceRecord enum is introduced.
 */
const SOURCE_TYPE: Record<string, string> = {
  official_company: "official_company",
  official_press_distribution: "official_company",
  independent_journalism: "independent_journalism",
  structured_secondary: "structured_secondary",
  investor_disclosure: "investor_industry",
  regulatory: "regulatory",
};
const PRESS_RELEASE_REPRODUCTION = new Set(["official_press_distribution"]);

/**
 * Packet support_role to canonical SourceSupportRole.
 *
 * The packet uses a richer human research vocabulary. Each term below is mapped
 * onto the existing canonical role that preserves its meaning; the finer packet
 * nuance is retained verbatim in the source termsNote. No new enum is added.
 *
 *   negative_event          -> a fact of record this source establishes
 *   secondary_liquidity     -> independent detail on a transaction's structure
 *   management_interview     -> the company or a named executive stating it
 *   management_metric        -> the company or a named executive stating it
 *   structured_secondary     -> an outside data-vendor estimate
 *   third_party_reported     -> an outside estimate carried by a publication
 *   definition_caveat        -> background that qualifies but verifies no metric
 *   reported_unconfirmed     -> background: a report of something not settled
 */
function supportRoleFor(role: string, canonicalSourceType: string): string {
  switch (role) {
    case "primary_fact":
      return "primary_fact";
    case "transaction_detail":
    case "secondary_liquidity":
      return "transaction_detail";
    case "corroborating":
      return "corroborating";
    case "contextual":
    case "definition_caveat":
    case "reported_unconfirmed":
      return "contextual";
    case "negative_event":
      return canonicalSourceType === "official_company"
        ? "direct_company_disclosure"
        : "primary_fact";
    case "management_interview":
    case "management_metric":
      return "direct_company_disclosure";
    case "structured_secondary":
    case "third_party_estimate":
    case "third_party_reported":
      return "third_party_estimate";
    default:
      throw new Error(`unmapped support_role "${role}"`);
  }
}

/**
 * Packet event_type to canonical signalType.
 *
 * A secondary_liquidity, private_share_transaction, or funding_talks event is a
 * capital event and rides the existing funding signal, exactly as the Batch 1
 * Linear tender did; its secondary or unconfirmed character is carried in the
 * evidenceSummary and, for talks, in eventStatus. A security_incident has no
 * equivalent in the pre-Batch-2 vocabulary and is the one genuine gap: it maps
 * to the minimal additive security_incident signal added in this phase.
 */
const SIGNAL_TYPE: Record<string, string> = {
  funding: "funding",
  secondary_liquidity: "funding",
  private_share_transaction: "funding",
  funding_talks: "funding",
  customer_milestone: "customer_momentum",
  revenue_milestone: "customer_momentum",
  growth_milestone: "customer_momentum",
  usage_milestone: "customer_momentum",
  developer_milestone: "technical_adoption",
  executive_hire: "executive_hire",
  security_incident: "security_incident",
};
const SIGNAL_CATEGORY: Record<string, string> = {
  funding: "capital",
  secondary_liquidity: "capital",
  private_share_transaction: "capital",
  funding_talks: "capital",
  customer_milestone: "demand",
  revenue_milestone: "demand",
  growth_milestone: "demand",
  usage_milestone: "demand",
  developer_milestone: "demand",
  executive_hire: "team",
  security_incident: "risk",
};

/** Packet dimension-assessment readiness to the canonical 3-value vocabulary. */
function evidenceStatusFor(status: string): "supported" | "mixed" | "insufficient" {
  switch (status) {
    case "supported":
      return "supported";
    case "mixed":
    case "supported_with_caveat":
    case "partially_supported":
      return "mixed";
    case "blocked":
      return "insufficient";
    default:
      throw new Error(`unmapped evidence_status "${status}"`);
  }
}

/** Analyst confidence in a dimension assessment, from its readiness label. */
function assessmentConfidenceFor(status: string): string {
  switch (status) {
    case "supported":
    case "supported_with_caveat":
      return "medium";
    case "mixed":
    case "partially_supported":
      return "low";
    case "blocked":
      return "unknown";
    default:
      throw new Error(`unmapped evidence_status "${status}"`);
  }
}

/** Packet event status to canonical eventStatus. */
function eventStatusFor(status: string): "completed" | "reported_unconfirmed" {
  return status === "reported_unconfirmed" ? "reported_unconfirmed" : "completed";
}
/** Event claim confidence, from the packet status. */
function eventConfidenceFor(status: string): string {
  if (status === "third_party_reported" || status === "third_party_estimate") return "medium";
  if (status === "reported_unconfirmed") return "medium";
  return "high";
}

/* -------------------------------- emit helpers ------------------------- */

/** YAML string emitter. Always quoted and escaped, so no value injects structure. */
function q(value: string | null | undefined): string {
  if (value === null || value === undefined) return "null";
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\s+/g, " ").trim()}"`;
}
function list(values: readonly string[], indent: string): string {
  if (values.length === 0) return " []";
  return `\n${values.map((v) => `${indent}- ${q(v)}`).join("\n")}`;
}
const dslug = (domain: string): string => slugify(domain.replace(/\./g, "-"));

/* ---------------------------------- main ------------------------------- */

const packetDir = process.argv[2];
if (!packetDir) throw new Error("usage: translate-batch2.ts <packet-dir>");

const packet = yaml.load(
  readFileSync(join(packetDir, "originationiq_phase4a_batch2_final_research.yaml"), "utf8"),
) as Packet;

const registerRows = readFileSync(join(packetDir, "batch2_source_register.tsv"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line.trim().length > 0);
const header = (registerRows[0] ?? "").split("\t");
const register: RegisterSource[] = registerRows.slice(1).map((line) => {
  const cells = line.split("\t");
  return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])) as unknown as RegisterSource;
});
const srcById = new Map(register.map((s) => [s.id, s]));
const urlOf = (id: string): string => {
  const s = srcById.get(id);
  if (!s) throw new Error(`source id "${id}" not in the register`);
  return s.url;
};

const INPUT_DIR = join(process.cwd(), "research", "input");
const GUARD = "# --- BATCH 2 (Phase 4B ingestion) ---";
function appendBlock(file: string, block: string): void {
  const path = join(INPUT_DIR, file);
  const current = readFileSync(path, "utf8");
  if (current.includes(GUARD)) {
    throw new Error(`${file} already carries the Batch 2 guard marker; refusing to append twice`);
  }
  const trimmed = current.replace(/\s*$/, "");
  writeFileSync(path, `${trimmed}\n\n${GUARD}\n${block}\n`, "utf8");
}

/* --------------------------------- sources ----------------------------- */

const sourceBlocks = register.map((s) => {
  const mapped = SOURCE_TYPE[s.source_type];
  if (!mapped) throw new Error(`unmapped source_type "${s.source_type}" on ${s.id}`);
  const role = supportRoleFor(s.support_role, mapped);
  const terms =
    `Batch 2 source ${s.id}. Origin scope as researched: ${s.origin_scope}. ` +
    `Support role as researched: ${s.support_role}.` +
    (s.date_note ? ` ${s.date_note}` : "");
  return `  - url: ${q(s.url)}
    publisher: ${q(s.publisher)}
    title: ${q(s.title)}
    sourceType: ${mapped}
    publishedAt: ${s.publication_date ? q(s.publication_date) : "null"}
    isPressReleaseReproduction: ${PRESS_RELEASE_REPRODUCTION.has(s.source_type)}
    originatesFromUrl: null
    supportRole: ${role}
    termsNote: ${q(terms)}`;
});

/* -------------------------------- companies ---------------------------- */

const companyBlocks = packet.companies.map((c) => {
  const urls = register.filter((s) => s.company === c.name).map((s) => s.url);
  const issueNotes = c.research_issues
    .map((i) => `${i.issue} (${i.status}): ${i.decision}`)
    .join(" | ");
  const notes =
    `Batch 2 business-model boundary: ${c.business_model_boundary}. ` +
    `Do not infer SaaS gross margins. Research issues carried from the Batch 2 packet: ${issueNotes}`;
  return `  - name: ${q(c.name)}
    domain: ${q(c.domain)}
    aliases: []
    sector: ${q(c.business_model_boundary)}
    subsector: null
    stage: unknown
    headquarters: null
    foundingYear: null
    founders: []
    knownInvestors: []
    description: ${q(c.business_model_boundary)}
    reasonSourced: ${q(`Batch 2 research universe (Phase 4B ingestion). Domain-identity resolved to ${c.domain}.`)}
    researchStatus: approved
    sourceUrls:${list(urls, "      ")}
    isPrivate: true
    firstObservedAt: ${q(AS_OF)}
    notes: ${q(notes)}`;
});

/* -------------------------------- evidence ----------------------------- */

const evidenceBlocks: string[] = [];
let dimCount = 0;
let hiCount = 0;

for (const c of packet.companies) {
  // 140 analyst dimension assessments. Not sourced facts: the analyst reading
  // lives in analystInterpretation, the readiness in evidenceStatus, the open
  // question in diligenceQuestion. provenance is assumption. The packet supplied
  // no source relationship for these, so none is written: source is null and a
  // source relationship is never invented to satisfy a technical constraint.
  // The verbatim packet readiness label is preserved in notes.
  for (const a of c.dimension_assessments) {
    dimCount += 1;
    evidenceBlocks.push(`  - company: ${q(c.domain)}
    claim: ${q(`Analyst ${a.dimension} assessment for ${c.name}: ${a.analyst_assessment}`)}
    value: null
    numericValue: null
    unit: null
    source: null
    supportingSources: []
    publicationDate: null
    metricAsOfDate: null
    lastVerified: ${q(AS_OF)}
    provenance: assumption
    sourceSubtype: null
    confidence: ${assessmentConfidenceFor(a.evidence_status)}
    modelEligibility: ${a.model_eligibility}
    topic: ${q(a.dimension)}
    notes: ${q(`Batch 2 analyst dimension assessment. Research readiness as recorded: ${a.evidence_status}. Analyst synthesis, not a sourced fact; no source relationship, so the basis is the analyst interpretation and diligence question. Readiness language describes evidence only and is not a score.`)}
    excerpt: null
    evidenceStatus: ${evidenceStatusFor(a.evidence_status)}
    analystInterpretation: ${q(a.analyst_assessment)}
    diligenceQuestion: ${q(a.diligence_question)}
    researchAssessmentId: ${q(`b2-assess-${dslug(c.domain)}-${a.dimension}`)}
    hardeningRef: null`);
  }

  // 68 high-impact atomic claims. Sourced facts. provenance, sourceSubtype,
  // confidence, modelEligibility, and the primary/supporting sources are copied
  // straight from the packet. Nothing is upgraded.
  const topicSeen = new Map<string, number>();
  for (const h of c.high_impact_claims) {
    hiCount += 1;
    const n = (topicSeen.get(h.topic) ?? 0) + 1;
    topicSeen.set(h.topic, n);
    const supporting = (h.supporting_source_ids ?? []).map(urlOf);
    const provenance = h.provenance;
    const subtype =
      provenance === "sourced" ? h.source_subtype ?? "reported_fact" : h.source_subtype || null;
    evidenceBlocks.push(`  - company: ${q(c.domain)}
    claim: ${q(h.fact)}
    value: null
    numericValue: null
    unit: null
    source: ${q(urlOf(h.primary_source_id))}
    supportingSources:${list(supporting, "      ")}
    publicationDate: ${srcById.get(h.primary_source_id)?.publication_date ? q(srcById.get(h.primary_source_id)!.publication_date) : "null"}
    metricAsOfDate: ${h.metric_as_of_date ? q(h.metric_as_of_date) : "null"}
    lastVerified: ${q(AS_OF)}
    provenance: ${provenance}
    sourceSubtype: ${subtype ?? "null"}
    confidence: ${h.confidence}
    modelEligibility: ${h.model_eligibility}
    topic: ${q(h.topic)}
    notes: ${q(`Batch 2 high-impact atomic claim.${h.notes ? ` ${h.notes}` : ""}`)}
    excerpt: null
    analystInterpretation: null
    diligenceQuestion: null
    researchAssessmentId: ${q(`b2-claim-${dslug(c.domain)}-${h.topic}-${n}`)}
    hardeningRef: null`);
  }
}

/* --------------------------------- events ------------------------------ */

const eventBlocks: string[] = [];
let evtCount = 0;
for (const c of packet.companies) {
  c.event_candidates.forEach((e, index) => {
    evtCount += 1;
    const st = SIGNAL_TYPE[e.event_type];
    if (!st) throw new Error(`unmapped event_type "${e.event_type}" on ${c.name}`);
    const primary = e.source_ids[0];
    if (!primary) throw new Error(`event ${c.name} #${index + 1} has no source id`);
    const others = e.source_ids.slice(1).map((id) => srcById.get(id)?.publisher).filter(Boolean);
    const summary =
      others.length > 0 ? `${e.summary} Corroborated by ${others.join(", ")}.` : e.summary;
    const status = eventStatusFor(e.status);
    const unconfirmedNote =
      status === "reported_unconfirmed"
        ? "Reported financing talks only. No reviewed source through the 2026-09-07 research cutoff establishes a closing. Not capital raised."
        : null;
    const note =
      e.availability_method === "manual_verified"
        ? srcById.get(primary)?.date_note ||
          "Manually verified against corroborating financing-history sources; page crawl metadata is inconsistent."
        : null;
    eventBlocks.push(`  - company: ${q(c.domain)}
    signalType: ${st}
    category: ${SIGNAL_CATEGORY[e.event_type]}
    direction: ${e.direction}
    publicationDate: ${e.publication_date ? q(e.publication_date) : "null"}
    availabilityDate: ${e.availability_date ? q(e.availability_date) : "null"}
    availabilityEvidence:
      method: ${e.availability_method}
      sourceUrl: ${q(urlOf(primary))}
      sourceRecordId: null
      note: ${q(note)}
    eventDate: ${e.event_date ? q(e.event_date) : "null"}
    source: ${q(urlOf(primary))}
    evidenceSummary: ${q(summary)}
    confidence: ${eventConfidenceFor(e.status)}
    humanVerified: verified
    verifiedBy: ${q("batch2 research")}
    verifiedAt: ${q(`${AS_OF}T00:00:00.000Z`)}
    interpretation: null
    interpretationBasis: unknown
    eventStatus: ${status}
    unconfirmedNote: ${q(unconfirmedNote)}
    researchEventId: ${q(`b2-evt-${dslug(c.domain)}-${index + 1}`)}`);
  });
}

/* --------------------------------- write ------------------------------- */

appendBlock("sources.yaml", sourceBlocks.join("\n\n"));
appendBlock("companies.yaml", companyBlocks.join("\n\n"));
appendBlock("evidence.yaml", evidenceBlocks.join("\n\n"));
appendBlock("events.yaml", eventBlocks.join("\n\n"));

process.stdout.write(
  [
    `companies appended     ${companyBlocks.length}`,
    `sources appended       ${sourceBlocks.length}`,
    `dimension assessments  ${dimCount}`,
    `high-impact claims     ${hiCount}`,
    `evidence rows appended ${evidenceBlocks.length}`,
    `events appended        ${evtCount}`,
    "",
  ].join("\n"),
);
