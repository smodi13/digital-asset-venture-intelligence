import { thesisDimensionSchema, type ThesisDimension } from "@/lib/schemas/thesis-configuration";
import { renormalizeDimension, type DimensionRenormalization } from "./applicability";
import { DA_SCREENING_CRITERIA_WEIGHTS } from "./screening";
import {
  DA_THESIS_FIT_DIMENSION_WEIGHTS,
  DA_CRITICAL_DIMENSION_EVIDENCE_GUARD,
  DA_EVIDENCE_SUFFICIENCY_PROVISIONAL,
} from "./config";
import type { CompiledEntityAnalyticalInput } from "@/lib/judgments-v7/compile";

/**
 * Digital-asset aggregate Screening scorer (Phase 3C-2, PARALLEL / DORMANT).
 *
 * The first place a v7 Screening Thesis Fit becomes visible. Reuses the exact
 * renormalization algorithm implemented in applicability.ts (parameterized to
 * take Screening's own 2-per-dimension weights, DA_SCREENING_CRITERIA_WEIGHTS,
 * instead of the 39-criterion Underwriting weights that function already
 * served). No second scoring model: same neutral-50-fill, same
 * applicability-aware renormalization, same "N/A carries neither bonus nor
 * penalty" contract already proven by tests/scoring/digital-asset/applicability.test.ts.
 *
 * Confidence (Phase 3C-2.1) is a coverage-weighted roll-up of the per-criterion
 * confidence values a caller attaches to CriterionScoreInput.confidence (see
 * lib/scoring/digital-asset/evidence-confidence.ts for how that scalar is
 * computed deterministically from cited evidence, never fabricated and never
 * analyst-entered), mirroring lib/scoring/dimension.ts and
 * lib/scoring/thesis-fit.ts exactly. A caller that never attaches confidence
 * (confidence left undefined) gets 0 everywhere, never a fabricated positive
 * value.
 *
 * Rank eligibility structurally requires mandate eligibility
 * (lib/scoring/digital-asset/mandate.ts), and every CALIBRATION judgment
 * packet's mandateStatus is literal-locked to NOT_ASSESSED
 * (docs/digital-asset-v7-judgment-protocol.md section 10). Rank eligibility is
 * therefore reported as "NOT_ASSESSED", never fabricated as eligible or
 * ineligible.
 */

export type ScreeningDisplayState = "INSUFFICIENT_EVIDENCE" | "PROVISIONAL";

export interface EntityScreeningScore {
  entityId: string;
  candidateId: string;
  cohort: string;
  mandateStatus: string;
  dimensions: DimensionRenormalization[];
  thesisFit: number;
  overallCoverage: number;
  /** Coverage-weighted average of dimension confidence. 0 when overall coverage is 0; never fabricated. */
  overallConfidence: number;
  displayState: ScreeningDisplayState;
  dimensionsAtCoverageFloor: number;
  criticalDimensionGuard: {
    status: typeof DA_CRITICAL_DIMENSION_EVIDENCE_GUARD.status;
    dimensions: readonly string[];
    coverageByDimension: Record<string, number>;
    pass: boolean;
  };
  evidenceSufficiency: {
    thresholdsActive: boolean;
    minOverallCoverage: number;
    minOverallConfidence: number;
    minDimensionsAtFloor: number;
    dimensionCoverageFloor: number;
    overallCoveragePass: boolean;
    overallConfidencePass: boolean;
    dimensionBreadthPass: boolean;
    confidenceEvaluable: true;
    result: "MEETS_PROVISIONAL_THRESHOLD" | "BELOW_PROVISIONAL_THRESHOLD";
  };
  rankEligibility: "NOT_ASSESSED";
}

