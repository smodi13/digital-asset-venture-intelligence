import {
  ARCHETYPE_POINT_CONTRIBUTION,
  type BusinessModelArchetype,
} from "./config";

/**
 * Business model archetypes.
 *
 * ARCHETYPE-AWARE DOES NOT MEAN ARCHETYPE-NEUTRAL. An archetype contributes
 * zero points. It only names which economics and evidence are salient, so a
 * weak structure is not normalised upward for being normal for its type, and a
 * model is not judged against the wrong yardstick (an ad-supported model is
 * not a failed SaaS; a compute/inference model does not inherit SaaS margins).
 */

/** Always zero. Kept as a function so the rule is testable, not just asserted. */
export function archetypePointContribution(archetype: BusinessModelArchetype): number {
  void archetype;
  return ARCHETYPE_POINT_CONTRIBUTION;
}

/** Subcriteria that matter most for an archetype. Advisory only, never scored. */
export const ARCHETYPE_SALIENT_ECONOMICS: Record<BusinessModelArchetype, readonly string[]> = {
  subscription_software: ["revenue_recurrence", "retention_switching_economics", "margin_structure"],
  usage_consumption_software: ["usage_adoption_growth", "margin_structure", "retention_expansion"],
  compute_inference_infrastructure: [
    "capital_intensity_durability",
    "margin_or_contribution_economics",
    "operating_leverage",
  ],
  vertical_agent_services_hybrid: [
    "scalability_service_intensity",
    "margin_structure",
    "operating_leverage",
  ],
  outcome_priced_software: ["pricing_value_alignment", "customer_proof_win_evidence", "margin_structure"],
  data_operations: ["data_technical_workflow_advantage", "margin_structure", "concentration_regulatory_unit_risk"],
  advertising_supported: ["market_depth", "usage_adoption_growth", "concentration_regulatory_unit_risk"],
  transaction_marketplace: ["retention_expansion", "margin_or_contribution_economics", "distribution_advantage"],
  hybrid_other: [],
};
