import {
  RANK_ELIGIBILITY_CALIBRATION_DEFAULTS as CAL,
  THESIS_FIT_DIMENSION_WEIGHTS,
} from "./config";
import type { ThesisDimension } from "@/lib/schemas/thesis-configuration";
import type { MandateEligibility } from "./mandate";
import type { DimensionResult } from "./dimension";
import type { ThesisFitResult } from "./thesis-fit";

/**
 * Rank Eligibility.
 *
 * These thresholds are CALIBRATION_DEFAULTS, not finalized investment policy.
 * Priority calibration follows observation of the real 39-company
 * distributions, which does not happen in Phase 5B. This is a pure function
 * and is never invoked on the real corpus here.
 */

export type BlockingConflictScope =
  | "entity_identity"
  | "mandate_eligibility"
  | "investment_interpretation";

export interface BlockingConflict {
  scope: BlockingConflictScope;
  severity: "minor" | "material";
}

export interface RankEligibilityInputs {
  mandateEligibility: MandateEligibility;
  thesisFit: ThesisFitResult;
  dimensions: readonly DimensionResult[];
  conflicts?: readonly BlockingConflict[];
}

export interface RankEligibilityResult {
  rankEligible: boolean;
  /** Every calibration rule that failed. Empty when rankEligible is true. */
  failedRules: string[];
}

export function evaluateRankEligibility(inputs: RankEligibilityInputs): RankEligibilityResult {
  const { mandateEligibility, thesisFit, dimensions, conflicts = [] } = inputs;
  const failedRules: string[] = [];

  if (mandateEligibility !== "ELIGIBLE") {
    failedRules.push("mandate eligibility is not ELIGIBLE");
  }
  if (thesisFit.coverage < CAL.minOverallCoverage) {
    failedRules.push(`overall coverage ${thesisFit.coverage} below ${CAL.minOverallCoverage}`);
  }
  if (thesisFit.confidence < CAL.minOverallConfidence) {
    failedRules.push(`overall confidence ${thesisFit.confidence} below ${CAL.minOverallConfidence}`);
  }

  const atFloor = dimensions.filter((d) => d.coverage >= CAL.dimensionCoverageFloor).length;
  if (atFloor < CAL.minDimensionsAtCoverage) {
    failedRules.push(
      `only ${atFloor} dimensions at coverage ${CAL.dimensionCoverageFloor}, need ${CAL.minDimensionsAtCoverage}`,
    );
  }

  const byDimension = new Map(dimensions.map((d) => [d.dimension, d]));
  for (const [dimension, weight] of Object.entries(THESIS_FIT_DIMENSION_WEIGHTS)) {
    if (weight < CAL.heavyDimensionWeightThreshold) continue;
    const coverage = byDimension.get(dimension as ThesisDimension)?.coverage ?? 0;
    if (coverage < CAL.heavyDimensionCoverageFloor) {
      failedRules.push(
        `heavy dimension "${dimension}" coverage ${coverage} below ${CAL.heavyDimensionCoverageFloor}`,
      );
    }
  }

  // A material blocking conflict on identity, mandate, or interpretation blocks
  // ranking. A minor non-investment identity discrepancy (a disputed founding
  // year) does not.
  if (conflicts.some((c) => c.severity === "material")) {
    failedRules.push("a material blocking conflict is unresolved");
  }

  return { rankEligible: failedRules.length === 0, failedRules };
}
