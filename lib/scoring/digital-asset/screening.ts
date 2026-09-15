import { type ThesisDimension } from "@/lib/schemas/thesis-configuration";
import { WEIGHT_SUM_TOLERANCE } from "./config";
import { DA_UNDERWRITING_CRITERION_IDS } from "./underwriting";

/**
 * Digital-asset Screening registry (PARALLEL / DORMANT - Phase 2B).
 *
 * 14 criteria, exactly two per dimension, brand-new ids that do NOT reuse any
 * inherited v6 Screening id. Equal within-dimension weights (0.50 / 0.50),
 * labelled PROVISIONAL DIGITAL-ASSET V1 SCREENING WEIGHTS. NOT calibrated.
 */

export const DA_SCREENING_WEIGHTS_STATUS = "PROVISIONAL_DIGITAL_ASSET_V1_SCREENING_WEIGHTS" as const;

export const DA_SCREENING_CRITERIA_WEIGHTS: Record<ThesisDimension, Record<string, number>> = {
  capital_efficiency: {
    observable_scale_vs_capital: 0.5,
    operating_resource_intensity: 0.5,
  },
  growth_momentum: {
    adoption_and_usage_momentum: 0.5,
    developer_and_ecosystem_momentum: 0.5,
  },
  founder_alignment: {
    team_execution_credibility: 0.5,
    governance_and_incentive_alignment: 0.5,
  },
  market_quality: {
    problem_urgency_and_market_depth: 0.5,
    structural_and_regulatory_fit: 0.5,
  },
  business_model_quality: {
    value_capture_model: 0.5,
    economic_sustainability: 0.5,
  },
  gtm_quality: {
    distribution_and_integration_pull: 0.5,
    adoption_friction_and_ecosystem_access: 0.5,
  },
  competitive_position: {
    technical_and_product_differentiation: 0.5,
    defensibility_security_and_network_effects: 0.5,
  },
};

for (const [dimension, weights] of Object.entries(DA_SCREENING_CRITERIA_WEIGHTS)) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new Error(`[digital-asset screening] ${dimension} weights must sum to 1. Received ${sum}.`);
  }
}

export const DA_SCREENING_CRITERION_IDS: ReadonlySet<string> = new Set(
  Object.values(DA_SCREENING_CRITERIA_WEIGHTS).flatMap((w) => Object.keys(w)),
);

/**
 * What each digital-asset Screening criterion means. A properly sourced network
 * or token metric may be cited as evidence, but raw metrics never move a score:
 * the analyst maps evidence to a rubric anchor and coverage, and that mapping is
 * the judgment.
 */
export const DA_SCREENING_CRITERION_SEMANTICS: Record<string, string> = {
  observable_scale_vs_capital:
    "Public evidence of product/network/operating scale relative to primary capital consumed (equity, token proceeds, grants). Secondary/token-market liquidity is not company capital; unclosed financing is not capital. Token FDV and market cap are never scale.",
  operating_resource_intensity:
    "Observable recurring labor, compute, infrastructure, liquidity/incentive subsidy, or external capital the model appears to need to sustain growth. Not automatically negative; identifies whether scaling economics look light, mixed, or structurally resource-intensive.",
  adoption_and_usage_momentum:
    "Recent credible evidence that real usage, fee-paying customers, transactions, workloads, or retained cohorts are growing and persisting rather than spiking on incentives. A growth rate is never converted into an undisclosed absolute.",
  developer_and_ecosystem_momentum:
    "Evidence that developers, contributors, and third-party integrations are growing and staying live. Repository activity alone never establishes commercial traction; stars/forks establish nothing.",
  team_execution_credibility:
    "Sourced or demonstrated founder/contributor background and shipped work directly relevant to the problem. Pseudonymous track record with continuity counts. Prestige alone contributes zero. Pseudonymous teams are not automatically excluded.",
  governance_and_incentive_alignment:
    "Evidence that control (keys, admin, upgrade rights), governance, and incentive/ownership structure are accountable and aligned with long-term value rather than extraction or reflexive token appreciation.",
  problem_urgency_and_market_depth:
    "Concrete evidence the problem attracts real, funded budget and urgency (fees paid, workflow criticality, integrations that cost the integrator to build) and that the reachable market is venture-scale. TAM statements alone do not count.",
  structural_and_regulatory_fit:
    "Whether market structure, jurisdictional exposure, and regulatory trajectory create an opening or a hostile environment. Jurisdiction quality is carried here into scoring, never into a hard geographic gate.",
  value_capture_model:
    "Public evidence of a recurring or repeat monetization path aligned to value delivered: protocol fees, take rate, subscription, usage or outcome pricing, or a credible designed path to one. A token buyback-and-burn is not revenue. `network_no_token` must show company-side capture or an honest 'not captured'.",
  economic_sustainability:
    "Whether observable economics hold without perpetual subsidy: contribution economics after supply-side payouts and incentives, burn versus output, reliance on continuous token sales to fund operations.",
  distribution_and_integration_pull:
    "Evidence of a scalable acquisition path: developer self-serve, repeatable enterprise/protocol sales, composability-driven pull, land-and-expand, integrations begetting integrations. Paid/incentivized integrations are not organic pull.",
  adoption_friction_and_ecosystem_access:
    "Time and friction from interest to production use (keys, audits, liquidity, compliance, wallet UX) and how reachable the product is within the ecosystems that matter.",
  technical_and_product_differentiation:
    "Evidence, independently assessed where possible, that the architecture, mechanism, economics, security, or UX is meaningfully differentiated from alternatives and forks. Whitepaper and self-benchmark claims are not proof.",
  defensibility_security_and_network_effects:
    "Evidence of durability: switching costs, liquidity depth that stays, operator/validator base, ecosystem/network effects, security posture and audit history, regulatory position, or observed resistance to forks and vampire attacks. Mercenary TVL is not a moat.",
};

