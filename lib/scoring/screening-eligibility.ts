import {
  SCREENING_CRITICAL_DIMENSION_EVIDENCE_GUARD,
  SCREENING_DISPLAY_SUFFICIENCY,
  SCREENING_EVIDENCE_SUFFICIENCY,
} from "./config";
import { thesisDimensionSchema } from "@/lib/schemas/thesis-configuration";
import type { MandateEligibility } from "./mandate";
import type { BlockingConflict } from "./rank-eligibility";

/**
 * Screening display sufficiency + the calibrated Screening evidence-sufficiency
 * gate.
 *
 * This is an EVIDENCE-SUFFICIENCY gate, not a ranking. It answers "do we have
 * enough evidence to responsibly compare and evaluate this company?" It reads
 * no Screening Thesis Fit score, produces no rank, and orders no companies.
 * Digital Asset Venture Intelligence does not implement a conventional numerical company leaderboard
 * (Phase 6A architecture decision); the calibrated gate below defines a
 * qualified opportunity set, nothing more.
 *
 * analyticalMode = "screening" ONLY. Nothing here touches Underwriting display
 * thresholds, the Underwriting deterministic rank-eligibility precondition, the
 * Underwriting confidence floor, or Underwriting dimension requirements.
 *
 * Two separate outputs, never combined into one trust score:
 *   - Evidence Coverage  = how complete the company analysis is.
 *   - Scoring Confidence = confidence IN the covered evidence (not a
 *     completeness percentage).
 *
 * The evidence-sufficiency gate answers "is the evidence sufficient for
 * comparative screening?", never "is the company attractive?". There is
 * deliberately no minimum Screening Thesis Fit score.
 *
 * Phase 5C-F-D: the 15-company validation holdout was reviewed and exposed one
 * structural flaw - a company could qualify with an entire 20%-weight dimension
 * at zero evidence coverage. A zero-coverage veto on the two critical dimensions
 * (capital_efficiency, growth_momentum) was added. No numeric threshold changed.
 *
 * Phase 5C-H: the untouched final-test holdout (Phase 5C-G) completed and its
 * independent methodology review returned PASS with no threshold change
 * justified. The gate is now calibrated and active
 * (SCREENING_EVIDENCE_SUFFICIENCY.active === true). Activation covers the
 * evidence-sufficiency gate only - not conventional ranking, Priority,
 * Momentum, Convergence, or Underwriting entry, all of which remain inactive.
 */

export type ScreeningDisplayState = "INSUFFICIENT_EVIDENCE" | "SCREENED";

export interface ScreeningDisplayInputs {
  overallEvidenceCoverage: number;
  /** Evidence coverage of each of the seven Screening dimensions. */
  dimensionCoverages: readonly number[];
}

/** Screening display sufficiency rule. See SCREENING_DISPLAY_SUFFICIENCY. */
export function screeningDisplayState(inputs: ScreeningDisplayInputs): ScreeningDisplayState {
  const { minOverallCoverage, dimensionCoverageFloor, minDimensionsAtFloor } =
    SCREENING_DISPLAY_SUFFICIENCY;
  if (inputs.overallEvidenceCoverage < minOverallCoverage) return "INSUFFICIENT_EVIDENCE";
  const atFloor = inputs.dimensionCoverages.filter((c) => c >= dimensionCoverageFloor).length;
  if (atFloor < minDimensionsAtFloor) return "INSUFFICIENT_EVIDENCE";
  return "SCREENED";
}

export interface ScreeningEvidenceEligibilityInputs {
  mandateEligibility: MandateEligibility;
  overallEvidenceCoverage: number;
  overallScoringConfidence: number;
  /** Evidence coverage of each of the seven Screening dimensions. */
  dimensionCoverages: readonly number[];
  /**
   * Unresolved blocking conflicts affecting entity identity, mandate
   * eligibility, or investment interpretation. A minor discrepancy does not
   * block; only a canonical `material` conflict does.
   */
  conflicts?: readonly BlockingConflict[];
}

/* -------------------------------------------------------------------------- */
/* Non-mandate evidence-bar preconditions                                     */
/* -------------------------------------------------------------------------- */

export interface ScreeningEvidenceBarPreconditionInputs {
  overallEvidenceCoverage: number;
  overallScoringConfidence: number;
  /** Evidence coverage of each of the seven Screening dimensions. */
  dimensionCoverages: readonly number[];
  conflicts?: readonly BlockingConflict[];
}

export interface ScreeningEvidenceBarPreconditionResult {
  /**
   * Every calibrated non-mandate evidence-bar precondition passes. This is NOT
   * full Screening evidence eligibility: it says nothing about Mandate
   * Eligibility, which is evaluated separately.
   */
  nonMandateEvidenceBarPass: boolean;
  /** Every non-mandate precondition that failed. Empty when all pass. */
  failedPreconditions: string[];
  displayState: ScreeningDisplayState;
  materialBlockingConflict: boolean;
}

/**
 * The single authoritative source for the non-mandate Screening evidence-bar
 * mechanics: display state SCREENED, overall coverage >= 0.50, overall
 * confidence >= 0.60, at least 4 of 7 dimensions at >= 0.50 coverage, both
 * critical dimensions (capital_efficiency, growth_momentum) at coverage > 0
 * (zero-only guard, no positive floor), and no material blocking conflict.
 *
 * No Screening Thesis Fit is read (there is deliberately no minimum Fit). The
 * calibrated thresholds live in config and are read here, not duplicated.
 * `evaluateScreeningEvidenceEligibility` composes this with the Mandate
 * Eligibility requirement.
 */
