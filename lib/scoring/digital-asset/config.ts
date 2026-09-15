import { thesisDimensionSchema, type ThesisDimension } from "@/lib/schemas/thesis-configuration";

/**
 * Digital-asset scoring configuration (PARALLEL / DORMANT - Phase 2B).
 *
 * Every number here is a PROVISIONAL DIGITAL-ASSET V1 hypothesis. None has been
 * calibrated or validated on a digital-asset corpus. Calibration happens after
 * Phase 3 builds the digital-asset research universe and human judgment sets.
 *
 * The active v6 registries in lib/scoring/config.ts are unchanged.
 */

const WEIGHT_SUM_TOLERANCE = 1e-9;

function assertSumsToOne(label: string, values: readonly number[]): void {
  const sum = values.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new Error(`[digital-asset scoring config] ${label} must sum to 1. Received ${sum}.`);
  }
}

/** PROVISIONAL DIGITAL-ASSET V1 dimension weights. NOT calibrated. */
export const DA_THESIS_FIT_DIMENSION_WEIGHTS: Record<ThesisDimension, number> = {
  capital_efficiency: 0.2,
  growth_momentum: 0.2,
  founder_alignment: 0.15,
  market_quality: 0.15,
  business_model_quality: 0.1,
  gtm_quality: 0.1,
  competitive_position: 0.1,
};
assertSumsToOne("digital-asset dimension weights", Object.values(DA_THESIS_FIT_DIMENSION_WEIGHTS));

export const DA_DIMENSION_WEIGHTS_STATUS = "PROVISIONAL_DIGITAL_ASSET_V1_UNCALIBRATED" as const;

/**
 * PROVISIONAL DIGITAL-ASSET V1 critical dimensions. Zero-coverage veto only:
 * any evidence coverage strictly greater than zero satisfies it. No positive
 * minimum. The list is EXPLICIT, never derived from weights.
 *
 * The compound guard "growth_momentum AND (capital_efficiency OR
 * business_model_quality)" is NOT introduced yet.
 */
export const DA_CRITICAL_DIMENSION_EVIDENCE_GUARD = {
  status: "PROVISIONAL_DIGITAL_ASSET_V1" as const,
  calibrated: false as const,
  dimensions: ["capital_efficiency", "growth_momentum"] as const,
  requireNonzeroCoverage: true as const,
};

/**
 * PROVISIONAL / UNVALIDATED digital-asset evidence-bar thresholds.
 *
 * NOT ACTIVE. Not claimed calibrated. Not a positive investment threshold.
 * Present only so Phase 3 calibration has a starting point to move.
 *
 * Phase 3C-2.1 briefly changed minOverallCoverage to 0.35 on the claimed basis
 * that the dimension-breadth requirement below implies an overall-coverage
 * ceiling of (0.2+0.2+0.15+0.15) x 0.5 = 0.35. That derivation was incorrect:
 * the implemented breadth rule (screening-aggregate.ts dimensionsAtCoverageFloor
 * >= minDimensionsAtFloor) counts ANY minDimensionsAtFloor dimensions at the
 * floor, not a specific four, so the true minimum overall coverage the rule
 * can guarantee is the SMALLEST four-weight combination, 0.225, not the
 * largest. Phase 3C-2.2 corrected the error and reverted this value to 0.5.
 *
 * minOverallCoverage's role is classified as an independent, uncalibrated
 * global evidence bar (not a value mathematically derived from, or required
 * to equal, anything implied by the breadth rule): the two measure different
 * things (breadth of which dimensions have any real evidence vs. weighted
 * depth of overall evidence), and no methodology document states they must be
 * numerically coherent with each other. 0.5 carries exactly the same
 * (absence of) empirical support as any other placeholder in this object; it
 * is retained as the last value that was not attached to a disproven proof.
 * See local-artifacts/phase3c2-calibration/final-gate-proof/ for the full
 * algebraic audit (all 35 four-of-seven combinations enumerated).
 */
export const DA_EVIDENCE_SUFFICIENCY_PROVISIONAL = {
  status: "PROVISIONAL_UNVALIDATED_INACTIVE" as const,
  calibrated: false as const,
  active: false as const,
  minOverallCoverage: 0.5,
  minOverallConfidence: 0.6,
  dimensionCoverageFloor: 0.5,
  minDimensionsAtFloor: 4,
  minScreeningThesisFit: null,
} as const;

/**
 * Digital-asset forbidden automatic-positive registry.
 *
 * A later scoring engine is tested against this list. The active v6 registry in
 * lib/scoring/config.ts is NOT modified.
 */
export const DA_FORBIDDEN_AUTOMATIC_POSITIVE = [
  "funding",
  "ecosystem_funding",
  "token_launch",
  "token_price_appreciation",
  "fdv_or_market_cap_appreciation",
  "tvl_growth_alone",
  "github_stars",
  "repo_popularity",
  "emission_funded_activity",
  "article_count",
  "publication_repetition",
  "famous_logo_without_operating_evidence",
  "prestige",
] as const;
export type DaForbiddenAutomaticPositive = (typeof DA_FORBIDDEN_AUTOMATIC_POSITIVE)[number];

export const DA_DIMENSIONS = thesisDimensionSchema.options;
export { assertSumsToOne, WEIGHT_SUM_TOLERANCE };
