import { z } from "zod";

/**
 * Analytical mode.
 *
 * Digital Asset Venture Intelligence has two Thesis Fit layers that are different analytical
 * objects, never interchangeable:
 *
 *  - "screening":   public-observable, top-of-funnel prioritization. Seven
 *                   dimensions, 14 criteria. Rank thresholds NOT calibrated.
 *  - "underwriting": the 39-criterion deep diligence framework. Seven
 *                   dimensions, 39 criteria. Calibration defaults unchanged.
 *
 * A Screening result and an Underwriting result must never be averaged
 * together, silently substituted for one another, compared without their mode
 * label, or persisted under an ambiguous generic score type. Every result
 * exposes its mode, and the guards below fail loud on any attempt to mix them.
 */

export const analyticalModeSchema = z.enum(["screening", "underwriting"]);
export type AnalyticalMode = z.infer<typeof analyticalModeSchema>;

/** A scoring result that carries its analytical mode. */
export interface ModeTagged {
  mode: AnalyticalMode;
}

export class ModeMismatchError extends Error {
  constructor(expected: AnalyticalMode, actual: unknown) {
    super(
      `analytical-mode mismatch: expected a "${expected}" result, received "${String(actual)}". ` +
        `Screening and Underwriting Thesis Fit are different analytical objects and are never interchangeable.`,
    );
    this.name = "ModeMismatchError";
  }
}

/** Throw unless `result.mode` is exactly `expected`. No silent substitution. */
export function assertResultMode<T extends ModeTagged>(result: T, expected: AnalyticalMode): T {
  if (result.mode !== expected) throw new ModeMismatchError(expected, (result as ModeTagged).mode);
  return result;
}

export class CriterionModeError extends Error {
  constructor(mode: AnalyticalMode, offending: readonly string[]) {
    super(
      `criteria [${offending.join(", ")}] are not part of the "${mode}" framework. ` +
        `The 14 Screening criteria and the 39 Underwriting criteria cannot be mixed into one result.`,
    );
    this.name = "CriterionModeError";
  }
}

/**
 * Throw unless every criterion id belongs to `mode`'s framework. This is what
 * stops the 14 Screening criteria from being fed to the 39-criterion
 * Underwriting calculator, and vice versa.
 */
export function assertCriteriaMatchMode(
  mode: AnalyticalMode,
  criterionIds: readonly string[],
  knownIds: ReadonlySet<string>,
): void {
  const offending = criterionIds.filter((id) => !knownIds.has(id));
  if (offending.length > 0) throw new CriterionModeError(mode, offending);
}
