import {
  type MandateEligibilityV7,
  type EvidenceSufficiencyV7,
} from "@/lib/schemas/v7/thesis-configuration";

/**
 * Digital-asset mandate evaluation (PARALLEL / DORMANT - Phase 2B).
 *
 * Mandate eligibility and evidence sufficiency are SEPARATE outputs.
 *
 *   - Insufficient public evidence is NOT a mandate exclusion. It never yields
 *     `ineligible`. It yields `unresolved` eligibility with `insufficient`
 *     evidence.
 *   - Pseudonymous teams are NOT automatically excluded.
 *   - No token is NOT an exclusion. Token existence is NOT positive.
 *   - Only a conclusive mandate conflict yields `ineligible`: no accessible
 *     investable instrument at all, credible fraud/scam evidence, a passive
 *     asset vehicle, pure speculative token exposure with no product/protocol/
 *     operating thesis, incidental blockchain marketing only, or a company
 *     clearly outside the defined early venture-stage scope.
 */

export interface DigitalAssetMandateInputs {
  /** A hard mandate exclusion is conclusively met. */
  hardExclusionTriggered: boolean;
  /** There is conclusively NO accessible investable instrument (distinct from "no token"). */
  noAccessibleInstrument: boolean;
  /** Enough public evidence exists to resolve entity type, asset type, and the load-bearing-blockchain question. */
  coreQuestionsResolvable: boolean;
}

export interface DigitalAssetMandateResult {
  eligibility: MandateEligibilityV7;
  evidenceSufficiency: EvidenceSufficiencyV7;
  /** True when applicability of the mandate itself could not be settled. */
  unresolvedMandate: boolean;
}

export function evaluateDigitalAssetMandate(
  inputs: DigitalAssetMandateInputs,
): DigitalAssetMandateResult {
  const evidenceSufficiency: EvidenceSufficiencyV7 = inputs.coreQuestionsResolvable
    ? "sufficient"
    : "insufficient";

  if (inputs.hardExclusionTriggered || inputs.noAccessibleInstrument) {
    return { eligibility: "ineligible", evidenceSufficiency, unresolvedMandate: false };
  }

  if (!inputs.coreQuestionsResolvable) {
    // Weak evidence never means INELIGIBLE. The mandate is simply unresolved.
    return { eligibility: "unresolved", evidenceSufficiency, unresolvedMandate: true };
  }

  return { eligibility: "eligible", evidenceSufficiency, unresolvedMandate: false };
}