/**
 * Screening -> Underwriting mapping (Phase 2B section 16).
 *
 * Every Screening criterion maps to one or more of the 39 digital-asset
 * Underwriting criteria. Validated below: every target id must exist in the
 * Underwriting registry.
 */
export const DA_SCREENING_TO_UNDERWRITING: Record<string, readonly string[]> = {
  observable_scale_vs_capital: ["capital_deployment_productivity", "treasury_and_runway_quality", "financing_and_dilution_dependence"],
  operating_resource_intensity: [
    "operating_resource_intensity",
    "margin_and_supply_side_economics",
    "token_issuance_and_emissions",
  ],
  adoption_and_usage_momentum: [
    "user_customer_and_workload_growth",
    "retention_and_repeat_usage",
    "multi_period_adoption_durability",
    "fee_or_revenue_growth",
  ],
  developer_and_ecosystem_momentum: ["developer_and_contributor_growth", "developer_and_ecosystem_pull"],
  team_execution_credibility: [
    "team_domain_execution",
    "technical_and_protocol_depth",
    "organizational_resilience_and_key_person_risk",
  ],
  governance_and_incentive_alignment: ["governance_and_control_alignment", "incentive_and_ownership_alignment"],
  problem_urgency_and_market_depth: [
    "problem_urgency_and_willingness_to_pay_or_participate",
    "addressable_market_depth",
    "expansion_surface_and_adjacent_markets",
  ],
  structural_and_regulatory_fit: [
    "structural_tailwinds",
    "regulatory_and_jurisdiction_fit",
    "market_structure_and_liquidity_context",
  ],
  value_capture_model: ["value_capture_mechanism", "instrument_value_accrual_linkage"],
  economic_sustainability: [
    "economic_sustainability_without_subsidies",
    "margin_and_supply_side_economics",
    "liquidity_quality_and_reflexivity",
    "concentration_and_counterparty_risk",
  ],
  distribution_and_integration_pull: [
    "structural_distribution_advantage",
    "acquisition_repeatability",
    "expansion_and_composability_motion",
  ],
  adoption_friction_and_ecosystem_access: ["adoption_friction_and_compliance", "integration_depth_and_production_adoption"],
  technical_and_product_differentiation: [
    "technical_and_product_differentiation",
    "security_architecture_and_audit_posture",
  ],
  defensibility_security_and_network_effects: [
    "switching_costs_and_workflow_embedment",
    "network_effects_and_participant_concentration",
    "forkability_commoditization_and_displacement",
    "exploit_history_and_response",
  ],
};

// Validate the mapping on module load.
for (const [screeningId, targets] of Object.entries(DA_SCREENING_TO_UNDERWRITING)) {
  if (!DA_SCREENING_CRITERION_IDS.has(screeningId)) {
    throw new Error(`[digital-asset mapping] "${screeningId}" is not a Screening criterion.`);
  }
  if (targets.length === 0) {
    throw new Error(`[digital-asset mapping] "${screeningId}" maps to no Underwriting criterion.`);
  }
  for (const target of targets) {
    if (!DA_UNDERWRITING_CRITERION_IDS.has(target)) {
      throw new Error(`[digital-asset mapping] "${screeningId}" -> unknown Underwriting id "${target}".`);
    }
  }
}
for (const screeningId of DA_SCREENING_CRITERION_IDS) {
  if (!(screeningId in DA_SCREENING_TO_UNDERWRITING)) {
    throw new Error(`[digital-asset mapping] Screening criterion "${screeningId}" has no Underwriting mapping.`);
  }
}
