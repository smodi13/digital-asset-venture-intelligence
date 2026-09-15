import { describe, it, expect } from "vitest";
import {
  screeningDisplayState,
  evaluateScreeningEvidenceEligibility,
  evaluateScreeningEvidenceBarPreconditions,
  type ScreeningEvidenceEligibilityInputs,
} from "@/lib/scoring/screening-eligibility";
import {
  SCREENING_DISPLAY_SUFFICIENCY,
  SCREENING_EVIDENCE_SUFFICIENCY,
  RANK_ELIGIBILITY_CALIBRATION_DEFAULTS,
  THESIS_DISPLAY_THRESHOLDS,
} from "@/lib/scoring/config";
import { SCREENING_RANK_ELIGIBILITY_CALIBRATION_DEFAULTS } from "@/lib/scoring/screening";
import { PRIORITY_THRESHOLDS_ACTIVE } from "@/lib/scoring/priority";
import type { MandateEligibility } from "@/lib/scoring/mandate";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Seven dimension coverages: `n` of them at `hi`, the rest at `lo`. */
const dims = (n: number, hi: number, lo = 0): number[] =>
  Array.from({ length: 7 }, (_, i) => (i < n ? hi : lo));

const rank = (over: Partial<ScreeningEvidenceEligibilityInputs> = {}) =>
  evaluateScreeningEvidenceEligibility({
    mandateEligibility: "ELIGIBLE",
    overallEvidenceCoverage: 0.6,
    overallScoringConfidence: 0.7,
    dimensionCoverages: dims(4, 0.6),
    ...over,
  });

/* -------------------------------------------------------------------------- */
/* Display sufficiency rule                                                   */
/* -------------------------------------------------------------------------- */

describe("Phase 5C-E: screening display sufficiency", () => {
  it("frozen thresholds: coverage floor 0.30, breadth 2 dimensions at 0.40", () => {
    expect(SCREENING_DISPLAY_SUFFICIENCY).toEqual({
      minOverallCoverage: 0.3,
      dimensionCoverageFloor: 0.4,
      minDimensionsAtFloor: 2,
    });
  });

  it("1. coverage 0.29 => INSUFFICIENT_EVIDENCE", () => {
    expect(screeningDisplayState({ overallEvidenceCoverage: 0.29, dimensionCoverages: dims(7, 1) })).toBe(
      "INSUFFICIENT_EVIDENCE",
    );
  });

  it("2. coverage 0.30 with sufficient breadth => SCREENED", () => {
    expect(screeningDisplayState({ overallEvidenceCoverage: 0.3, dimensionCoverages: dims(2, 0.4) })).toBe(
      "SCREENED",
    );
  });

  it("3. only 1 dimension >= 0.40 => INSUFFICIENT_EVIDENCE", () => {
    expect(screeningDisplayState({ overallEvidenceCoverage: 0.9, dimensionCoverages: dims(1, 1) })).toBe(
      "INSUFFICIENT_EVIDENCE",
    );
  });

  it("4. 2 dimensions >= 0.40 and overall coverage >= 0.30 => SCREENED", () => {
    expect(screeningDisplayState({ overallEvidenceCoverage: 0.31, dimensionCoverages: dims(2, 0.45) })).toBe(
      "SCREENED",
    );
  });

  it("a dimension at exactly 0.39 does not count toward breadth", () => {
    expect(
      screeningDisplayState({ overallEvidenceCoverage: 0.5, dimensionCoverages: [0.39, 0.39, 0, 0, 0, 0, 0] }),
    ).toBe("INSUFFICIENT_EVIDENCE");
  });
});

/* -------------------------------------------------------------------------- */
/* Evidence-sufficiency gate                                               */
/* -------------------------------------------------------------------------- */

