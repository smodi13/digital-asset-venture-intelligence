import { type ThesisDimension } from "@/lib/schemas/thesis-configuration";
import { type EntityType, type AssetType } from "@/lib/schemas/v7/company";
import { DA_UNDERWRITING_CRITERIA_WEIGHTS, DA_UNDERWRITING_CRITERION_IDS } from "./underwriting";

/**
 * Applicability model (PARALLEL / DORMANT - Phase 2B).
 *
 * Applicability and evidence coverage are DIFFERENT concepts. A criterion that
 * does not apply is NOT coverage 0.
 *
 *   applicable      normal rawAnchor and coverage mechanics
 *   not_applicable  rawAnchor = null; no coverage; excluded from the score
 *                   denominator AND the evidence-coverage denominator; carries
 *                   an explicit reason
 *   unknown         NOT silently excluded; stays in the denominator as an
 *                   unresolved-applicability / diligence gap; contributes no
 *                   positive score; remains distinguishable from not_applicable
 *
 * A criterion being absent because an entity has no token must not raise or
 * lower the score.
 */

export type ApplicabilityState = "applicable" | "not_applicable" | "unknown";

export interface ApplicabilityResult {
  state: ApplicabilityState;
  /** Required for not_applicable and unknown; empty for applicable. */
  reason: string;
}

export interface EntityShape {
  entityType: EntityType;
  assetType: AssetType;
}

/** True when the structure includes or commits to token exposure. */
function hasTokenExposure(a: AssetType): boolean {
  return a === "token" || a === "equity_and_token";
}

/**
 * Typed selectors, keyed by Underwriting criterion id. A criterion with no
 * selector is universally applicable.
 */
const APPLICABILITY_SELECTORS: Record<string, (e: EntityShape) => ApplicabilityResult> = {
  token_issuance_and_emissions: (e) => {
    if (hasTokenExposure(e.assetType)) return { state: "applicable", reason: "" };
    if (e.assetType === "unknown") {
      return { state: "unknown", reason: "Token exposure not established; token issuance and emissions cannot be assessed or excluded yet." };
    }
    return { state: "not_applicable", reason: `assetType "${e.assetType}" includes no token instrument or committed token exposure.` };
  },
  liquidity_quality_and_reflexivity: (e) => {
    const material = hasTokenExposure(e.assetType) || e.entityType === "protocol" || e.entityType === "network";
    if (material) return { state: "applicable", reason: "" };
    if (e.assetType === "unknown") {
      return { state: "unknown", reason: "Whether protocol or token liquidity is economically material is not established." };
    }
    return { state: "not_applicable", reason: "Neither protocol nor token liquidity is economically material to this equity-only company." };
  },
};

export function resolveApplicability(criterionId: string, entity: EntityShape): ApplicabilityResult {
  if (!DA_UNDERWRITING_CRITERION_IDS.has(criterionId)) {
    throw new Error(`[digital-asset applicability] unknown criterion "${criterionId}".`);
  }
  const selector = APPLICABILITY_SELECTORS[criterionId];
  return selector ? selector(entity) : { state: "applicable", reason: "" };
}

export interface CriterionScoreInput {
  criterionId: string;
  applicability: ApplicabilityState;
  /** null when not_applicable, or when the analyst set no anchor. */
  rawAnchor: number | null;
  /** 0, 0.5, or 1. Ignored for not_applicable and unknown. */
  coverage: number;
  /**
   * Deterministically computed evidence confidence for this criterion, 0-1.
   * Never analyst-entered (mirrors lib/scoring/criterion.ts CriterionResult.confidence).
   * Optional and defaulted to 0 so existing Underwriting callers, which never
   * supply this, are unaffected.
   */
  confidence?: number;
}

export interface DimensionRenormalization {
  dimension: ThesisDimension;
  /** Renormalized weights over applicable + unknown criteria; sums to 1 (or 0 when the whole dimension is not_applicable). */
  effectiveWeights: Record<string, number>;
  excludedNotApplicable: string[];
  unresolvedApplicability: string[];
  score: number;
  /** Evidence coverage over the applicable + unknown denominator only. */
  coverage: number;
  /** Coverage-weighted average of criterion confidence, mirroring lib/scoring/dimension.ts. 0 when coverage is 0. */
  confidence: number;
}

/**
 * Roll a dimension up with applicability-aware renormalization.
 *
 * not_applicable criteria are removed from both denominators. unknown criteria
 * stay in the denominator contributing neutral 50 at coverage 0 (a visible
 * diligence gap, never a silent exclusion and never a positive contribution).
 */
export function renormalizeDimension(
  dimension: ThesisDimension,
  criteria: readonly CriterionScoreInput[],
  baseWeights: Record<string, number> = DA_UNDERWRITING_CRITERIA_WEIGHTS[dimension],
): DimensionRenormalization {
  const byId = new Map(criteria.map((c) => [c.criterionId, c]));

  const excludedNotApplicable: string[] = [];
  const unresolvedApplicability: string[] = [];

  let denom = 0;
  const kept: string[] = [];
  for (const [criterionId, baseWeight] of Object.entries(baseWeights)) {
    const c = byId.get(criterionId);
    const state = c?.applicability ?? "unknown";
    if (state === "not_applicable") {
      excludedNotApplicable.push(criterionId);
      continue;
    }
    if (state === "unknown") unresolvedApplicability.push(criterionId);
    denom += baseWeight;
    kept.push(criterionId);
  }

  const effectiveWeights: Record<string, number> = {};
  for (const criterionId of kept) {
    effectiveWeights[criterionId] = denom > 0 ? (baseWeights[criterionId] ?? 0) / denom : 0;
  }

  let score = 0;
  let coverage = 0;
  let confNumerator = 0;
  let confDenominator = 0;
  for (const criterionId of kept) {
    const c = byId.get(criterionId);
    const w = effectiveWeights[criterionId] ?? 0;
    const applicable = c?.applicability === "applicable";
    const anchor = applicable ? c?.rawAnchor ?? null : null;
    const cov = applicable ? c?.coverage ?? 0 : 0;
    const conf = applicable ? c?.confidence ?? 0 : 0;
    // Neutral 50 fill for a null anchor / unknown applicability: no positive contribution.
    const internal = anchor === null ? 50 : 50 + cov * (anchor - 50);
    score += w * internal;
    coverage += w * cov;
    confNumerator += w * cov * conf;
    confDenominator += w * cov;
  }
  const confidence = confDenominator > 0 ? confNumerator / confDenominator : 0;

  return { dimension, effectiveWeights, excludedNotApplicable, unresolvedApplicability, score, coverage, confidence };
}
