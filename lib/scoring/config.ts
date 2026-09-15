import { z } from "zod";
import { type ThesisDimension, WEIGHT_SUM_TOLERANCE } from "@/lib/schemas/thesis-configuration";

/**
 * Phase 5B scoring architecture configuration.
 *
 * These are stated numbers a reader can open, not weights buried in engine
 * code. Every table here is validated on module load: a table that does not
 * sum to exactly 1 throws before any function can read it. The approved
 * defaults are locked and must not be edited during implementation.
 *
 * Nothing in this phase scores a real company. See lib/scoring/index.ts.
 */

function assertSumsToOne(label: string, values: readonly number[]): void {
  const sum = values.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new Error(`[scoring config] ${label} must sum to exactly 1. Received ${sum}.`);
  }
}

/* -------------------------------------------------------------------------- */
/* Thesis Fit dimension weights (approved defaults)                           */
/* -------------------------------------------------------------------------- */

export const THESIS_FIT_DIMENSION_WEIGHTS: Record<ThesisDimension, number> = {
  capital_efficiency: 0.2,
  growth_momentum: 0.2,
  founder_alignment: 0.15,
  market_quality: 0.15,
  business_model_quality: 0.1,
  gtm_quality: 0.1,
  competitive_position: 0.1,
};
assertSumsToOne("thesis fit dimension weights", Object.values(THESIS_FIT_DIMENSION_WEIGHTS));

/* -------------------------------------------------------------------------- */
/* Subcriteria weights (approved defaults, each dimension sums to 1)          */
/* -------------------------------------------------------------------------- */

export const SUBCRITERIA_WEIGHTS: Record<ThesisDimension, Record<string, number>> = {
  capital_efficiency: {
    capital_productivity: 0.3,
    margin_or_contribution_economics: 0.2,
    cash_efficiency: 0.2,
    operating_leverage: 0.15,
    capital_intensity_durability: 0.15,
  },
  growth_momentum: {
    revenue_growth: 0.3,
    customer_growth: 0.15,
    retention_expansion: 0.2,
    usage_adoption_growth: 0.15,
    multi_period_durability: 0.2,
  },
  founder_alignment: {
    relevant_domain_experience: 0.25,
    technical_product_depth: 0.2,
    relevant_operating_experience: 0.2,
    differentiated_insight: 0.2,
    involvement_and_complementarity: 0.15,
  },
  market_quality: {
    real_budget_availability: 0.2,
    urgency_mission_criticality: 0.2,
    structural_growth: 0.2,
    market_depth: 0.15,
    durability_substitution_risk: 0.15,
    expansion_surface: 0.1,
  },
  business_model_quality: {
    margin_structure: 0.25,
    revenue_recurrence: 0.2,
    pricing_value_alignment: 0.15,
    scalability_service_intensity: 0.15,
    retention_switching_economics: 0.15,
    concentration_regulatory_unit_risk: 0.1,
  },
  gtm_quality: {
    distribution_advantage: 0.2,
    sales_efficiency_repeatability: 0.2,
    conversion_deployment_speed: 0.15,
    expansion_motion: 0.2,
    customer_proof_win_evidence: 0.15,
    scalable_distribution_leverage: 0.1,
  },
  competitive_position: {
    product_differentiation: 0.2,
    data_technical_workflow_advantage: 0.2,
    switching_embedment: 0.15,
    displacement_win_loss_evidence: 0.2,
    ecosystem_market_position: 0.1,
    commoditization_defense: 0.15,
  },
};
for (const [dimension, weights] of Object.entries(SUBCRITERIA_WEIGHTS)) {
  assertSumsToOne(`${dimension} subcriteria weights`, Object.values(weights));
}

/* -------------------------------------------------------------------------- */
/* Raw rubric anchors                                                         */
/* -------------------------------------------------------------------------- */

export const RAW_ANCHORS = [0, 25, 50, 75, 100] as const;
export type RawAnchor = (typeof RAW_ANCHORS)[number];
export const rawAnchorSchema = z.union([
  z.literal(0),
  z.literal(25),
  z.literal(50),
  z.literal(75),
  z.literal(100),
]);

