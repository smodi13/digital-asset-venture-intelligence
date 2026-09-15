import { z } from "zod";

/**
 * Mandate Eligibility: a threshold question answered before Thesis Fit, never
 * traded off against it. This is a separate analytical output, not a score.
 */

export const mandateEligibilitySchema = z.enum([
  "ELIGIBLE",
  "INELIGIBLE",
  "INSUFFICIENT_EVIDENCE",
]);
export type MandateEligibility = z.infer<typeof mandateEligibilitySchema>;

export interface MandateInputs {
  /** A hard thesis exclusion is met (public, pre-revenue, founders departed...). */
  exclusionTriggered: boolean;
  /** Enough independent public evidence exists to answer the question at all. */
  hasSufficientEvidence: boolean;
}

export function evaluateMandateEligibility(inputs: MandateInputs): MandateEligibility {
  if (!inputs.hasSufficientEvidence) return "INSUFFICIENT_EVIDENCE";
  return inputs.exclusionTriggered ? "INELIGIBLE" : "ELIGIBLE";
}
