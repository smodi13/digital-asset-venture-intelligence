import {
  SUBCRITERIA_WEIGHTS,
  DIMENSION_COVERAGE_THRESHOLDS,
  type CoverageValue,
} from "./config";
import type { ThesisDimension } from "@/lib/schemas/thesis-configuration";
import type { CriterionResult } from "./criterion";

/**
 * Dimension: weighted roll-up of its subcriteria.
 *
 * The score can exist internally at low coverage, but the display state stops
 * a thinly-evidenced number from masquerading as a real assessment.
 */

export type DimensionDisplayState = "INSUFFICIENT_EVIDENCE" | "PROVISIONAL" | "SCORED";

export interface DimensionResult {
  dimension: ThesisDimension;
  score: number;
  coverage: number;
  confidence: number;
  displayState: DimensionDisplayState;
}

export function scoreDimension(
  dimension: ThesisDimension,
  criteria: readonly CriterionResult[],
): DimensionResult {
  const weights = SUBCRITERIA_WEIGHTS[dimension];
  const byId = new Map(criteria.map((c) => [c.criterionId, c]));

  let score = 0;
  let coverage = 0;
  let confNumerator = 0;
  let confDenominator = 0;

  for (const [criterionId, weight] of Object.entries(weights)) {
    const c = byId.get(criterionId);
    const cov: CoverageValue = c?.coverage ?? 0;
    const internal = c?.internalAdjustedScore ?? 50;
    const confidence = c?.confidence ?? 0;

    score += weight * internal;
    coverage += weight * cov;
    confNumerator += weight * cov * confidence;
    confDenominator += weight * cov;
  }

  const confidence = confDenominator > 0 ? confNumerator / confDenominator : 0;

  let displayState: DimensionDisplayState;
  if (coverage < DIMENSION_COVERAGE_THRESHOLDS.insufficientBelow) {
    displayState = "INSUFFICIENT_EVIDENCE";
  } else if (coverage < DIMENSION_COVERAGE_THRESHOLDS.provisionalBelow) {
    displayState = "PROVISIONAL";
  } else {
    displayState = "SCORED";
  }

  return { dimension, score, coverage, confidence, displayState };
}
