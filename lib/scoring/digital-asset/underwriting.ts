import { type ThesisDimension } from "@/lib/schemas/thesis-configuration";
import { WEIGHT_SUM_TOLERANCE } from "./config";

/**
 * Digital-asset Underwriting registry (PARALLEL / DORMANT - Phase 2B).
 *
 * Exactly 39 criteria, brand-new ids that do NOT reuse any inherited v6
 * Underwriting id. PROVISIONAL equal within-dimension weights: 0.20 each for the
 * five-criterion dimensions, 1/6 each for the six-criterion dimensions. NOT
 * calibrated for digital assets.
 */

export const DA_UNDERWRITING_WEIGHTS_STATUS = "PROVISIONAL_DIGITAL_ASSET_V1_UNDERWRITING_WEIGHTS" as const;

export const DA_UNDERWRITING_CRITERIA_BY_DIMENSION: Record<ThesisDimension, readonly string[]> = {
  capital_efficiency: [
    "capital_deployment_productivity",
    "treasury_and_runway_quality",
    "financing_and_dilution_dependence",
    "token_issuance_and_emissions",
    "operating_resource_intensity",
  ],
  growth_momentum: [
    "fee_or_revenue_growth",
    "user_customer_and_workload_growth",
    "retention_and_repeat_usage",
    "developer_and_contributor_growth",
    "multi_period_adoption_durability",
  ],
  founder_alignment: [
    "team_domain_execution",
    "technical_and_protocol_depth",
    "governance_and_control_alignment",
    "incentive_and_ownership_alignment",
    "organizational_resilience_and_key_person_risk",
  ],
  market_quality: [
    "problem_urgency_and_willingness_to_pay_or_participate",
    "addressable_market_depth",
    "structural_tailwinds",
    "regulatory_and_jurisdiction_fit",
    "market_structure_and_liquidity_context",
    "expansion_surface_and_adjacent_markets",
  ],
  business_model_quality: [
    "value_capture_mechanism",
    "instrument_value_accrual_linkage",
    "margin_and_supply_side_economics",
    "economic_sustainability_without_subsidies",
    "liquidity_quality_and_reflexivity",
    "concentration_and_counterparty_risk",
  ],
  gtm_quality: [
    "structural_distribution_advantage",
    "developer_and_ecosystem_pull",
    "integration_depth_and_production_adoption",
    "acquisition_repeatability",
    "adoption_friction_and_compliance",
    "expansion_and_composability_motion",
  ],
  competitive_position: [
    "technical_and_product_differentiation",
    "security_architecture_and_audit_posture",
    "exploit_history_and_response",
    "switching_costs_and_workflow_embedment",
    "network_effects_and_participant_concentration",
    "forkability_commoditization_and_displacement",
  ],
};

function equalWeights(ids: readonly string[]): Record<string, number> {
  const w = 1 / ids.length;
  return Object.fromEntries(ids.map((id) => [id, w]));
}

export const DA_UNDERWRITING_CRITERIA_WEIGHTS: Record<ThesisDimension, Record<string, number>> =
  Object.fromEntries(
    Object.entries(DA_UNDERWRITING_CRITERIA_BY_DIMENSION).map(([dim, ids]) => [dim, equalWeights(ids)]),
  ) as Record<ThesisDimension, Record<string, number>>;

for (const [dimension, weights] of Object.entries(DA_UNDERWRITING_CRITERIA_WEIGHTS)) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new Error(`[digital-asset underwriting] ${dimension} weights must sum to 1. Received ${sum}.`);
  }
}

export const DA_UNDERWRITING_CRITERION_IDS: ReadonlySet<string> = new Set(
  Object.values(DA_UNDERWRITING_CRITERIA_BY_DIMENSION).flat(),
);

if (DA_UNDERWRITING_CRITERION_IDS.size !== 39) {
  throw new Error(`[digital-asset underwriting] expected 39 criteria, found ${DA_UNDERWRITING_CRITERION_IDS.size}.`);
}