describe("Phase 5C-E: calibrated evidence-sufficiency gate", () => {
  it("frozen evidence-sufficiency thresholds (calibrated + active, Phase 5C-H)", () => {
    expect(SCREENING_EVIDENCE_SUFFICIENCY).toEqual({
      status: "CALIBRATED_ACTIVE_FINAL_TEST_VALIDATED",
      calibrated: true,
      active: true,
      holdoutValidationCompleted: true,
      minOverallCoverage: 0.5,
      minOverallConfidence: 0.6,
      dimensionCoverageFloor: 0.5,
      minDimensionsAtFloor: 4,
      minScreeningThesisFit: null,
    });
  });

  it("18. evidence-sufficiency gate is active after final-test validation", () => {
    expect(SCREENING_EVIDENCE_SUFFICIENCY.active).toBe(true);
    expect(rank().evidenceThresholdsActive).toBe(true);
  });

  it("19. evidence-sufficiency gate is calibrated and holdout-validated; rank thresholds stay uncalibrated", () => {
    expect(SCREENING_EVIDENCE_SUFFICIENCY.calibrated).toBe(true);
    expect(rank().evidenceThresholdsCalibrated).toBe(true);
    expect(rank().holdoutValidationCompleted).toBe(true);
    // Screening RANK thresholds remain UNSET / NOT CALIBRATED (ranking inactive).
    expect(SCREENING_RANK_ELIGIBILITY_CALIBRATION_DEFAULTS.calibrated).toBe(false);
    expect(SCREENING_RANK_ELIGIBILITY_CALIBRATION_DEFAULTS.thresholds).toBeNull();
  });

  it("confidence floor is 0.60, matching the underwriting confidence gate, not 0.65", () => {
    expect(SCREENING_EVIDENCE_SUFFICIENCY.minOverallConfidence).toBe(0.6);
    expect(SCREENING_EVIDENCE_SUFFICIENCY.minOverallConfidence).toBe(
      RANK_ELIGIBILITY_CALIBRATION_DEFAULTS.minOverallConfidence,
    );
  });

  it("there is no minimum Screening Thesis Fit requirement", () => {
    expect(SCREENING_EVIDENCE_SUFFICIENCY.minScreeningThesisFit).toBeNull();
  });

  it("a fully passing input is evidence-eligible", () => {
    const r = rank();
    expect(r.screeningEvidenceEligible).toBe(true);
    expect(r.failedGates).toEqual([]);
  });

  it("5. overall coverage 0.49 => not eligible", () => {
    expect(rank({ overallEvidenceCoverage: 0.49 }).screeningEvidenceEligible).toBe(false);
  });

  it("6. overall coverage 0.50 passes the coverage gate", () => {
    expect(
      rank({ overallEvidenceCoverage: 0.5, dimensionCoverages: dims(4, 0.5) }).screeningEvidenceEligible,
    ).toBe(true);
  });

  it("7. confidence 0.59 => not eligible", () => {
    expect(rank({ overallScoringConfidence: 0.59 }).screeningEvidenceEligible).toBe(false);
  });

  it("8. confidence 0.60 passes the confidence gate", () => {
    expect(rank({ overallScoringConfidence: 0.6 }).screeningEvidenceEligible).toBe(true);
  });

  it("9. 3 dimensions >= 0.50 => not eligible", () => {
    expect(rank({ dimensionCoverages: dims(3, 0.6) }).screeningEvidenceEligible).toBe(false);
  });

  it("10. 4 dimensions >= 0.50 passes the breadth gate", () => {
    expect(rank({ dimensionCoverages: dims(4, 0.5) }).screeningEvidenceEligible).toBe(true);
  });

  it("11-14. mandate gate: only ELIGIBLE can pass", () => {
    const bad: MandateEligibility[] = ["INELIGIBLE", "INSUFFICIENT_EVIDENCE"];
    for (const m of bad) {
      expect(rank({ mandateEligibility: m }).screeningEvidenceEligible).toBe(false);
    }
    expect(rank({ mandateEligibility: "ELIGIBLE" }).screeningEvidenceEligible).toBe(true);
  });

  it("15. a material blocking conflict => not eligible", () => {
    const r = rank({ conflicts: [{ scope: "entity_identity", severity: "material" }] });
    expect(r.screeningEvidenceEligible).toBe(false);
    expect(r.materialBlockingConflict).toBe(true);
  });

  it("16. a minor non-blocking conflict may still pass", () => {
    const r = rank({ conflicts: [{ scope: "entity_identity", severity: "minor" }] });
    expect(r.screeningEvidenceEligible).toBe(true);
    expect(r.materialBlockingConflict).toBe(false);
  });

  it("display INSUFFICIENT_EVIDENCE alone fails the candidate gate", () => {
    const r = rank({ overallEvidenceCoverage: 0.6, dimensionCoverages: dims(1, 1) });
    expect(r.displayState).toBe("INSUFFICIENT_EVIDENCE");
    expect(r.screeningEvidenceEligible).toBe(false);
    expect(r.failedGates).toContain("Screening display state is INSUFFICIENT_EVIDENCE");
  });
});

