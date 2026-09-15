import {
  THESIS_FIT_DIMENSION_WEIGHTS,
  DIMENSION_COVERAGE_THRESHOLDS,
  type CoverageValue,
} from "./config";
import {
  thesisDimensionSchema,
  WEIGHT_SUM_TOLERANCE,
  type ThesisDimension,
} from "@/lib/schemas/thesis-configuration";
import { assertCriteriaMatchMode, type AnalyticalMode } from "./mode";
import { screeningDisplayState } from "./screening-eligibility";
import { scoreCriterion, type AnalystCriterionAssessment, type CriterionResult } from "./criterion";
import type { ConfidenceResolutionInput } from "./confidence";
import type { DimensionResult, DimensionDisplayState } from "./dimension";

/**
 * Screening Thesis Fit: public-observable, top-of-funnel prioritization.
 *
 * Same seven top-level thesis dimensions and weights as Underwriting, but
 * exactly 14 criteria instead of 39. Screening exists because the 39-criterion
 * framework is UNDERWRITING-grade: a public outside-in sourcing pass cannot
 * cover it, as the first real-evidence calibration showed (no company in the
 * locked 10-company cohort reached the underwriting coverage thresholds). This
 * is NOT a reason to weaken the underwriting framework; it is a reason for a
 * separate, lighter screening framework.
 *
 * Screening reuses the shared scoring mechanics unchanged (raw anchors,
 * discrete coverage, deterministic confidence, effectiveReliability, neutral
 * 50 fill). It does NOT introduce a second confidence engine, and an analyst
 * never overrides confidence here either.
 *
 * Screening is not an investment recommendation. A strong Screening result
 * does not imply investment readiness, and low Underwriting coverage does not
 * invalidate a strong Screening result.
 */

export const SCREENING_MODE: AnalyticalMode = "screening";

/** Same weights as Underwriting. Screening shares the seven thesis dimensions. */
export const SCREENING_DIMENSION_WEIGHTS: Record<ThesisDimension, number> =
  THESIS_FIT_DIMENSION_WEIGHTS;

/**
 * The 14 Screening criteria, grouped by dimension. Each dimension's weights
 * sum to exactly 1. Validated on module load, like the underwriting table.
 */
export const SCREENING_CRITERIA_WEIGHTS: Record<ThesisDimension, Record<string, number>> = {
  capital_efficiency: {
    observable_scale_vs_primary_capital: 0.6,
    capital_intensity_delivery_signal: 0.4,
  },
  growth_momentum: {
    recent_operating_growth: 0.5,
    adoption_growth_and_durability: 0.5,
  },
  founder_alignment: {
    founder_problem_fit: 0.6,
    active_team_complementarity: 0.4,
  },
  market_quality: {
    demonstrated_budget_and_urgency: 0.5,
    market_breadth_and_expansion: 0.5,
  },
  business_model_quality: {
    monetization_recurrence_and_value_alignment: 0.5,
    cost_to_serve_and_scaling_risk: 0.5,
  },
  gtm_quality: {
    customer_proof: 0.5,
    distribution_repeatability_and_expansion: 0.5,
  },
  competitive_position: {
    differentiated_capability_or_workflow: 0.5,
    observed_defensibility_or_displacement: 0.5,
  },
};

for (const [dimension, weights] of Object.entries(SCREENING_CRITERIA_WEIGHTS)) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new Error(`[screening config] ${dimension} criteria weights must sum to exactly 1. Received ${sum}.`);
  }
}

/** The 14 Screening criterion ids. */
export const SCREENING_CRITERION_IDS: ReadonlySet<string> = new Set(
  Object.values(SCREENING_CRITERIA_WEIGHTS).flatMap((w) => Object.keys(w)),
);

/**
 * What each Screening criterion means. This is investment judgment made
 * explicit: an analyst maps sourced facts to a criterion, and that mapping is
 * the judgment. The underlying evidence stays identified by claim ids, and a
 * claim reused across criteria stays visible so evidence reuse is auditable.
 * Source independence and confidence are never multiplied by reuse.
 */