export function scoreScreeningEntity(entity: CompiledEntityAnalyticalInput): EntityScreeningScore {
  const dimensions = thesisDimensionSchema.options.map((dimension) => {
    const weightsForDimension = DA_SCREENING_CRITERIA_WEIGHTS[dimension];
    const criteriaIds = new Set(Object.keys(weightsForDimension));
    const criteriaForDimension = entity.criteria.filter((c) => criteriaIds.has(c.criterionId));
    return renormalizeDimension(dimension, criteriaForDimension, weightsForDimension);
  });
  const byDimension = new Map(dimensions.map((d) => [d.dimension, d]));

  let thesisFit = 0;
  let overallCoverage = 0;
  let confNumerator = 0;
  let confDenominator = 0;
  for (const [dimension, weight] of Object.entries(DA_THESIS_FIT_DIMENSION_WEIGHTS) as [ThesisDimension, number][]) {
    const d = byDimension.get(dimension)!;
    thesisFit += weight * d.score;
    overallCoverage += weight * d.coverage;
    confNumerator += weight * d.coverage * d.confidence;
    confDenominator += weight * d.coverage;
  }
  const overallConfidence = confDenominator > 0 ? confNumerator / confDenominator : 0;

  const dimensionsAtCoverageFloor = dimensions.filter(
    (d) => d.coverage >= DA_EVIDENCE_SUFFICIENCY_PROVISIONAL.dimensionCoverageFloor,
  ).length;
  const overallCoveragePass = overallCoverage >= DA_EVIDENCE_SUFFICIENCY_PROVISIONAL.minOverallCoverage;
  const overallConfidencePass = overallConfidence >= DA_EVIDENCE_SUFFICIENCY_PROVISIONAL.minOverallConfidence;
  const dimensionBreadthPass = dimensionsAtCoverageFloor >= DA_EVIDENCE_SUFFICIENCY_PROVISIONAL.minDimensionsAtFloor;

  const displayState: ScreeningDisplayState =
    overallCoveragePass && overallConfidencePass && dimensionBreadthPass ? "PROVISIONAL" : "INSUFFICIENT_EVIDENCE";

  const coverageByDimension: Record<string, number> = {};
  for (const dim of DA_CRITICAL_DIMENSION_EVIDENCE_GUARD.dimensions) {
    coverageByDimension[dim] = byDimension.get(dim as ThesisDimension)!.coverage;
  }
  const criticalGuardPass = DA_CRITICAL_DIMENSION_EVIDENCE_GUARD.dimensions.every((dim) => coverageByDimension[dim]! > 0);

  return {
    entityId: entity.entityId,
    candidateId: entity.candidateId,
    cohort: entity.cohort,
    mandateStatus: entity.mandateStatus,
    dimensions,
    thesisFit,
    overallCoverage,
    overallConfidence,
    displayState,
    dimensionsAtCoverageFloor,
    criticalDimensionGuard: {
      status: DA_CRITICAL_DIMENSION_EVIDENCE_GUARD.status,
      dimensions: DA_CRITICAL_DIMENSION_EVIDENCE_GUARD.dimensions,
      coverageByDimension,
      pass: criticalGuardPass,
    },
    evidenceSufficiency: {
      thresholdsActive: DA_EVIDENCE_SUFFICIENCY_PROVISIONAL.active,
      minOverallCoverage: DA_EVIDENCE_SUFFICIENCY_PROVISIONAL.minOverallCoverage,
      minOverallConfidence: DA_EVIDENCE_SUFFICIENCY_PROVISIONAL.minOverallConfidence,
      minDimensionsAtFloor: DA_EVIDENCE_SUFFICIENCY_PROVISIONAL.minDimensionsAtFloor,
      dimensionCoverageFloor: DA_EVIDENCE_SUFFICIENCY_PROVISIONAL.dimensionCoverageFloor,
      overallCoveragePass,
      overallConfidencePass,
      dimensionBreadthPass,
      confidenceEvaluable: true,
      result:
        overallCoveragePass && overallConfidencePass && dimensionBreadthPass
          ? "MEETS_PROVISIONAL_THRESHOLD"
          : "BELOW_PROVISIONAL_THRESHOLD",
    },
    rankEligibility: "NOT_ASSESSED",
  };
}