/* -------------------------------------------------------------------------- */
/* Phase 6D-B: non-mandate evidence-bar helper + composition                  */
/* -------------------------------------------------------------------------- */

describe("Phase 6D-B: evaluateScreeningEvidenceBarPreconditions", () => {
  const bar = (over: Partial<Parameters<typeof evaluateScreeningEvidenceBarPreconditions>[0]> = {}) =>
    evaluateScreeningEvidenceBarPreconditions({
      overallEvidenceCoverage: 0.6,
      overallScoringConfidence: 0.7,
      dimensionCoverages: dims(4, 0.6),
      ...over,
    });

  it("has no mandate input and never emits a mandate precondition", () => {
    const r = bar();
    expect(r.nonMandateEvidenceBarPass).toBe(true);
    expect(r.failedPreconditions).toEqual([]);
    for (const g of bar({ overallEvidenceCoverage: 0.1, dimensionCoverages: dims(0, 0) }).failedPreconditions) {
      expect(g.startsWith("mandate eligibility is")).toBe(false);
    }
  });

  it("reads the calibrated thresholds from config, not a second copy", () => {
    expect(bar({ overallEvidenceCoverage: 0.49 }).nonMandateEvidenceBarPass).toBe(false);
    expect(bar({ overallScoringConfidence: 0.59 }).nonMandateEvidenceBarPass).toBe(false);
    expect(bar({ dimensionCoverages: dims(3, 0.6) }).nonMandateEvidenceBarPass).toBe(false);
    expect(bar({ overallEvidenceCoverage: 0.5, dimensionCoverages: dims(4, 0.5) }).nonMandateEvidenceBarPass).toBe(true);
  });

  it("keeps the critical-dimension guard zero-only (no positive floor)", () => {
    // capital_efficiency at index 0, growth_momentum at index 1 (thesis order).
    const covs = [0.0001, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6];
    expect(bar({ dimensionCoverages: covs }).nonMandateEvidenceBarPass).toBe(true);
    covs[0] = 0;
    expect(bar({ dimensionCoverages: covs }).failedPreconditions).toContain(
      "critical dimension capital_efficiency has zero evidence coverage",
    );
  });

  it("has no minimum Screening Thesis Fit and no Fit input", () => {
    expect("minScreeningThesisFit" in SCREENING_EVIDENCE_SUFFICIENCY).toBe(true);
    expect(SCREENING_EVIDENCE_SUFFICIENCY.minScreeningThesisFit).toBeNull();
    const sig = evaluateScreeningEvidenceBarPreconditions.length;
    expect(sig).toBe(1); // single inputs object; no Fit parameter
  });
});

