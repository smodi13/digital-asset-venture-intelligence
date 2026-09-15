import {
  resolveConfidence,
  type CitedEvidence,
  type ConfidenceResolutionInput,
} from "@/lib/scoring/confidence";
import { RELIABILITY_CLASS, type ReliabilityClass, type ContradictionSeverity } from "@/lib/scoring/config";
import type { EvidenceClaim } from "@/lib/schemas/evidence-claim";
import type { SourceRecordV7, SourceTypeV7 } from "@/lib/schemas/v7/source-record";

/**
 * Digital-asset v7 evidence-confidence adapter (Phase 3C-2.1, PARALLEL / DORMANT).
 *
 * The confidence MATH (lib/scoring/confidence.ts: origin dedup, probabilistic
 * combination, reliability-class cap, contradiction factor) is domain-neutral
 * and reused here completely unchanged. This file is only the narrow, v7-typed
 * bridge from a Screening criterion judgment's cited evidence to that engine's
 * input shape, mirroring the mapping approach of lib/scoring/evidence-adapter.ts
 * (the active v6 bridge) without reusing its v6-only wiring: that file's source-
 * type table only covers the 11 v6 source classes, and its currentness policy
 * is keyed to the 14 v6 Screening criterion ids, neither of which fit v7's own
 * 14 Screening criterion ids or its 7 additional digital-asset source classes.
 *
 * Every mapping below is derived from data v7's own schema already encodes
 * (lib/schemas/v7/source-record.ts DIGITAL_ASSET_SOURCE_PROFILES: reliabilityPrior,
 * isIndependent), matched to the nearest existing v6 reliability class by base
 * value and independence, never a newly invented number.
 *
 * No freshness decay is applied (freshnessFactor is left at 1 / neutral): the
 * frozen CALIBRATION research corpus shares one cutoff date and no v7-specific
 * currentness policy (an analog of SCREENING_CURRENTNESS_POLICY, keyed to v7's
 * 14 criterion ids) has been authored yet.
 * ponytail: no v7 currentness/freshness policy yet, add one if VALIDATION or a
 * later cohort spans a wide enough time range for staleness to matter.
 */

/** Reused unchanged from lib/scoring/evidence-adapter.ts REPORTED_FACT_BY_SOURCE_TYPE for the 11 inherited v6 source classes. */
const INHERITED_SOURCE_TYPE_RELIABILITY: Partial<Record<SourceTypeV7, ReliabilityClass>> = {
  regulatory: "regulatory_legal_fact",
  independent_journalism: "independent_reported_fact",
  customer_vendor: "customer_vendor_own_experience",
  official_company: "direct_company_verifiable_fact",
  identified_social: "direct_company_verifiable_fact",
  investor_industry: "investor_industry_evidence",
  structured_secondary: "investor_industry_evidence",
};

/**
 * New mapping for the 7 digital-asset-only source classes, each chosen as the
 * nearest existing v6 reliability class by (a) independence compatibility and
 * (b) closest RELIABILITY_CLASS.base to the source's own reliabilityPrior
 * (lib/schemas/v7/source-record.ts DIGITAL_ASSET_SOURCE_PROFILES):
 *   block_explorer            0.90 independent  -> independent_reported_fact (base 0.90)
 *   security_audit            0.85 independent  -> direct_company_verifiable_fact (base 0.85)
 *   code_repository           0.75 first-party  -> company_private_kpi (base 0.70, cap 0.75; project controls its own repo)
 *   onchain_analytics         0.60 independent  -> investor_industry_evidence (base 0.60)
 *   official_protocol_source  0.68 first-party   -> company_private_kpi (base 0.70)
 *   official_network_source   0.68 first-party   -> company_private_kpi (base 0.70)
 *   governance_forum          0.55 not independent, plural voices -> structured_third_party_estimate (base 0.50)
 */
const DIGITAL_ASSET_SOURCE_TYPE_RELIABILITY: Record<
  "official_protocol_source" | "official_network_source" | "governance_forum" | "block_explorer" | "onchain_analytics" | "code_repository" | "security_audit",
  ReliabilityClass
> = {
  official_protocol_source: "company_private_kpi",
  official_network_source: "company_private_kpi",
  governance_forum: "structured_third_party_estimate",
  block_explorer: "independent_reported_fact",
  onchain_analytics: "investor_industry_evidence",
  code_repository: "company_private_kpi",
  security_audit: "direct_company_verifiable_fact",
};

/** Exported so the calibration config-freeze fingerprint (lib/judgments-v7/methodology-fingerprint.ts) can cover it: a change here must change the freeze hash. */
export const DA_SOURCE_TYPE_RELIABILITY_CLASS: Partial<Record<SourceTypeV7, ReliabilityClass>> = {
  ...INHERITED_SOURCE_TYPE_RELIABILITY,
  ...DIGITAL_ASSET_SOURCE_TYPE_RELIABILITY,
};