/* -------------------------------------------------------------------------- */
/* Coverage (discrete)                                                        */
/* -------------------------------------------------------------------------- */

export const COVERAGE_VALUES = [0, 0.5, 1] as const;
export type CoverageValue = (typeof COVERAGE_VALUES)[number];
export const coverageSchema = z.union([z.literal(0), z.literal(0.5), z.literal(1)]);

/* -------------------------------------------------------------------------- */
/* Confidence: typed reliability classes                                      */
/* -------------------------------------------------------------------------- */

export const reliabilityClassSchema = z.enum([
  "regulatory_legal_fact",
  "independent_reported_fact",
  "direct_company_verifiable_fact",
  "customer_vendor_own_experience",
  "company_private_kpi",
  "investor_industry_evidence",
  "structured_third_party_estimate",
  "assumption",
  "unknown",
]);
export type ReliabilityClass = z.infer<typeof reliabilityClassSchema>;

export const RELIABILITY_CLASS: Record<ReliabilityClass, { base: number; cap: number }> = {
  regulatory_legal_fact: { base: 0.95, cap: 0.95 },
  independent_reported_fact: { base: 0.9, cap: 0.95 },
  direct_company_verifiable_fact: { base: 0.85, cap: 0.9 },
  customer_vendor_own_experience: { base: 0.75, cap: 0.85 },
  company_private_kpi: { base: 0.7, cap: 0.75 },
  investor_industry_evidence: { base: 0.6, cap: 0.75 },
  structured_third_party_estimate: { base: 0.5, cap: 0.7 },
  assumption: { base: 0, cap: 0 },
  unknown: { base: 0, cap: 0 },
};

/** Deterministic derived-claim confidence multiplier over its weakest input. */
export const DERIVED_CONFIDENCE_FACTOR = 0.95;

/* -------------------------------------------------------------------------- */
/* Factual contradiction factors                                             */
/* -------------------------------------------------------------------------- */

export const contradictionSeveritySchema = z.enum(["none", "minor", "material"]);
export type ContradictionSeverity = z.infer<typeof contradictionSeveritySchema>;
export const CONTRADICTION_FACTOR: Record<ContradictionSeverity, number> = {
  none: 1.0,
  minor: 0.85,
  material: 0.65,
};

/* -------------------------------------------------------------------------- */
/* Freshness (time-sensitive current-state evidence only). Configurable.      */
/* -------------------------------------------------------------------------- */

export interface FreshnessBand {
  maxAgeDays: number;
  factor: number;
}

export const DEFAULT_FRESHNESS_BANDS: readonly FreshnessBand[] = [
  { maxAgeDays: 180, factor: 1.0 },
  { maxAgeDays: 365, factor: 0.9 },
  { maxAgeDays: 730, factor: 0.75 },
  { maxAgeDays: Number.POSITIVE_INFINITY, factor: 0.5 },
];

/* -------------------------------------------------------------------------- */
/* Dimension / thesis display-state thresholds                                */
/* -------------------------------------------------------------------------- */

export const DIMENSION_COVERAGE_THRESHOLDS = {
  insufficientBelow: 0.4,
  provisionalBelow: 0.65,
} as const;

export const THESIS_DISPLAY_THRESHOLDS = {
  insufficientCoverageBelow: 0.5,
  minDimensionsAtCoverage: 4,
  dimensionCoverageFloor: 0.4,
} as const;

/* -------------------------------------------------------------------------- */
/* Underwriting comparative evidence eligibility (rank-eligibility calibration */
/* defaults): a deterministic Underwriting analytical-mode evidence gate, not  */
/* a company ranking, not the human Underwriting-entry decision, and not       */
/* finalized investment policy.                                                */
/* -------------------------------------------------------------------------- */

export const RANK_ELIGIBILITY_CALIBRATION_DEFAULTS = {
  minOverallCoverage: 0.65,
  minOverallConfidence: 0.6,
  minDimensionsAtCoverage: 5,
  dimensionCoverageFloor: 0.5,
  heavyDimensionWeightThreshold: 0.15,
  heavyDimensionCoverageFloor: 0.35,
} as const;