export const SCREENING_CRITERION_SEMANTICS: Record<string, string> = {
  observable_scale_vs_primary_capital:
    "Public evidence of operating scale relative to completed PRIMARY capital invested in the company. Secondary liquidity is not company capital. Unclosed financing is not company capital. Private ARR is not required if other credible operating-scale evidence exists, but revenue is never invented.",
  capital_intensity_delivery_signal:
    "Observable evidence of how much incremental labor, compute, infrastructure, working capital, or external capital the model appears to require. Not automatically negative: it identifies whether scaling economics look light, mixed, or structurally resource-intensive.",
  recent_operating_growth:
    "Recent credible evidence of revenue, customer, usage, transaction, or workload growth. A growth rate is never converted into an undisclosed absolute value.",
  adoption_growth_and_durability:
    "Evidence that adoption is broadening, deepening, repeating, or persisting rather than a one-time spike.",
  founder_problem_fit:
    "Sourced founder background or operating evidence directly relevant to the problem being solved. Prestige alone contributes zero.",
  active_team_complementarity:
    "Evidence the relevant founders remain active and that the observable team covers complementary technical, product, and commercial responsibilities.",
  demonstrated_budget_and_urgency:
    "Observed customer adoption, spending behavior, workflow criticality, or other concrete evidence that the problem attracts real budget and urgency. Marketing TAM statements alone do not count.",
  market_breadth_and_expansion:
    "Observable evidence that the product can address a broad market or expand across segments, use cases, workloads, geographies, or budgets.",
  monetization_recurrence_and_value_alignment:
    "Public evidence of recurring or repeat monetization, usage monetization, outcome pricing, advertising economics, transaction economics, or another model aligned with customer value. SaaS is not required.",
  cost_to_serve_and_scaling_risk:
    "Observable evidence about labor intensity, implementation requirements, inference or cloud costs, data acquisition, support burden, regulatory cost, or other scaling constraints. Unknown margins remain unknown.",
  customer_proof:
    "Concrete evidence of customers, deployments, workloads, usage, customer outcomes, or incumbent replacement. Famous logos alone are not enough.",
  distribution_repeatability_and_expansion:
    "Evidence of PLG, repeatable enterprise selling, partner or channel leverage, land-and-expand behavior, self-serve distribution, or another scalable acquisition path.",
  differentiated_capability_or_workflow:
    "Evidence the product, data, workflow, infrastructure, or operating model is meaningfully differentiated from alternatives.",
  observed_defensibility_or_displacement:
    "Evidence of switching, incumbent displacement, workflow embedment, repeat usage, proprietary advantage, or another observable durability signal. A claimed moat alone earns nothing.",
};

/**
 * VESTIGIAL - retired, do not calibrate. This object is a leftover of an
 * earlier composite-score / ranked-queue design. Phase 6A confirmed there is
 * no post-evidence Screening ranking architecture in Digital Asset Venture Intelligence and none is
 * planned: the calibrated Screening evidence-sufficiency gate
 * (SCREENING_EVIDENCE_SUFFICIENCY) defines a qualified opportunity set, and
 * Screening Thesis Fit stays continuous and ungated. It is retained only so
 * that code and tests can assert, explicitly, that Screening ranking is not an
 * active or planned policy. It must NOT be revived, calibrated, or replaced
 * with a Fit threshold or any other comparative gate.
 */
export const SCREENING_RANK_ELIGIBILITY_CALIBRATION_DEFAULTS = {
  retired: true as const,
  calibrated: false as const,
  status: "RETIRED - NO POST-EVIDENCE SCREENING RANKING ARCHITECTURE" as const,
  thresholds: null,
} as const;

/* -------------------------------------------------------------------------- */
/* Roll-ups: same weighted-mean mechanics as the underwriting engine.         */
/* -------------------------------------------------------------------------- */

/**
 * Score one Screening criterion. Reuses scoreCriterion unchanged: same raw
 * anchors, same deterministic confidence engine, no analyst confidence
 * override. The only screening-specific rule is the evidence standard: a
 * criterion supported ONLY by assumption/unknown evidence gets coverage 0, so
 * an assumption cannot manufacture factual coverage.
 */