describe("Phase 6D-B: full evaluator composes the helper", () => {
  const cases: ScreeningEvidenceEligibilityInputs[] = [
    { mandateEligibility: "ELIGIBLE", overallEvidenceCoverage: 0.6, overallScoringConfidence: 0.7, dimensionCoverages: dims(4, 0.6) },
    { mandateEligibility: "INELIGIBLE", overallEvidenceCoverage: 0.6, overallScoringConfidence: 0.7, dimensionCoverages: dims(4, 0.6) },
    { mandateEligibility: "INSUFFICIENT_EVIDENCE", overallEvidenceCoverage: 0.42, overallScoringConfidence: 0.5, dimensionCoverages: dims(2, 0.3) },
    { mandateEligibility: "ELIGIBLE", overallEvidenceCoverage: 0.55, overallScoringConfidence: 0.62, dimensionCoverages: [0, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6] },
  ];

  it("full failedGates === mandate gate (if any) + helper.failedPreconditions verbatim", () => {
    for (const c of cases) {
      const full = evaluateScreeningEvidenceEligibility(c);
      const helper = evaluateScreeningEvidenceBarPreconditions(c);
      const mandateGate = c.mandateEligibility !== "ELIGIBLE"
        ? [`mandate eligibility is "${c.mandateEligibility}", not ELIGIBLE`]
        : [];
      expect(full.failedGates).toEqual([...mandateGate, ...helper.failedPreconditions]);
      expect(full.displayState).toBe(helper.displayState);
      expect(full.materialBlockingConflict).toBe(helper.materialBlockingConflict);
    }
  });

  it("still requires Mandate Eligibility: helper can pass while the full evaluator fails on mandate alone", () => {
    const input: ScreeningEvidenceEligibilityInputs = {
      mandateEligibility: "INSUFFICIENT_EVIDENCE",
      overallEvidenceCoverage: 0.6,
      overallScoringConfidence: 0.7,
      dimensionCoverages: dims(4, 0.6),
    };
    expect(evaluateScreeningEvidenceBarPreconditions(input).nonMandateEvidenceBarPass).toBe(true);
    const full = evaluateScreeningEvidenceEligibility(input);
    expect(full.screeningEvidenceEligible).toBe(false);
    expect(full.failedGates).toEqual(['mandate eligibility is "INSUFFICIENT_EVIDENCE", not ELIGIBLE']);
  });
});

/* -------------------------------------------------------------------------- */
/* Fit independence                                                           */
/* -------------------------------------------------------------------------- */