/* -------------------------------------------------------------------------- */
/* Screening display sufficiency + calibrated Screening evidence-sufficiency   */
/* gate. analyticalMode = "screening" ONLY. Underwriting unchanged. Neither is */
/* a ranking: this product has no conventional company leaderboard (6A).       */
/* -------------------------------------------------------------------------- */

/**
 * Screening display sufficiency rule. A Screening Thesis Fit is shown as
 * INSUFFICIENT_EVIDENCE when overall evidence coverage is below
 * minOverallCoverage, OR when fewer than minDimensionsAtFloor of the seven
 * Screening dimensions reach dimensionCoverageFloor. Below 0.30 overall the
 * framework is dominated by neutral-prior fills; the breadth rule stops a
 * company evidenced in a single analytical area from showing a normal result.
 * This is a display sufficiency rule, NOT a positive investment threshold.
 */
export const SCREENING_DISPLAY_SUFFICIENCY = {
  minOverallCoverage: 0.3,
  dimensionCoverageFloor: 0.4,
  minDimensionsAtFloor: 2,
} as const;

/**
 * Screening evidence-sufficiency gate. These numbers were frozen BEFORE any
 * holdout analysis and have now completed calibration (Phase 5C-D), holdout
 * validation (Phase 5C-F, which added the critical-dimension guard below), and
 * an untouched final-test holdout (Phase 5C-G) whose independent methodology
 * review returned PASS with no threshold change justified. As of Phase 5C-H the
 * gate is calibrated and active for future Screening workflows. NOT ONE numeric
 * threshold moved across calibration, validation, or final test; the final-test
 * results were not used for tuning.
 *
 * The gate decides only whether evidence is sufficient for comparative
 * screening, never whether a company is attractive: there is deliberately NO
 * minimum Screening Thesis Fit score, and none may be added (no minimum Fit, no
 * Fit-based rank eligibility, no top-N rule, no percentile qualification, no
 * strong/weak banding). Activation here does NOT activate conventional ranking,
 * Priority, Momentum, Convergence, or Underwriting entry.
 *
 * The confidence floor is 0.60 (not 0.65): consistent with the existing
 * scoring reliability architecture and the underwriting confidence gate
 * (RANK_ELIGIBILITY_CALIBRATION_DEFAULTS.minOverallConfidence). Screening
 * evidence is often high-quality company-reported metrics that may be
 * freshness-adjusted; coverage and dimensional breadth are the principal
 * protection against sparse evidence.
 */
export const SCREENING_EVIDENCE_SUFFICIENCY = {
  status: "CALIBRATED_ACTIVE_FINAL_TEST_VALIDATED",
  calibrated: true,
  active: true,
  holdoutValidationCompleted: true,
  minOverallCoverage: 0.5,
  minOverallConfidence: 0.6,
  dimensionCoverageFloor: 0.5,
  minDimensionsAtFloor: 4,
  minScreeningThesisFit: null,
} as const;

/**
 * Phase 5C-F-D structural guard. The 15-company validation holdout exposed that
 * a company could become candidate-evidence-eligible while an entire 20%-weight
 * Screening dimension had ZERO evidence coverage (Serval, Dust: capital
 * efficiency coverage 0.00), leaving that dimension filled entirely by the
 * neutral prior. `capital_efficiency` and `growth_momentum` carry the two
 * largest top-level Screening weights (0.20 each) and are named explicitly here
 * so a future weight change cannot silently alter eligibility methodology - the
 * list is NOT derived from weights.
 *
 * This is a ZERO-COVERAGE veto only: any evidence coverage strictly greater than
 * zero satisfies it. It imposes NO positive minimum (not 0.25 / 0.30 / 0.40 /
 * 0.50). The Phase 5C-G final-test holdout and its methodology review (PASS)
 * found no unexplained rejection from this guard and justified no positive
 * minimum, so it remains a zero-coverage veto. No frozen numeric threshold was
 * tuned by calibration, validation, or the final test.
 */