/**
 * Source types treated as the entity's own first-party voice: N records from
 * any of these collapse to one `company:<id>` origin, mirroring
 * lib/scoring/evidence-adapter.ts COMPANY_ORIGIN_SOURCE_TYPES, extended with
 * the v7 source classes whose own profile note says the project/protocol
 * controls the artifact directly (official_protocol_source,
 * official_network_source, code_repository). governance_forum is deliberately
 * excluded: its profile note describes a plural participant/governance record,
 * not a single controlled voice.
 */
const DA_COMPANY_ORIGIN_SOURCE_TYPES_LIST = [
  "official_company",
  "founder_or_executive",
  "official_protocol_source",
  "official_network_source",
  "code_repository",
] as const satisfies readonly SourceTypeV7[];

/** Exported (array form, fingerprint-friendly) for the same reason as DA_SOURCE_TYPE_RELIABILITY_CLASS above. */
export const DA_COMPANY_ORIGIN_SOURCE_TYPES_ARRAY: readonly SourceTypeV7[] = DA_COMPANY_ORIGIN_SOURCE_TYPES_LIST;

const DA_COMPANY_ORIGIN_SOURCE_TYPES: ReadonlySet<SourceTypeV7> = new Set<SourceTypeV7>(DA_COMPANY_ORIGIN_SOURCE_TYPES_LIST);

function sourceMap(sources: readonly SourceRecordV7[]): Map<string, SourceRecordV7> {
  return new Map(sources.map((s) => [s.id, s]));
}

function resolveRoot(sourceId: string, byId: ReadonlyMap<string, SourceRecordV7>, seen: Set<string> = new Set()): SourceRecordV7 | null {
  if (seen.has(sourceId)) return null;
  seen.add(sourceId);
  const s = byId.get(sourceId);
  if (!s) return null;
  if (s.originatesFrom) return resolveRoot(s.originatesFrom, byId, seen) ?? s;
  return s;
}

/** Origin key for one (claim, source) relationship, or null when it cannot be resolved as an admissible origin. */
function resolveOrigin(claim: EvidenceClaim, sourceId: string, byId: ReadonlyMap<string, SourceRecordV7>): string | null {
  if (claim.sourceSubtype === "company_reported") return `company:${claim.companyId}`;

  const root = resolveRoot(sourceId, byId);
  if (!root) return null;
  if (DA_COMPANY_ORIGIN_SOURCE_TYPES.has(root.sourceType)) return `company:${claim.companyId}`;
  if (root.isPressReleaseReproduction) return null;
  return `source:${root.id}`;
}

function reliabilityClassFor(claim: EvidenceClaim, source: SourceRecordV7): ReliabilityClass | null {
  if (claim.sourceSubtype === "third_party_estimate") return "structured_third_party_estimate";
  if (claim.sourceSubtype === "company_reported") {
    return claim.topic === "identity" ? "direct_company_verifiable_fact" : "company_private_kpi";
  }
  if (claim.sourceSubtype === "reported_fact") return DA_SOURCE_TYPE_RELIABILITY_CLASS[source.sourceType] ?? null;
  return null;
}

/** All (claim, source) relationships for one claim: its primary source plus every supporting source. */
function claimSourceIds(claim: EvidenceClaim): string[] {
  return [...(claim.sourceId ? [claim.sourceId] : []), ...claim.supportingSourceIds];
}

/**
 * Build the CitedEvidence list for one criterion's cited claims. A claim/source
 * relationship that cannot be resolved to a reliability class or origin is
 * silently excluded from the evidence list (never fabricated), consistent
 * with "zero evidence never fabricates confidence".
 */
export function buildCitedEvidence(citedClaimIds: readonly string[], claimsById: ReadonlyMap<string, EvidenceClaim>, sources: readonly SourceRecordV7[]): CitedEvidence[] {
  const byId = sourceMap(sources);
  const out: CitedEvidence[] = [];
  for (const claimId of citedClaimIds) {
    const claim = claimsById.get(claimId);
    if (!claim) continue;
    for (const sourceId of claimSourceIds(claim)) {
      const source = byId.get(sourceId);
      if (!source) continue;
      const reliabilityClass = reliabilityClassFor(claim, source);
      const originKey = resolveOrigin(claim, sourceId, byId);
      if (!reliabilityClass || !originKey) continue;
      out.push({ claimId, originKey, reliabilityClass, quality: source.reliability });
    }
  }
  return out;
}

/**
 * Confidence for one Screening criterion judgment, computed only from the
 * cited, frozen evidence. Empty citedClaimIds (including a genuinely
 * zero-coverage judgment) yields confidence 0 through resolveConfidence's own
 * empty-evidence rule; no separate zero-fill branch is needed here.
 */
export function computeCriterionConfidence(
  citedClaimIds: readonly string[],
  hasAcknowledgedContradiction: boolean,
  claimsById: ReadonlyMap<string, EvidenceClaim>,
  sources: readonly SourceRecordV7[],
): number {
  const evidence = buildCitedEvidence(citedClaimIds, claimsById, sources);
  const contradiction: ContradictionSeverity = hasAcknowledgedContradiction ? "material" : "none";
  const input: ConfidenceResolutionInput = { evidence, contradiction };
  return resolveConfidence(input).confidence;
}

export { RELIABILITY_CLASS };
