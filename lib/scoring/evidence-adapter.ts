import { RELIABILITY_CLASS, type ReliabilityClass, type ContradictionSeverity } from "./config";
import {
  aggregateConfidence,
  derivedConfidence,
  type CitedEvidence,
  type ConfidenceResolutionInput,
  type EvidenceItem,
} from "./confidence";
import { SCREENING_CRITERION_IDS } from "./screening";
import type { EvidenceClaim } from "@/lib/schemas/evidence-claim";
import type { SourceRecord, SourceType } from "@/lib/schemas/source-record";

/**
 * Canonical research evidence -> scoring evidence adapter.
 *
 * This is the ONLY sanctioned bridge between the canonical research corpus
 * (EvidenceClaim + SourceRecord) and the scoring confidence engine
 * (lib/scoring/confidence.ts CitedEvidence). It exists so that neither Claude
 * nor an analyst ever hand-picks a scoring reliability class or a confidence
 * number: the mapping is deterministic and defined here.
 *
 * Hard separation. These research-metadata fields are NEVER read as scoring
 * inputs and cannot alter a mapped reliability class or raise computed
 * confidence:
 *   - EvidenceClaim.confidence          (research confidence level)
 *   - EvidenceClaim.evidenceStatus      (research assessment)
 *   - SourceRecord.reliability           (research reliability prior)
 *   - SourceRecord.tier
 * The Phase 5 reliability classes and their base/cap table stay authoritative.
 *
 * No math changes: reliability bases/caps, origin aggregation, the
 * derived-confidence rule, contradiction factors, and freshness bands are all
 * consumed unchanged from confidence.ts / config.ts.
 */

/* -------------------------------------------------------------------------- */
/* Typed errors. Every one is deterministic: same inputs -> same throw.       */
/* -------------------------------------------------------------------------- */

export class UntraceableDerivedClaimError extends Error {
  constructor(claimId: string, detail?: string) {
    super(
      `derived claim "${claimId}" is not scoring-admissible: ${
        detail ?? "no explicit, resolvable input claim ids"
      }. Dependencies are never inferred from prose, source urls, researchAssessmentId, or notes.`,
    );
    this.name = "UntraceableDerivedClaimError";
  }
}

export class UnmappedReliabilityError extends Error {
  constructor(detail: string) {
    super(`no deterministic reliability mapping for ${detail}. Refusing to invent a fallback.`);
    this.name = "UnmappedReliabilityError";
  }
}

export class UnresolvedSourceError extends Error {
  constructor(sourceId: string) {
    super(`canonical SourceRecord "${sourceId}" could not be resolved.`);
    this.name = "UnresolvedSourceError";
  }
}

export class OriginatesFromCycleError extends Error {
  constructor(sourceId: string) {
    super(`SourceRecord.originatesFrom chain cycles at "${sourceId}".`);
    this.name = "OriginatesFromCycleError";
  }
}

export class AmbiguousReproductionError extends Error {
  constructor(sourceId: string) {
    super(
      `SourceRecord "${sourceId}" reproduces an announcement but has no defensible canonical origin chain. ` +
        `Refusing to count it as an independent origin.`,
    );
    this.name = "AmbiguousReproductionError";
  }
}

export class FreshnessDateError extends Error {
  constructor(claimId: string, detail: string) {
    super(`cannot establish a freshness date for current-state claim "${claimId}": ${detail}.`);
    this.name = "FreshnessDateError";
  }
}

export class AdapterInputError extends Error {
  constructor(detail: string) {
    super(`invalid adapter input: ${detail}.`);
    this.name = "AdapterInputError";
  }
}

/* -------------------------------------------------------------------------- */
/* Screening currentness policy (fixed mapping, do not edit).                 */
/* -------------------------------------------------------------------------- */

/**
 * Whether a Screening criterion evaluates a CURRENT company state (so stale
 * evidence should lower confidence) or an enduring / historical fact (so it
 * must not decay).
 *
 *  - observable_scale_vs_primary_capital: may rest on completed historical
 *    capital facts that do not get less true because the transaction is older.
 *  - founder_problem_fit: enduring background.
 *  - everything else: a current or currently-relevant company state.
 */