export const SCREENING_CRITICAL_DIMENSION_EVIDENCE_GUARD = {
  dimensions: ["capital_efficiency", "growth_momentum"],
  requireNonzeroCoverage: true,
} as const;

/* -------------------------------------------------------------------------- */
/* Temporal Momentum                                                          */
/* -------------------------------------------------------------------------- */

export const MOMENTUM_FAMILY_WEIGHTS = {
  operating_growth: 0.3,
  customer_adoption: 0.25,
  product_technical: 0.15,
  gtm_ecosystem: 0.15,
  risk_deterioration: 0.15,
} as const;
assertSumsToOne("momentum family weights", Object.values(MOMENTUM_FAMILY_WEIGHTS));
export type MomentumFamily = keyof typeof MOMENTUM_FAMILY_WEIGHTS;

export const IMPACT_ANCHOR = {
  minor: 0.25,
  meaningful: 0.5,
  major: 0.75,
  exceptional: 1.0,
} as const;
export type ImpactAnchor = keyof typeof IMPACT_ANCHOR;

/** Diminishing weights applied to the strongest surviving contributions. */
export const DIMINISHING_WEIGHTS = [1.0, 0.6, 0.35] as const;

export const DEFAULT_MOMENTUM_HALF_LIFE_DAYS = 180;

/* -------------------------------------------------------------------------- */
/* Signal Convergence                                                         */
/* -------------------------------------------------------------------------- */

export const CONVERGENCE_FAMILIES = [
  "operating_growth",
  "customer_adoption",
  "product_usage",
  "gtm_distribution",
  "competitive_displacement",
  "unit_economics",
  "risk_deterioration",
] as const;
export type ConvergenceFamily = (typeof CONVERGENCE_FAMILIES)[number];

/** A convergence family counts toward breadth only at or above this strength. */
export const CONVERGENCE_ACTIVE_THRESHOLD = 0.25;
export const CONVERGENCE_BREADTH_TARGET = 3;

/* -------------------------------------------------------------------------- */
/* Business model archetypes                                                  */
/* -------------------------------------------------------------------------- */

export const businessModelArchetypeSchema = z.enum([
  "subscription_software",
  "usage_consumption_software",
  "compute_inference_infrastructure",
  "vertical_agent_services_hybrid",
  "outcome_priced_software",
  "data_operations",
  "advertising_supported",
  "transaction_marketplace",
  "hybrid_other",
]);
export type BusinessModelArchetype = z.infer<typeof businessModelArchetypeSchema>;

/**
 * Archetype contributes exactly zero points. It only orients which economics
 * and evidence are relevant. Archetype-aware is not archetype-neutral: a weak
 * structure is not normalised upward because it is normal for the archetype.
 */
export const ARCHETYPE_POINT_CONTRIBUTION = 0;

/* -------------------------------------------------------------------------- */
/* Action Priority (enum only, no active thresholds; human-owned)            */
/* -------------------------------------------------------------------------- */

/**
 * Provisional action-priority workflow vocabulary. Priority is inactive
 * (PRIORITY_THRESHOLDS_ACTIVE === false) and human-owned: no deterministic
 * function produces one of these labels. `PASS` here is a workflow state
 * ("no analyst attention right now"), NOT a final investment PASS - a future
 * action-priority state and a final investment decision are distinct concepts.
 */
export const priorityStateSchema = z.enum([
  "OUT_OF_SCOPE",
  "RESEARCH",
  "ESCALATE",
  "MONITOR",
  "PASS",
]);
export type PriorityState = z.infer<typeof priorityStateSchema>;

/**
 * Facts that must never, alone, create a positive Thesis Fit, Momentum,
 * Convergence, or Priority result. Engines are tested against this list.
 */
export const FORBIDDEN_AUTOMATIC_POSITIVE_SIGNALS = [
  "total_funding",
  "funding_round_size",
  "investor_prestige",
  "valuation_alone",
  "founder_fame",
  "founder_followers",
  "company_followers",
  "social_virality",
  "article_count",
  "publication_repetition",
  "school_prestige",
  "geographic_prestige",
  "later_stage",
  "famous_customer_logo_without_operating_evidence",
] as const;
