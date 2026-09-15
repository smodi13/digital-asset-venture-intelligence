import { describe, it, expect } from "vitest";
import {
  evaluateScreeningEvidenceEligibility,
  type ScreeningEvidenceEligibilityInputs,
} from "@/lib/scoring/screening-eligibility";
import {
  SCREENING_CRITICAL_DIMENSION_EVIDENCE_GUARD,
  SCREENING_DISPLAY_SUFFICIENCY,
  SCREENING_EVIDENCE_SUFFICIENCY,
  RANK_ELIGIBILITY_CALIBRATION_DEFAULTS,
  THESIS_DISPLAY_THRESHOLDS,
} from "@/lib/scoring/config";
import { PRIORITY_THRESHOLDS_ACTIVE } from "@/lib/scoring/priority";

/**
 * Phase 5C-F-D: validation exposed that a company could become
 * screening-evidence-eligible with an entire 20%-weight Screening dimension at
 * zero evidence coverage. These tests prove the structural zero-coverage veto
 * on `capital_efficiency` and `growth_momentum` (dimension indexes 0 and 1) and
 * that it changes NO numeric threshold. Every input below is synthetic.
 */

// Dimension order: [capital_efficiency, growth_momentum, founder_alignment,
// market_quality, business_model_quality, gtm_quality, competitive_position].
const base = (over: Partial<ScreeningEvidenceEligibilityInputs> = {}): ScreeningEvidenceEligibilityInputs => ({
  mandateEligibility: "ELIGIBLE",
  overallEvidenceCoverage: 0.6,
  overallScoringConfidence: 0.7,
  dimensionCoverages: [0.6, 0.6, 0.6, 0.6, 0.6, 0, 0],
  ...over,
});

const evalGate = (over?: Partial<ScreeningEvidenceEligibilityInputs>) =>
  evaluateScreeningEvidenceEligibility(base(over));

