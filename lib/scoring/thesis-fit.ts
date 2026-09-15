import { THESIS_FIT_DIMENSION_WEIGHTS, THESIS_DISPLAY_THRESHOLDS } from "./config";
import { thesisDimensionSchema, type ThesisDimension } from "@/lib/schemas/thesis-configuration";
import type { DimensionResult } from "./dimension";

/**
 * Overall Thesis Fit: weighted roll-up over the seven dimensions.
 *
 * Phase 5B does not run this on a real company. See lib/scoring/index.ts.
 */

export type ThesisFitDisplayState = "INSUFFICIENT_EVIDENCE" | "PROVISIONAL" | "RANK_ELIGIBLE";

export interface ThesisFitResult {
  score: number;
  coverage: number;
  confidence: number;
  displayState: ThesisFitDisplayState;
  dimensionsAtCoverageFloor: number;
}

export function scoreThesisFit(
  dimensions: readonly DimensionResult[],
  rankEligible = false,
): ThesisFitResult {
  const byDimension = new Map(dimensions.map((d) => [d.dimension, d]));

  let score = 0;
  let coverage = 0;
  let confNumerator = 0;
  let confDenominator = 0;

  for (const dimension of thesisDimensionSchema.options as ThesisDimension[]) {
    const weight = THESIS_FIT_DIMENSION_WEIGHTS[dimension];
    const d = byDimension.get(dimension);
    const dimScore = d?.score ?? 50;
    const dimCoverage = d?.coverage ?? 0;
    const dimConfidence = d?.confidence ?? 0;

    score += weight * dimScore;
    coverage += weight * dimCoverage;
    confNumerator += weight * dimCoverage * dimConfidence;
    confDenominator += weight * dimCoverage;
  }

  const confidence = confDenominator > 0 ? confNumerator / confDenominator : 0;
  const dimensionsAtCoverageFloor = dimensions.filter(
    (d) => d.coverage >= THESIS_DISPLAY_THRESHOLDS.dimensionCoverageFloor,
  ).length;

  let displayState: ThesisFitDisplayState;
  if (
    coverage < THESIS_DISPLAY_THRESHOLDS.insufficientCoverageBelow ||
    dimensionsAtCoverageFloor < THESIS_DISPLAY_THRESHOLDS.minDimensionsAtCoverage
  ) {
    displayState = "INSUFFICIENT_EVIDENCE";
  } else {
    displayState = rankEligible ? "RANK_ELIGIBLE" : "PROVISIONAL";
  }

  return { score, coverage, confidence, displayState, dimensionsAtCoverageFloor };
}