export const SCREENING_CURRENTNESS_POLICY: Readonly<Record<string, boolean>> = {
  observable_scale_vs_primary_capital: false,
  founder_problem_fit: false,

  capital_intensity_delivery_signal: true,
  recent_operating_growth: true,
  adoption_growth_and_durability: true,
  active_team_complementarity: true,
  demonstrated_budget_and_urgency: true,
  market_breadth_and_expansion: true,
  monetization_recurrence_and_value_alignment: true,
  cost_to_serve_and_scaling_risk: true,
  customer_proof: true,
  distribution_repeatability_and_expansion: true,
  differentiated_capability_or_workflow: true,
  observed_defensibility_or_displacement: true,
};

// Fail loud if the policy ever drifts from the 14 Screening criteria.
{
  const policyKeys = new Set(Object.keys(SCREENING_CURRENTNESS_POLICY));
  const missing = [...SCREENING_CRITERION_IDS].filter((id) => !policyKeys.has(id));
  const extra = [...policyKeys].filter((id) => !SCREENING_CRITERION_IDS.has(id));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `[evidence-adapter] SCREENING_CURRENTNESS_POLICY must cover exactly the 14 Screening criteria. ` +
        `Missing: [${missing.join(", ")}]. Unknown: [${extra.join(", ")}].`,
    );
  }
}

export function currentnessMattersFor(criterionId: string): boolean {
  const v = SCREENING_CURRENTNESS_POLICY[criterionId];
  if (v === undefined) {
    throw new AdapterInputError(`"${criterionId}" is not a Screening criterion with a currentness policy`);
  }
  return v;
}

/* -------------------------------------------------------------------------- */
/* Reliability class mapping.                                                 */
/* -------------------------------------------------------------------------- */

/** reported_fact claims map by the resolved SourceRecord.sourceType. */
const REPORTED_FACT_BY_SOURCE_TYPE: Partial<Record<SourceType, ReliabilityClass>> = {
  regulatory: "regulatory_legal_fact",
  independent_journalism: "independent_reported_fact",
  customer_vendor: "customer_vendor_own_experience",
  official_company: "direct_company_verifiable_fact",
  identified_social: "direct_company_verifiable_fact",
  investor_industry: "investor_industry_evidence",
  structured_secondary: "investor_industry_evidence",
};

interface Mapped {
  reliabilityClass: ReliabilityClass;
  rule: string;
}

/**
 * Map one (claim, resolved source) relationship to a scoring reliability class.
 * Publisher fame, source tier, and every research-metadata field are ignored.
 */
function mapReliability(claim: EvidenceClaim, source: SourceRecord): Mapped {
  const subtype = claim.sourceSubtype;

  // FIRST: a third-party estimate is a structured third-party estimate,
  // regardless of who published it.
  if (subtype === "third_party_estimate") {
    return { reliabilityClass: "structured_third_party_estimate", rule: "reliability.third_party_estimate" };
  }

  // SECOND: company-reported. Identity facts are directly verifiable; every
  // other company-reported value is a private KPI, and an independent outlet
  // repeating it does not promote it.
  if (subtype === "company_reported") {
    return claim.topic === "identity"
      ? { reliabilityClass: "direct_company_verifiable_fact", rule: "reliability.company_reported.identity" }
      : { reliabilityClass: "company_private_kpi", rule: "reliability.company_reported.kpi" };
  }

  // THIRD: a verifiable event of record, mapped by source class.
  if (subtype === "reported_fact") {
    const mapped = REPORTED_FACT_BY_SOURCE_TYPE[source.sourceType];
    if (!mapped) {
      throw new UnmappedReliabilityError(
        `reported_fact claim "${claim.id}" with source class "${source.sourceType}"`,
      );
    }
    return { reliabilityClass: mapped, rule: `reliability.reported_fact.${source.sourceType}` };
  }

  throw new UnmappedReliabilityError(`claim "${claim.id}" with sourceSubtype "${String(subtype)}"`);
}