describe("Phase 5C-F-D: critical-dimension zero-coverage guard", () => {
  it("guard config names the two critical dimensions explicitly", () => {
    expect(SCREENING_CRITICAL_DIMENSION_EVIDENCE_GUARD).toEqual({
      dimensions: ["capital_efficiency", "growth_momentum"],
      requireNonzeroCoverage: true,
    });
  });

  it("1. capital_efficiency coverage 0 => not eligible", () => {
    const r = evalGate({ dimensionCoverages: [0, 0.6, 0.6, 0.6, 0.6, 0, 0] });
    expect(r.screeningEvidenceEligible).toBe(false);
  });

  it("2. growth_momentum coverage 0 => not eligible", () => {
    const r = evalGate({ dimensionCoverages: [0.6, 0, 0.6, 0.6, 0.6, 0, 0] });
    expect(r.screeningEvidenceEligible).toBe(false);
  });

  it("3. both critical dimensions > 0 and every other gate passes => candidate true", () => {
    expect(evalGate().screeningEvidenceEligible).toBe(true);
  });

  it("4. capital_efficiency 0.000001 is structurally nonzero and passes this guard", () => {
    const r = evalGate({ dimensionCoverages: [0.000001, 0.6, 0.6, 0.6, 0.6, 0.6, 0] });
    expect(r.failedGates.some((g) => g.includes("capital_efficiency"))).toBe(false);
    // 0.000001 does not count toward the 0.50 breadth gate, so give breadth elsewhere.
    expect(r.screeningEvidenceEligible).toBe(true);
  });

  it("5. growth_momentum 0.000001 is structurally nonzero and passes this guard", () => {
    const r = evalGate({ dimensionCoverages: [0.6, 0.000001, 0.6, 0.6, 0.6, 0.6, 0] });
    expect(r.failedGates.some((g) => g.includes("growth_momentum"))).toBe(false);
    expect(r.screeningEvidenceEligible).toBe(true);
  });

  it("6. the guard imposes no 0.40 critical-dimension floor", () => {
    // capital 0.20 is below 0.40 but nonzero: guard must not fire.
    const r = evalGate({ dimensionCoverages: [0.2, 0.6, 0.6, 0.6, 0.6, 0, 0] });
    expect(r.failedGates.some((g) => g.includes("critical dimension"))).toBe(false);
  });

  it("7. Granola-style capital coverage 0.20 may pass", () => {
    const r = evalGate({ dimensionCoverages: [0.2, 0.6, 0.6, 0.6, 0.6, 0, 0] });
    expect(r.screeningEvidenceEligible).toBe(true);
  });

  it("8. LlamaIndex-style capital 0.30 / growth 0.25 may pass", () => {
    const r = evalGate({ dimensionCoverages: [0.3, 0.25, 0.6, 0.6, 0.6, 0.6, 0] });
    expect(r.screeningEvidenceEligible).toBe(true);
  });

  it("9. critical-dimension failure reason identifies the exact dimension", () => {
    const cap = evalGate({ dimensionCoverages: [0, 0.6, 0.6, 0.6, 0.6, 0, 0] });
    expect(cap.failedGates).toContain("critical dimension capital_efficiency has zero evidence coverage");
    const grw = evalGate({ dimensionCoverages: [0.6, 0, 0.6, 0.6, 0.6, 0, 0] });
    expect(grw.failedGates).toContain("critical dimension growth_momentum has zero evidence coverage");
  });

  it("10. both critical dimensions zero => both reasons are inspectable", () => {
    const r = evalGate({ dimensionCoverages: [0, 0, 0.6, 0.6, 0.6, 0.6, 0] });
    expect(r.failedGates).toContain("critical dimension capital_efficiency has zero evidence coverage");
    expect(r.failedGates).toContain("critical dimension growth_momentum has zero evidence coverage");
  });

  it("the critical-dimension reason is not collapsed into the breadth failure reason", () => {
    const r = evalGate({ dimensionCoverages: [0, 0.6, 0.6, 0.6, 0.6, 0, 0] });
    expect(r.failedGates.some((g) => g.startsWith("critical dimension"))).toBe(true);
  });

  it("11. Fit 40 / 60 / 90 remains irrelevant (evaluator reads no Fit)", () => {
    const a = evalGate({ dimensionCoverages: [0, 0.6, 0.6, 0.6, 0.6, 0, 0] });
    const b = evalGate({ dimensionCoverages: [0, 0.6, 0.6, 0.6, 0.6, 0, 0] });
    expect(a).toEqual(b);
    expect(SCREENING_EVIDENCE_SUFFICIENCY.minScreeningThesisFit).toBeNull();
  });

  it("12. numeric candidate thresholds are unchanged", () => {
    expect(SCREENING_EVIDENCE_SUFFICIENCY.minOverallCoverage).toBe(0.5);
    expect(SCREENING_EVIDENCE_SUFFICIENCY.minOverallConfidence).toBe(0.6);
    expect(SCREENING_EVIDENCE_SUFFICIENCY.dimensionCoverageFloor).toBe(0.5);
    expect(SCREENING_EVIDENCE_SUFFICIENCY.minDimensionsAtFloor).toBe(4);
    expect(SCREENING_EVIDENCE_SUFFICIENCY.minScreeningThesisFit).toBeNull();
  });

  it("13. display thresholds are unchanged", () => {
    expect(SCREENING_DISPLAY_SUFFICIENCY).toEqual({
      minOverallCoverage: 0.3,
      dimensionCoverageFloor: 0.4,
      minDimensionsAtFloor: 2,
    });
  });

  it("14 & 15. evidence-sufficiency gate is calibrated + active after final-test validation", () => {
    expect(SCREENING_EVIDENCE_SUFFICIENCY.active).toBe(true);
    expect(SCREENING_EVIDENCE_SUFFICIENCY.calibrated).toBe(true);
    expect(SCREENING_EVIDENCE_SUFFICIENCY.holdoutValidationCompleted).toBe(true);
    const r = evalGate();
    expect(r.evidenceThresholdsActive).toBe(true);
    expect(r.evidenceThresholdsCalibrated).toBe(true);
    expect(r.holdoutValidationCompleted).toBe(true);
    expect(r.status).toBe("CALIBRATED_ACTIVE_FINAL_TEST_VALIDATED");
  });

  it("15b. the critical-dimension guard stays a zero-coverage veto with no positive minimum", () => {
    expect(SCREENING_CRITICAL_DIMENSION_EVIDENCE_GUARD).toEqual({
      dimensions: ["capital_efficiency", "growth_momentum"],
      requireNonzeroCoverage: true,
    });
  });

  it("16. Priority remains inactive", () => {
    expect(PRIORITY_THRESHOLDS_ACTIVE).toBe(false);
  });

  it("17. Underwriting rank / display thresholds unchanged", () => {
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
});

/* -------------------------------------------------------------------------- */
/* Validation-cohort regression (synthetic, NOT a corpus import)              */
/* -------------------------------------------------------------------------- */

describe("Phase 5C-F-D: validation cohort => exactly 8 true / 7 false", () => {
  // Synthetic reconstruction of the already-reviewed Phase 5C-F-C aggregate.
  // Hand-built inputs, never imported from phase5c_f_validation_screening_results.json.
  // Rows that were ineligible for reasons OTHER than the new guard use a
  // pre-existing gate failure (here: confidence below 0.60). Serval and Dust
  // are eligible on every pre-existing gate and flip to false ONLY because
  // capital_efficiency evidence coverage is zero.
  const CAP_ZERO_DIMS = [0, 0.6, 0.6, 0.6, 0.6, 0, 0];

  const COHORT: Array<{
    name: string;
    input: ScreeningEvidenceEligibilityInputs;
    expect: boolean;
    guardReason?: string;
  }> = [
    { name: "ElevenLabs", input: base({ overallScoringConfidence: 0.55 }), expect: false },
    { name: "Mintlify", input: base(), expect: true },
    { name: "Retell AI", input: base(), expect: true },
    {
      name: "Serval",
      input: base({ dimensionCoverages: CAP_ZERO_DIMS }),
      expect: false,
      guardReason: "critical dimension capital_efficiency has zero evidence coverage",
    },
    { name: "Crosby", input: base(), expect: true },
    { name: "Linear", input: base(), expect: true },
    { name: "Granola", input: base({ dimensionCoverages: [0.2, 0.6, 0.6, 0.6, 0.6, 0, 0] }), expect: true },
    {
      name: "Dust",
      input: base({ dimensionCoverages: CAP_ZERO_DIMS }),
      expect: false,
      guardReason: "critical dimension capital_efficiency has zero evidence coverage",
    },
    { name: "Decagon", input: base({ overallScoringConfidence: 0.55 }), expect: false },
    { name: "Gamma", input: base(), expect: true },
    { name: "CrewAI", input: base(), expect: true },
    { name: "Listen Labs", input: base({ overallScoringConfidence: 0.55 }), expect: false },
    { name: "LlamaIndex", input: base({ dimensionCoverages: [0.3, 0.25, 0.6, 0.6, 0.6, 0.6, 0] }), expect: true },
    { name: "turbopuffer", input: base({ overallScoringConfidence: 0.55 }), expect: false },
    { name: "Pace", input: base({ overallScoringConfidence: 0.55 }), expect: false },
  ];

  // Guard against a final-test domain ever leaking into this fixture.
  const FINAL_TEST_DOMAINS = [
    "modal.com", "e2b.dev", "parallel.ai", "vercel.com", "resend.com", "lovable.dev",
    "assorthealth.com", "wisprflow.ai", "getbasis.ai", "exa.ai", "arcade.dev",
    "xbow.com", "braintrust.dev", "fal.ai",
  ];

  it("21. final-test domains never appear in the fixture", () => {
    const blob = JSON.stringify(COHORT.map((r) => r.name)).toLowerCase();
    for (const d of FINAL_TEST_DOMAINS) expect(blob).not.toContain(d);
  });

  for (const row of COHORT) {
    it(`${row.name}: candidate ${row.expect}`, () => {
      const r = evaluateScreeningEvidenceEligibility(row.input);
      expect(r.screeningEvidenceEligible).toBe(row.expect);
      if (row.guardReason) expect(r.failedGates).toContain(row.guardReason);
    });
  }

  it("18. aggregate is exactly 8 eligible / 7 ineligible", () => {
    const results = COHORT.map((r) => evaluateScreeningEvidenceEligibility(r.input));
    expect(results.filter((r) => r.screeningEvidenceEligible).length).toBe(8);
    expect(results.filter((r) => !r.screeningEvidenceEligible).length).toBe(7);
  });

  it("19 & 20. Serval and Dust flip true -> false ONLY because capital coverage is zero", () => {
    for (const name of ["Serval", "Dust"]) {
      const row = COHORT.find((r) => r.name === name)!;
      // With the zero replaced by nonzero coverage, every other gate passes.
      const repaired = evaluateScreeningEvidenceEligibility({
        ...row.input,
        dimensionCoverages: [0.6, 0.6, 0.6, 0.6, 0.6, 0, 0],
      });
      expect(repaired.screeningEvidenceEligible).toBe(true);
      const actual = evaluateScreeningEvidenceEligibility(row.input);
      expect(actual.screeningEvidenceEligible).toBe(false);
      expect(actual.failedGates).toEqual([
        "critical dimension capital_efficiency has zero evidence coverage",
      ]);
    }
  });
});