/** Short definitions strengthening the Phase 2A tables around the final ids. */
export const DA_UNDERWRITING_CRITERION_SEMANTICS: Record<string, string> = {
  capital_deployment_productivity:
    "Durable output (revenue, protocol fees, protocol revenue, retained users) per dollar of primary capital consumed across the full capital history. FDV, TVL, and raise size are not output.",
  treasury_and_runway_quality:
    "Treasury composition and runway measured without marking tokens at peak prices; how operating expense is funded and for how long without selling tokens.",
  financing_and_dilution_dependence:
    "Reliance on continuous external financing or token sales to sustain operations, and the dilution path that implies.",
  token_issuance_and_emissions:
    "Where a token instrument exists or is committed: emission schedule, incentive spend, and whether growth survives as emissions taper. Not applicable to equity-only or network_no_token structures.",
  operating_resource_intensity:
    "Structural labor, compute, hardware, liquidity-provisioning, security, and compliance cost required for the system to keep working, and whether the Nth unit of scale costs less than the first.",
  fee_or_revenue_growth:
    "Multi-period growth in independently sourced revenue, protocol fees, or protocol revenue, denominated in units and not only USD.",
  user_customer_and_workload_growth:
    "Growth in distinct fee-payers, real users, or workloads, net of sybil and incentive inflation.",
  retention_and_repeat_usage:
    "Whether customers, integrations, and users persist and expand across 3/6/12-month cohorts rather than churning after incentives.",
  developer_and_contributor_growth:
    "Growth in active developers and code contributors and whether integrations built on the protocol stay live. Repository activity is not commercial traction.",
  multi_period_adoption_durability:
    "Whether momentum is sustained across at least three periods and survives removal of the single largest catalyst (airdrop, listing, one integration).",
  team_domain_execution:
    "Team and contributor history shipping in the relevant domain (protocol design, cryptography, the target industry). Pseudonymous continuity counts; prestige and investor backing do not.",
  technical_and_protocol_depth:
    "Independently assessable depth: code quality, mechanism design, hard problems solved, audits passed.",
  governance_and_control_alignment:
    "Who holds keys, admin, and upgrade rights; whether governance is functioning and accountable; whether a single point of control exists.",
  incentive_and_ownership_alignment:
    "Whether token/equity ownership, vesting, and incentive design align the team and large holders with long-term value rather than extraction.",
  organizational_resilience_and_key_person_risk:
    "Whether the organization survives the loss of any one person, and whether roles cover technical, economic, operating, and accountability responsibilities.",
  problem_urgency_and_willingness_to_pay_or_participate:
    "Whether a real, funded buyer or participant exists (protocol, enterprise, consumer) paying unsubsidized, and how urgent the problem is.",
  addressable_market_depth:
    "Bottom-up venture-scale depth of the reachable fee pool or value surface, not narrative TAM.",
  structural_tailwinds:
    "Secular shifts (regulatory clarity, institutional entry, a technical transition) that make this larger in three years independent of token price.",
  regulatory_and_jurisdiction_fit:
    "Jurisdictional exposure and regulatory trajectory as an underwriting question, carried into scoring rather than a hard gate.",
  market_structure_and_liquidity_context:
    "Where relevant, the market structure and liquidity conditions the product depends on, and their fragility.",
  expansion_surface_and_adjacent_markets:
    "Credible adjacent markets, chains, or use cases where expansion has already happened rather than only been planned.",
  value_capture_mechanism:
    "Whether the protocol or company captures value it creates: live fee capture, take rate, subscription, or a credibly governed path to one. A fee switch that is off but designed counts partially.",
  instrument_value_accrual_linkage:
    "Whether the investable instrument (equity or token) has a real, non-reflexive claim on the value the system creates.",
  margin_and_supply_side_economics:
    "Structural margin after all supply-side payouts, security spend, and incentives; whether contribution economics are positive ex-incentives.",
  economic_sustainability_without_subsidies:
    "Whether usage, yield, and activity persist when token emissions and incentives are removed.",
  liquidity_quality_and_reflexivity:
    "Where protocol or token liquidity is economically material: depth, stickiness, and exposure to reflexive price-liquidity-usage loops. Not applicable where liquidity is not material to the thesis.",
  concentration_and_counterparty_risk:
    "Concentration across customers, LPs, operators, chains, and counterparties, and the fragility that creates.",
  structural_distribution_advantage:
    "A structural distribution edge: default integration, a standard, an ecosystem position, wallet or L2 placement.",
  developer_and_ecosystem_pull:
    "Whether integrations and developers arrive without per-deal effort or paid incentives, and whether that compounds.",
  integration_depth_and_production_adoption:
    "Whether integrations are in production carrying real workloads rather than testnet, pilot, or announced.",
  acquisition_repeatability:
    "Whether someone other than a founder can land an integration or customer through a documented, repeatable motion.",
  adoption_friction_and_compliance:
    "Median time and friction from interest to production use, including keys, audits, liquidity, legal, compliance, and wallet UX.",
  expansion_and_composability_motion:
    "Whether usage and fees grow within an account or integration over time, and whether composability pulls in further integrations.",
  technical_and_product_differentiation:
    "Meaningful architecture, mechanism, economic, security, or UX differentiation, independently assessed where possible, from alternatives and forks. Whitepaper and self-benchmark claims are not proof.",
  security_architecture_and_audit_posture:
    "Security architecture appropriate to stage and value at risk; audit scope, recency, and firm quality. 'Audited' never means 'safe'.",
  exploit_history_and_response:
    "Any exploit or incident history and the quality of the response: disclosure, remediation, user restitution, and hardening.",
  switching_costs_and_workflow_embedment:
    "What it costs a top customer or integrator to leave, in dollars and weeks, and how embedded the product is in their critical path.",
  network_effects_and_participant_concentration:
    "Real network effects versus mercenary liquidity, and whether the operator, validator, or contributor base is diverse or concentrated.",
  forkability_commoditization_and_displacement:
    "Resistance to being forked, standardized away, absorbed by the base layer, or driven to zero-fee by competition; observed fork and vampire-attack outcomes.",
};

// Every criterion carries a definition.
for (const id of DA_UNDERWRITING_CRITERION_IDS) {
  if (!DA_UNDERWRITING_CRITERION_SEMANTICS[id]) {
    throw new Error(`[digital-asset underwriting] "${id}" has no definition.`);
  }
}