export function evaluateScreeningEvidenceBarPreconditions(
  inputs: ScreeningEvidenceBarPreconditionInputs,
): ScreeningEvidenceBarPreconditionResult {
  const C = SCREENING_EVIDENCE_SUFFICIENCY;
  const {
    overallEvidenceCoverage,
    overallScoringConfidence,
    dimensionCoverages,
    conflicts = [],
  } = inputs;
  const failedPreconditions: string[] = [];

  const displayState = screeningDisplayState({ overallEvidenceCoverage, dimensionCoverages });
  const materialBlockingConflict = conflicts.some((c) => c.severity === "material");

  if (displayState !== "SCREENED") {
    failedPreconditions.push("Screening display state is INSUFFICIENT_EVIDENCE");
  }
  if (overallEvidenceCoverage < C.minOverallCoverage) {
    failedPreconditions.push(
      `overall coverage ${overallEvidenceCoverage} below ${C.minOverallCoverage}`,
    );
  }
  if (overallScoringConfidence < C.minOverallConfidence) {
    failedPreconditions.push(
      `overall scoring confidence ${overallScoringConfidence} below ${C.minOverallConfidence}`,
    );
  }
  const atFloor = dimensionCoverages.filter((c) => c >= C.dimensionCoverageFloor).length;
  if (atFloor < C.minDimensionsAtFloor) {
    failedPreconditions.push(
      `only ${atFloor} dimensions at coverage ${C.dimensionCoverageFloor}, need ${C.minDimensionsAtFloor}`,
    );
  }
  if (materialBlockingConflict) {
    failedPreconditions.push("a material blocking conflict is unresolved");
  }

  // Phase 5C-F-D: zero-coverage veto on the two critical Screening dimensions.
  // A completely unobserved 20%-weight dimension (filled entirely by the neutral
  // prior) is not comparatively sufficient. Any coverage > 0 satisfies this;
  // there is no positive minimum. Dimension names are explicit, not weight-derived.
  if (SCREENING_CRITICAL_DIMENSION_EVIDENCE_GUARD.requireNonzeroCoverage) {
    for (const name of SCREENING_CRITICAL_DIMENSION_EVIDENCE_GUARD.dimensions) {
      const idx = thesisDimensionSchema.options.indexOf(name);
      if ((dimensionCoverages[idx] ?? 0) <= 0) {
        failedPreconditions.push(`critical dimension ${name} has zero evidence coverage`);
      }
    }
  }

  return {
    nonMandateEvidenceBarPass: failedPreconditions.length === 0,
    failedPreconditions,
    displayState,
    materialBlockingConflict,
  };
}

export interface ScreeningEvidenceEligibilityResult {
  /** Evidence is sufficient for comparative screening. NOT a rank, NOT an attractiveness verdict. */
  screeningEvidenceEligible: boolean;
  /** Every evidence-sufficiency gate that failed. Empty when eligible. */
  failedGates: string[];
  displayState: ScreeningDisplayState;
  materialBlockingConflict: boolean;
  /** Phase 5C-H: the evidence-sufficiency gate is calibrated and active. */
  evidenceThresholdsActive: true;
  /** Calibrated against the real corpus (Phase 5C-D) and final-test validated. */
  evidenceThresholdsCalibrated: true;
  /** Holdout validation (Phase 5C-F) and the final-test holdout (Phase 5C-G) completed. */
  holdoutValidationCompleted: true;
  status: typeof SCREENING_EVIDENCE_SUFFICIENCY.status;
}

/**
 * Evaluate the calibrated Screening evidence-sufficiency gate.
 *
 * Fit-independent by construction: no Screening Thesis Fit score is read, so
 * changing Fit alone (40 / 60 / 90) cannot change the output when coverage,
 * confidence, dimension breadth, mandate, and conflict status are unchanged.
 */
export function evaluateScreeningEvidenceEligibility(
  inputs: ScreeningEvidenceEligibilityInputs,
): ScreeningEvidenceEligibilityResult {
  const C = SCREENING_EVIDENCE_SUFFICIENCY;
  const {
    mandateEligibility,
    overallEvidenceCoverage,
    overallScoringConfidence,
    dimensionCoverages,
    conflicts = [],
  } = inputs;

  // Compose: Mandate Eligibility requirement + the one authoritative non-mandate
  // evidence-bar helper. The mandate gate is listed first, then the helper's
  // preconditions verbatim, so failedGates ordering is unchanged.
  const preconditions = evaluateScreeningEvidenceBarPreconditions({
    overallEvidenceCoverage,
    overallScoringConfidence,
    dimensionCoverages,
    conflicts,
  });

  const failedGates: string[] = [];
  if (mandateEligibility !== "ELIGIBLE") {
    failedGates.push(`mandate eligibility is "${mandateEligibility}", not ELIGIBLE`);
  }
  failedGates.push(...preconditions.failedPreconditions);

  return {
    screeningEvidenceEligible: failedGates.length === 0,
    failedGates,
    displayState: preconditions.displayState,
    materialBlockingConflict: preconditions.materialBlockingConflict,
    evidenceThresholdsActive: true,
    evidenceThresholdsCalibrated: true,
    holdoutValidationCompleted: true,
    status: C.status,
  };
}
