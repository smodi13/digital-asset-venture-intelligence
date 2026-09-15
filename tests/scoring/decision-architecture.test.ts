import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SCREENING_EVIDENCE_SUFFICIENCY,
  SCREENING_CRITICAL_DIMENSION_EVIDENCE_GUARD,
  SCREENING_DISPLAY_SUFFICIENCY,
} from "@/lib/scoring/config";
import {
  evaluateScreeningEvidenceEligibility,
  type ScreeningEvidenceEligibilityInputs,
} from "@/lib/scoring/screening-eligibility";
import { SCREENING_RANK_ELIGIBILITY_CALIBRATION_DEFAULTS } from "@/lib/scoring/screening";
import { PRIORITY_THRESHOLDS_ACTIVE } from "@/lib/scoring/priority";
import * as scoringConfig from "@/lib/scoring/config";

/**
 * Phase 6B: locks the reconciled post-Screening decision architecture.
 *
 * Terminology was reconciled to evidence-sufficiency vocabulary; NO deterministic
 * behavior, threshold, or activation state changed.
 */

const inputs = (over: Partial<ScreeningEvidenceEligibilityInputs> = {}): ScreeningEvidenceEligibilityInputs => ({
  mandateEligibility: "ELIGIBLE",
  overallEvidenceCoverage: 0.6,
  overallScoringConfidence: 0.7,
  dimensionCoverages: [0.6, 0.6, 0.6, 0.6, 0, 0, 0],
  ...over,
});

describe("Phase 6B: evidence-sufficiency gate behavior is unchanged", () => {
  it("frozen thresholds", () => {
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
    expect(SCREENING_DISPLAY_SUFFICIENCY).toEqual({
      minOverallCoverage: 0.3,
      dimensionCoverageFloor: 0.4,
      minDimensionsAtFloor: 2,
    });
  });

  it("minimum Screening Thesis Fit stays null and the evaluator reads no Fit", () => {
    expect(SCREENING_EVIDENCE_SUFFICIENCY.minScreeningThesisFit).toBeNull();
    const r = evaluateScreeningEvidenceEligibility(inputs());
    expect("screeningThesisFit" in r).toBe(false);
    expect("overallScreeningThesisFit" in r).toBe(false);
    // No Fit input exists on the evaluator: identical inputs => identical output.
    expect(evaluateScreeningEvidenceEligibility(inputs())).toEqual(r);
  });

  it("critical-dimension guard is an unchanged zero-coverage veto", () => {
    expect(SCREENING_CRITICAL_DIMENSION_EVIDENCE_GUARD).toEqual({
      dimensions: ["capital_efficiency", "growth_momentum"],
      requireNonzeroCoverage: true,
    });
    expect(
      evaluateScreeningEvidenceEligibility(inputs({ dimensionCoverages: [0, 0.6, 0.6, 0.6, 0.6, 0, 0] }))
        .screeningEvidenceEligible,
    ).toBe(false);
  });

  it("gate reports calibrated + active status", () => {
    const r = evaluateScreeningEvidenceEligibility(inputs({ dimensionCoverages: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0] }));
    expect(r.evidenceThresholdsActive).toBe(true);
    expect(r.evidenceThresholdsCalibrated).toBe(true);
    expect(r.status).toBe("CALIBRATED_ACTIVE_FINAL_TEST_VALIDATED");
  });
});

describe("Phase 6B: nothing else is activated", () => {
  it("Action Priority remains inactive with no production decision function", () => {
    expect(PRIORITY_THRESHOLDS_ACTIVE).toBe(false);
    expect("evaluatePriority" in scoringConfig).toBe(false);
  });

  it("the vestigial Screening rank config is retired, not an active policy", () => {
    expect(SCREENING_RANK_ELIGIBILITY_CALIBRATION_DEFAULTS.retired).toBe(true);
    expect(SCREENING_RANK_ELIGIBILITY_CALIBRATION_DEFAULTS.calibrated).toBe(false);
    expect(SCREENING_RANK_ELIGIBILITY_CALIBRATION_DEFAULTS.thresholds).toBeNull();
  });

  it("no Trust engine or Trust score symbol exists in the scoring config", () => {
    for (const key of Object.keys(scoringConfig)) {
      expect(/trust/i.test(key)).toBe(false);
    }
  });

  it("config/scoring.yaml marks the composite Priority / Trust block RETIRED", () => {
    const yaml = readFileSync(join(process.cwd(), "config", "scoring.yaml"), "utf8");
    expect(yaml).toMatch(/RETIRED - vestigial composite-Priority/);
  });

  it("persisted score snapshots remain zero", () => {
    const snap = JSON.parse(
      readFileSync(join(process.cwd(), "data", "generated", "snapshots.json"), "utf8"),
    );
    expect(snap.recordCount).toBe(0);
    expect(snap.records).toEqual([]);
  });
});