export function scoreScreeningCriterion(
  assessment: AnalystCriterionAssessment,
  evidence: ConfidenceResolutionInput = { evidence: [] },
): CriterionResult {
  assertCriteriaMatchMode("screening", [assessment.criterionId], SCREENING_CRITERION_IDS);
  const hasRealEvidence = evidence.evidence.some(
    (e) => e.reliabilityClass !== "assumption" && e.reliabilityClass !== "unknown",
  );
  const effective: AnalystCriterionAssessment = hasRealEvidence
    ? assessment
    : { ...assessment, coverage: 0 };
  return scoreCriterion(effective, evidence);
}

export function scoreScreeningDimension(
  dimension: ThesisDimension,
  criteria: readonly CriterionResult[],
): DimensionResult {
  const weights = SCREENING_CRITERIA_WEIGHTS[dimension];
  assertCriteriaMatchMode("screening", criteria.map((c) => c.criterionId), SCREENING_CRITERION_IDS);
  const byId = new Map(criteria.map((c) => [c.criterionId, c]));

  let score = 0;
  let coverage = 0;
  let confNumerator = 0;
  let confDenominator = 0;

  for (const [criterionId, weight] of Object.entries(weights)) {
    const c = byId.get(criterionId);
    const cov: CoverageValue = c?.coverage ?? 0;
    const internal = c?.internalAdjustedScore ?? 50;
    const confidence = c?.confidence ?? 0;
    score += weight * internal;
    coverage += weight * cov;
    confNumerator += weight * cov * confidence;
    confDenominator += weight * cov;
  }

  const confidence = confDenominator > 0 ? confNumerator / confDenominator : 0;

  let displayState: DimensionDisplayState;
  if (coverage < DIMENSION_COVERAGE_THRESHOLDS.insufficientBelow) displayState = "INSUFFICIENT_EVIDENCE";
  else if (coverage < DIMENSION_COVERAGE_THRESHOLDS.provisionalBelow) displayState = "PROVISIONAL";
  else displayState = "SCORED";

  return { dimension, score, coverage, confidence, displayState };
}

export type ScreeningThesisFitDisplayState = "INSUFFICIENT_EVIDENCE" | "SCREENED";

export interface ScreeningThesisFitResult {
  mode: "screening";
  score: number;
  coverage: number;
  confidence: number;
  displayState: ScreeningThesisFitDisplayState;
  /** Always false in this phase: screening rank thresholds are not calibrated. */
  rankThresholdsCalibrated: false;
}

export function scoreScreeningThesisFit(
  dimensions: readonly DimensionResult[],
): ScreeningThesisFitResult {
  const byDimension = new Map(dimensions.map((d) => [d.dimension, d]));

  let score = 0;
  let coverage = 0;
  let confNumerator = 0;
  let confDenominator = 0;

  for (const dimension of thesisDimensionSchema.options as ThesisDimension[]) {
    const weight = SCREENING_DIMENSION_WEIGHTS[dimension];
    const d = byDimension.get(dimension);
    score += weight * (d?.score ?? 50);
    coverage += weight * (d?.coverage ?? 0);
    confNumerator += weight * (d?.coverage ?? 0) * (d?.confidence ?? 0);
    confDenominator += weight * (d?.coverage ?? 0);
  }

  const confidence = confDenominator > 0 ? confNumerator / confDenominator : 0;
  // Phase 5C-E display sufficiency rule: below 0.30 overall coverage, or with
  // fewer than 2 of 7 dimensions at >= 0.40 coverage, the result is dominated
  // by neutral-prior fills / concentrated in one area. No RANK_ELIGIBLE state:
  // screening rank thresholds are uncalibrated.
  const displayState: ScreeningThesisFitDisplayState = screeningDisplayState({
    overallEvidenceCoverage: coverage,
    dimensionCoverages: (thesisDimensionSchema.options as ThesisDimension[]).map(
      (d) => byDimension.get(d)?.coverage ?? 0,
    ),
  });

  return { mode: "screening", score, coverage, confidence, displayState, rankThresholdsCalibrated: false };
}

/** Fail loud if any criterion id is not one of the 14 screening criteria. */
export function assertScreeningCriteria(criterionIds: readonly string[]): void {
  assertCriteriaMatchMode("screening", criterionIds, SCREENING_CRITERION_IDS);
}