describe("Phase 5C-E: Screening Fit does not affect evidence eligibility", () => {
  it("17. Fit 40 / 60 / 90 produce identical evidence-eligibility output", () => {
    // The evaluator has no Fit input at all: the same evidence gates give the
    // same result regardless of any Fit value a caller might hold.
    const base = rank();
    [40, 60, 90].forEach(() => expect(rank()).toEqual(base));
    expect("minScreeningThesisFit" in SCREENING_EVIDENCE_SUFFICIENCY).toBe(true);
    expect(SCREENING_EVIDENCE_SUFFICIENCY.minScreeningThesisFit).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Mode separation                                                            */
/* -------------------------------------------------------------------------- */

describe("Phase 5C-E: mode separation", () => {
  it("21-22. underwriting rank thresholds and confidence floor are unchanged", () => {
    expect(RANK_ELIGIBILITY_CALIBRATION_DEFAULTS).toEqual({
      minOverallCoverage: 0.65,
      minOverallConfidence: 0.6,
      minDimensionsAtCoverage: 5,
      dimensionCoverageFloor: 0.5,
      heavyDimensionWeightThreshold: 0.15,
      heavyDimensionCoverageFloor: 0.35,
    });
    expect(THESIS_DISPLAY_THRESHOLDS).toEqual({
      insufficientCoverageBelow: 0.5,
      minDimensionsAtCoverage: 4,
      dimensionCoverageFloor: 0.4,
    });
  });

  it("20. priority remains inactive", () => {
    expect(PRIORITY_THRESHOLDS_ACTIVE).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Calibration-cohort mechanical regression (synthetic, NOT a corpus import)  */
/* -------------------------------------------------------------------------- */

describe("Phase 5C-E: calibration cohort regression fixture", () => {
  // Synthetic copies of the already-reviewed Phase 5C-D aggregate results.
  // NOT imported from phase5c_d_screening_results.json; hand-transcribed so a
  // silent change to that artifact cannot move this fixture. mandate ELIGIBLE
  // and no material conflict are assumed for every row (this phase does not
  // evaluate real mandate or conflict state).
  const COHORT: Array<{
    name: string;
    coverage: number;
    confidence: number;
    dimensionCoverages: number[];
    expectDisplay: "SCREENED" | "INSUFFICIENT_EVIDENCE";
    expectCandidate: boolean;
  }> = [
    { name: "Rillet", coverage: 0.3575, confidence: 0.7252, dimensionCoverages: [0.3, 0.5, 0.4, 0.25, 0.25, 0.75, 0], expectDisplay: "SCREENED", expectCandidate: false },
    { name: "Glean", coverage: 0.435, confidence: 0.7494, dimensionCoverages: [0, 1, 0.4, 0.5, 0.5, 0.5, 0], expectDisplay: "SCREENED", expectCandidate: false },
    { name: "Baseten", coverage: 0.4075, confidence: 0.7294, dimensionCoverages: [0.3, 1, 0.4, 0.25, 0, 0.5, 0], expectDisplay: "SCREENED", expectCandidate: false },
    { name: "Avoca", coverage: 0.2825, confidence: 0.7319, dimensionCoverages: [0.3, 0.25, 0.4, 0.25, 0, 0.75, 0], expectDisplay: "INSUFFICIENT_EVIDENCE", expectCandidate: false },
    { name: "Sierra", coverage: 0.5925, confidence: 0.7658, dimensionCoverages: [0.6, 1, 0.4, 0.75, 0, 1, 0], expectDisplay: "SCREENED", expectCandidate: true },
    { name: "OpenEvidence", coverage: 0.4675, confidence: 0.7644, dimensionCoverages: [0.6, 0.25, 0.4, 0.75, 0.5, 0.75, 0], expectDisplay: "SCREENED", expectCandidate: false },
    { name: "David AI", coverage: 0.06, confidence: 0.85, dimensionCoverages: [0, 0, 0.4, 0, 0, 0, 0], expectDisplay: "INSUFFICIENT_EVIDENCE", expectCandidate: false },
    // Phase 5C-F-D: capital_efficiency coverage 0 now vetoes the candidate gate.
    { name: "Canva", coverage: 0.56, confidence: 0.6536, dimensionCoverages: [0, 1, 0.4, 1, 0.5, 1, 0], expectDisplay: "SCREENED", expectCandidate: false },
    { name: "Browserbase", coverage: 0.675, confidence: 0.6613, dimensionCoverages: [1, 0.25, 0, 1, 1, 1, 0.75], expectDisplay: "SCREENED", expectCandidate: true },
    { name: "Applied Compute", coverage: 0.77, confidence: 0.7143, dimensionCoverages: [1, 0.25, 0.8, 1, 0.75, 1, 0.75], expectDisplay: "SCREENED", expectCandidate: true },
  ];

  for (const row of COHORT) {
    it(`${row.name}: display ${row.expectDisplay}, candidate ${row.expectCandidate}`, () => {
      const r = evaluateScreeningEvidenceEligibility({
        mandateEligibility: "ELIGIBLE",
        overallEvidenceCoverage: row.coverage,
        overallScoringConfidence: row.confidence,
        dimensionCoverages: row.dimensionCoverages,
      });
      expect(r.displayState).toBe(row.expectDisplay);
      expect(r.screeningEvidenceEligible).toBe(row.expectCandidate);
    });
  }

  it("evidence-sufficiency gate reports calibrated + active status; no rank state is produced", () => {
    for (const row of COHORT) {
      const r = evaluateScreeningEvidenceEligibility({
        mandateEligibility: "ELIGIBLE",
        overallEvidenceCoverage: row.coverage,
        overallScoringConfidence: row.confidence,
        dimensionCoverages: row.dimensionCoverages,
      });
      expect(r.status).toBe("CALIBRATED_ACTIVE_FINAL_TEST_VALIDATED");
      expect(r.evidenceThresholdsActive).toBe(true);
      expect(r.evidenceThresholdsCalibrated).toBe(true);
      // Fit-independent: the evaluator exposes no Screening Thesis Fit input.
      expect("overallScreeningThesisFit" in r).toBe(false);
    }
  });
});