/* -------------------------------------------------------------------------- */
/* Origin resolution.                                                         */
/* -------------------------------------------------------------------------- */

function mustSource(sources: ReadonlyMap<string, SourceRecord>, id: string): SourceRecord {
  const s = sources.get(id);
  if (!s) throw new UnresolvedSourceError(id);
  return s;
}

/** Follow SourceRecord.originatesFrom to its root, detecting cycles. */
function resolveRoot(
  sourceId: string,
  sources: ReadonlyMap<string, SourceRecord>,
  seen: Set<string> = new Set(),
): SourceRecord {
  if (seen.has(sourceId)) throw new OriginatesFromCycleError(sourceId);
  seen.add(sourceId);
  const s = mustSource(sources, sourceId);
  if (s.originatesFrom) return resolveRoot(s.originatesFrom, sources, seen);
  return s;
}

const COMPANY_ORIGIN_SOURCE_TYPES: ReadonlySet<SourceType> = new Set<SourceType>([
  "official_company",
  "founder_or_executive",
]);

interface ResolvedOrigin {
  originKey: string;
  rule: string;
}

/**
 * The stable origin key for one (claim, source) relationship. Publication
 * count is never independence: a company KPI carried by five outlets stays
 * one `company:<id>` origin.
 */
function resolveOrigin(
  claim: EvidenceClaim,
  sourceId: string,
  sources: ReadonlyMap<string, SourceRecord>,
): ResolvedOrigin {
  // A company-reported claim is one company voice across every publication.
  if (claim.sourceSubtype === "company_reported") {
    return { originKey: `company:${claim.companyId}`, rule: "origin.company_reported" };
  }

  const root = resolveRoot(sourceId, sources);

  // A company-origin chain (official company / named executive) collapses to
  // the company, including a company press-release reproduction.
  if (COMPANY_ORIGIN_SOURCE_TYPES.has(root.sourceType)) {
    return { originKey: `company:${claim.companyId}`, rule: "origin.company_chain" };
  }

  // A non-company announcement reproduction with no defensible origin chain is
  // not an independent origin.
  if (root.isPressReleaseReproduction) {
    throw new AmbiguousReproductionError(root.id);
  }

  return { originKey: `source:${root.id}`, rule: "origin.source_root" };
}

/* -------------------------------------------------------------------------- */
/* Provenance admissibility.                                                  */
/* -------------------------------------------------------------------------- */

export interface AdapterClaim extends EvidenceClaim {
  /**
   * Explicit canonical input claim ids for a derived claim. Schema v6 has no
   * field for this, so a real v6 derived claim carries none and is therefore
   * not scoring-admissible.
   */
  derivedInputClaimIds?: readonly string[];
  /**
   * The analyst reviewed this claim for the criterion but excluded it from the
   * scored evidence. A `reviewedButExcluded` sourced / valid-derived claim can
   * still create a material contradiction.
   */
  reviewedButExcluded?: boolean;
}

type Admissibility = "sourced" | "derived" | "excluded";

function classifyProvenance(claim: AdapterClaim, knownClaimIds: ReadonlySet<string>): Admissibility {
  switch (claim.provenance) {
    case "sourced":
      return "sourced";
    case "derived": {
      const inputs = claim.derivedInputClaimIds ?? [];
      if (inputs.length === 0) throw new UntraceableDerivedClaimError(claim.id);
      for (const id of inputs) {
        if (!knownClaimIds.has(id)) {
          throw new UntraceableDerivedClaimError(claim.id, `input claim "${id}" is not in the reviewed evidence`);
        }
      }
      return "derived";
    }
    // assumption, unknown, estimated_range: inadmissible for positive OR
    // negative scoring coverage. They remain research metadata only.
    default:
      return "excluded";
  }
}

