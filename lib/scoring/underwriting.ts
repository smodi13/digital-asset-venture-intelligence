import { SUBCRITERIA_WEIGHTS, RANK_ELIGIBILITY_CALIBRATION_DEFAULTS } from "./config";
import { thesisDimensionSchema } from "@/lib/schemas/thesis-configuration";
import { scoreThesisFit, type ThesisFitResult } from "./thesis-fit";
import { assertCriteriaMatchMode, type AnalyticalMode } from "./mode";
import type { DimensionResult } from "./dimension";

/**
 * Underwriting Thesis Fit: the existing 39-criterion framework, unchanged.
 *
 * This module adds nothing to the mechanics. It only tags the existing result
 * with mode "underwriting" and exposes the 39-criterion id set so mode guards
 * can reject foreign criteria. Dimension weights, subcriterion weights, raw
 * anchors, coverage semantics, confidence mechanics, freshness, contradiction
 * treatment, archetype rules, and RANK_ELIGIBILITY_CALIBRATION_DEFAULTS are
 * all consumed exactly as-is from ./config.
 */

export const UNDERWRITING_MODE: AnalyticalMode = "underwriting";

export const UNDERWRITING_DIMENSIONS = thesisDimensionSchema.options;

/** The 39 underwriting criterion ids, flattened from the approved weight table. */
export const UNDERWRITING_CRITERION_IDS: ReadonlySet<string> = new Set(
  Object.values(SUBCRITERIA_WEIGHTS).flatMap((w) => Object.keys(w)),
);

/** Underwriting rank-eligibility thresholds remain the calibration defaults. */
export const UNDERWRITING_RANK_ELIGIBILITY = RANK_ELIGIBILITY_CALIBRATION_DEFAULTS;

export interface UnderwritingThesisFitResult extends ThesisFitResult {
  mode: "underwriting";
}

export function scoreUnderwritingThesisFit(
  dimensions: readonly DimensionResult[],
  rankEligible = false,
): UnderwritingThesisFitResult {
  return { mode: "underwriting", ...scoreThesisFit(dimensions, rankEligible) };
}

/** Fail loud if any criterion id is not one of the 39 underwriting criteria. */
export function assertUnderwritingCriteria(criterionIds: readonly string[]): void {
  assertCriteriaMatchMode("underwriting", criterionIds, UNDERWRITING_CRITERION_IDS);
}