/** Does a reviewed-but-excluded claim still qualify to force a contradiction? */
function isQualifyingProvenance(claim: AdapterClaim, knownClaimIds: ReadonlySet<string>): boolean {
  try {
    return classifyProvenance(claim, knownClaimIds) !== "excluded";
  } catch {
    // An untraceable derived claim is not qualifying.
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Source relationships and leaf reliability for derived claims.              */
/* -------------------------------------------------------------------------- */

function sourceRelationships(claim: EvidenceClaim): string[] {
  const ids = claim.sourceId ? [claim.sourceId] : [];
  return [...ids, ...claim.supportingSourceIds];
}

const strongerCap = (a: ReliabilityClass, b: ReliabilityClass): ReliabilityClass =>
  RELIABILITY_CLASS[a].cap >= RELIABILITY_CLASS[b].cap ? a : b;

/** Every leaf sourced reliability class in a derived claim's dependency tree. */
function leafClasses(
  claim: AdapterClaim,
  byId: ReadonlyMap<string, AdapterClaim>,
  sources: ReadonlyMap<string, SourceRecord>,
  seen: Set<string> = new Set(),
): ReliabilityClass[] {
  if (seen.has(claim.id)) return [];
  seen.add(claim.id);
  if (claim.provenance === "sourced") {
    return sourceRelationships(claim).map(
      (sid) => mapReliability(claim, mustSource(sources, sid)).reliabilityClass,
    );
  }
  if (claim.provenance === "derived") {
    return (claim.derivedInputClaimIds ?? []).flatMap((id) =>
      leafClasses(byId.get(id) as AdapterClaim, byId, sources, seen),
    );
  }
  return [];
}

/** Aggregate evidence confidence of one claim in isolation (no freshness / contradiction). */
function claimConfidence(
  claim: AdapterClaim,
  byId: ReadonlyMap<string, AdapterClaim>,
  sources: ReadonlyMap<string, SourceRecord>,
  knownClaimIds: ReadonlySet<string>,
  seen: Set<string> = new Set(),
): number {
  if (seen.has(claim.id)) throw new UntraceableDerivedClaimError(claim.id, "dependency cycle");
  seen.add(claim.id);
  const kind = classifyProvenance(claim, knownClaimIds);
  if (kind === "excluded") return 0;
  if (kind === "sourced") {
    const items: EvidenceItem[] = sourceRelationships(claim).map((sid) => ({
      originKey: resolveOrigin(claim, sid, sources).originKey,
      reliabilityClass: mapReliability(claim, mustSource(sources, sid)).reliabilityClass,
    }));
    return aggregateConfidence(items);
  }
  const inputs = (claim.derivedInputClaimIds ?? []).map((id) =>
    claimConfidence(byId.get(id) as AdapterClaim, byId, sources, knownClaimIds, new Set(seen)),
  );
  return derivedConfidence(inputs);
}

/* -------------------------------------------------------------------------- */
/* Freshness.                                                                 */
/* -------------------------------------------------------------------------- */

const MS_PER_DAY = 86_400_000;

interface Observation {
  date: string;
  field: "metricAsOfDate" | "publicationDate" | "lastVerified";
}

function selectObservation(claim: EvidenceClaim): Observation | null {
  if (claim.metricAsOfDate) return { date: claim.metricAsOfDate, field: "metricAsOfDate" };
  if (claim.publicationDate) return { date: claim.publicationDate, field: "publicationDate" };
  if (claim.lastVerified) return { date: claim.lastVerified, field: "lastVerified" };
  return null;
}

/* -------------------------------------------------------------------------- */
/* Contradiction.                                                             */
/* -------------------------------------------------------------------------- */

function resolveContradiction(
  admitted: readonly AdapterClaim[],
  excludedQualifying: readonly AdapterClaim[],
): ContradictionSeverity {
  const materialTargets = new Set<string>([
    ...admitted.map((c) => c.id),
    ...excludedQualifying.map((c) => c.id),
  ]);

  for (const c of admitted) {
    for (const other of [...c.contradicts, ...c.contradictedBy]) {
      if (materialTargets.has(other)) return "material";
    }
  }

  if (admitted.some((c) => c.contradictionNote && c.contradictionNote.length > 0)) return "minor";
  return "none";
}

/* -------------------------------------------------------------------------- */
/* Public adapter.                                                            */
/* -------------------------------------------------------------------------- */

export interface AdaptCriterionEvidenceOptions {
  /** A Screening criterion id (one of the 14). */
  criterionId: string;
  /** Every canonical claim the analyst reviewed for this criterion. */
  claims: readonly AdapterClaim[];
  /** The canonical SourceRecords referenced by those claims. */
  sources: ReadonlyMap<string, SourceRecord> | readonly SourceRecord[];
  /** The scoring as-of date (ISO). Freshness is measured against this, never wall-clock. */
  asOfDate: string;
}

export interface AdapterTraceEntry {
  claimId: string;
  sourceId: string | null;
  reliabilityClass: ReliabilityClass | null;
  originKey: string | null;
  currentnessMatters: boolean;
  observationDate?: string;
  ageDays?: number;
  derivedInputClaimIds?: readonly string[];
  contradictionSeverity: ContradictionSeverity;
  /** The mapping rule that produced this row. */
  rule: string;
  admitted: boolean;
  reason: string;
}

export interface AdaptedCriterionEvidence {
  criterionId: string;
  /** Feed straight into scoreCriterion / scoreScreeningCriterion. No confidence scalar. */
  resolutionInput: ConfidenceResolutionInput;
  trace: AdapterTraceEntry[];
  contradiction: ContradictionSeverity;
  admittedClaimIds: string[];
  excludedClaimIds: string[];
}

const ALLOWED_OPTION_KEYS: ReadonlySet<string> = new Set([
  "criterionId",
  "claims",
  "sources",
  "asOfDate",
]);

/**
 * Deterministically adapt the canonical claims reviewed for one Screening
 * criterion into a scoring ConfidenceResolutionInput plus an audit trace.
 *
 * The caller supplies evidence, never a confidence number: there is no option
 * through which a confidence / quality / reliability scalar can be injected.
 */
export function adaptCriterionEvidence(
  options: AdaptCriterionEvidenceOptions,
): AdaptedCriterionEvidence {
  for (const key of Object.keys(options)) {
    if (!ALLOWED_OPTION_KEYS.has(key)) {
      throw new AdapterInputError(`unexpected option "${key}" (the adapter never accepts a caller confidence override)`);
    }
  }

  const { criterionId, asOfDate } = options;
  const currentnessMatters = currentnessMattersFor(criterionId);

  const asOfMs = Date.parse(asOfDate);
  if (Number.isNaN(asOfMs)) throw new AdapterInputError(`asOfDate "${asOfDate}" is not a valid date`);

  const sources: ReadonlyMap<string, SourceRecord> = Array.isArray(options.sources)
    ? new Map(options.sources.map((s) => [s.id, s]))
    : (options.sources as ReadonlyMap<string, SourceRecord>);

  const byId = new Map<string, AdapterClaim>(options.claims.map((c) => [c.id, c]));
  const knownClaimIds = new Set(byId.keys());

  const evidence: CitedEvidence[] = [];
  const trace: AdapterTraceEntry[] = [];
  const admitted: AdapterClaim[] = [];
  const excludedQualifying: AdapterClaim[] = [];
  const excludedClaimIds: string[] = [];

  for (const claim of options.claims) {
    // Reviewed-but-excluded status is honored BEFORE any qualifying-provenance
    // classification. An analyst can hand the adapter a reviewed-but-excluded
    // claim of ANY canonical provenance (including an untraceable derived claim
    // that would otherwise throw) purely to audit it. It never becomes scoring
    // evidence: no CitedEvidence, no confidence, no coverage, no effective
    // reliability, no adjusted-score effect. Whether it may still force a
    // contradiction is decided separately by isQualifyingProvenance, which
    // encodes the Phase 5C-E excluded-evidence contradiction rules
    // (assumption / unknown / estimated_range / untraceable-derived => audit
    // only; sourced / valid-traceable-derived => may contradict on explicit
    // canonical metadata). No caller-side filtering is required.
    const kind = claim.reviewedButExcluded ? "excluded" : classifyProvenance(claim, knownClaimIds);

    if (claim.reviewedButExcluded || kind === "excluded") {
      excludedClaimIds.push(claim.id);
      if (isQualifyingProvenance(claim, knownClaimIds)) excludedQualifying.push(claim);
      trace.push({
        claimId: claim.id,
        sourceId: claim.sourceId,
        reliabilityClass: null,
        originKey: null,
        currentnessMatters,
        contradictionSeverity: "none",
        rule: claim.reviewedButExcluded ? "admissibility.reviewed_but_excluded" : `admissibility.${claim.provenance}`,
        admitted: false,
        reason:
          claim.reviewedButExcluded
            ? "analyst reviewed but excluded from scored evidence"
            : `provenance "${claim.provenance}" is inadmissible for scoring coverage`,
      });
      continue;
    }

    // Freshness date (only when the criterion depends on current state).
    let ageDays: number | undefined;
    let observationDate: string | undefined;
    if (currentnessMatters) {
      const obs = selectObservation(claim);
      if (!obs) throw new FreshnessDateError(claim.id, "no metricAsOfDate, publicationDate, or lastVerified");
      const obsMs = Date.parse(obs.date);
      if (Number.isNaN(obsMs)) throw new FreshnessDateError(claim.id, `unparseable ${obs.field} "${obs.date}"`);
      if (obsMs > asOfMs) {
        throw new FreshnessDateError(claim.id, `${obs.field} "${obs.date}" is after the as-of date "${asOfDate}"`);
      }
      ageDays = Math.floor((asOfMs - obsMs) / MS_PER_DAY);
      observationDate = obs.date;
    }

    admitted.push(claim);

    if (kind === "derived") {
      const inputIds = claim.derivedInputClaimIds ?? [];
      const inputConfidences = inputIds.map((id) =>
        claimConfidence(byId.get(id) as AdapterClaim, byId, sources, knownClaimIds),
      );
      const leaves = leafClasses(claim, byId, sources);
      if (leaves.length === 0) {
        throw new UntraceableDerivedClaimError(claim.id, "no sourced leaf evidence in the dependency tree");
      }
      const reliabilityClass = leaves.reduce(strongerCap);
      evidence.push({
        claimId: claim.id,
        originKey: `derived:${claim.id}`,
        reliabilityClass,
        derivedFromConfidences: inputConfidences,
        ...(ageDays !== undefined ? { ageDays } : {}),
      });
      trace.push({
        claimId: claim.id,
        sourceId: claim.sourceId,
        reliabilityClass,
        originKey: `derived:${claim.id}`,
        currentnessMatters,
        observationDate,
        ageDays,
        derivedInputClaimIds: inputIds,
        contradictionSeverity: "none",
        rule: "derived.confidence_from_inputs",
        admitted: true,
        reason: `derived from [${inputIds.join(", ")}]; confidence = 0.95 * min(input confidences)`,
      });
      continue;
    }

    // Sourced: one CitedEvidence per resolved source relationship.
    for (const sid of sourceRelationships(claim)) {
      const source = mustSource(sources, sid);
      const mapped = mapReliability(claim, source);
      const origin = resolveOrigin(claim, sid, sources);
      evidence.push({
        claimId: claim.id,
        originKey: origin.originKey,
        reliabilityClass: mapped.reliabilityClass,
        ...(ageDays !== undefined ? { ageDays } : {}),
      });
      trace.push({
        claimId: claim.id,
        sourceId: sid,
        reliabilityClass: mapped.reliabilityClass,
        originKey: origin.originKey,
        currentnessMatters,
        observationDate,
        ageDays,
        contradictionSeverity: "none",
        rule: `${mapped.rule} + ${origin.rule}`,
        admitted: true,
        reason: `${sid === claim.sourceId ? "primary" : "supporting"} source ${sid}`,
      });
    }
  }

  const contradiction = resolveContradiction(admitted, excludedQualifying);
  for (const entry of trace) {
    if (entry.admitted) entry.contradictionSeverity = contradiction;
  }

  return {
    criterionId,
    resolutionInput: { evidence, contradiction, currentnessMatters },
    trace,
    contradiction,
    admittedClaimIds: admitted.map((c) => c.id),
    excludedClaimIds,
  };
}
