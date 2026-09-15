import { describe, it, expect } from "vitest";
import { stableHash } from "@/lib/hash/canonical";
import { DA_METHODOLOGY_FINGERPRINT, DA_CALIBRATION_CONFIG_FREEZE_FINGERPRINT } from "@/lib/judgments-v7/methodology-fingerprint";
import { DA_SCREENING_CRITERIA_WEIGHTS, DA_SCREENING_TO_UNDERWRITING } from "@/lib/scoring/digital-asset/screening";
import { DA_UNDERWRITING_CRITERIA_WEIGHTS } from "@/lib/scoring/digital-asset/underwriting";
import {
  DA_THESIS_FIT_DIMENSION_WEIGHTS,
  DA_CRITICAL_DIMENSION_EVIDENCE_GUARD,
  DA_FORBIDDEN_AUTOMATIC_POSITIVE,
  DA_EVIDENCE_SUFFICIENCY_PROVISIONAL,
} from "@/lib/scoring/digital-asset/config";
import { RELIABILITY_CLASS, CONTRADICTION_FACTOR, DERIVED_CONFIDENCE_FACTOR } from "@/lib/scoring/config";
import {
  DA_SOURCE_TYPE_RELIABILITY_CLASS,
  DA_COMPANY_ORIGIN_SOURCE_TYPES_ARRAY,
} from "@/lib/scoring/digital-asset/evidence-confidence";

/**
 * Phase 3C-2.2 section 14: proves the calibration config-freeze fingerprint
 * actually covers every input that can change v7 Screening scoring/confidence
 * output. Each test recomputes the SAME hash formula the live fingerprint uses,
 * with exactly one input mutated in a local copy (never the real registry),
 * and asserts the hash changes. No canonical file is mutated.
 */

function baseMethodology(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    kind: "digital_asset_v7_methodology_fingerprint",
    screeningWeights: DA_SCREENING_CRITERIA_WEIGHTS,
    screeningToUnderwriting: DA_SCREENING_TO_UNDERWRITING,
    underwritingWeights: DA_UNDERWRITING_CRITERIA_WEIGHTS,
    dimensionWeights: DA_THESIS_FIT_DIMENSION_WEIGHTS,
    criticalDimensionGuard: DA_CRITICAL_DIMENSION_EVIDENCE_GUARD,
    forbiddenAutomaticPositive: DA_FORBIDDEN_AUTOMATIC_POSITIVE,
    ...overrides,
  };
}

function baseFreeze(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    kind: "digital_asset_v7_calibration_config_freeze",
    methodologyFingerprint: DA_METHODOLOGY_FINGERPRINT,
    evidenceSufficiencyProvisional: DA_EVIDENCE_SUFFICIENCY_PROVISIONAL,
    confidenceAdapterSourceTypeReliabilityClass: DA_SOURCE_TYPE_RELIABILITY_CLASS,
    confidenceAdapterCompanyOriginSourceTypes: DA_COMPANY_ORIGIN_SOURCE_TYPES_ARRAY,
    reliabilityClassTable: RELIABILITY_CLASS,
    contradictionFactor: CONTRADICTION_FACTOR,
    derivedConfidenceFactor: DERIVED_CONFIDENCE_FACTOR,
    ...overrides,
  };
}

describe("v7 calibration config-freeze fingerprint coverage (synthetic mutation, no canonical file touched)", () => {
  it("reproduces the live fingerprints from the same inputs (sanity check on the test's own formula)", () => {
    expect(stableHash(baseMethodology())).toBe(DA_METHODOLOGY_FINGERPRINT);
    expect(stableHash(baseFreeze())).toBe(DA_CALIBRATION_CONFIG_FREEZE_FINGERPRINT);
  });

  it("a changed minOverallCoverage changes the freeze fingerprint", () => {
    const mutated = stableHash(
      baseFreeze({ evidenceSufficiencyProvisional: { ...DA_EVIDENCE_SUFFICIENCY_PROVISIONAL, minOverallCoverage: 0.999 } }),
    );
    expect(mutated).not.toBe(DA_CALIBRATION_CONFIG_FREEZE_FINGERPRINT);
  });

  it("a changed minOverallConfidence changes the freeze fingerprint", () => {
    const mutated = stableHash(
      baseFreeze({ evidenceSufficiencyProvisional: { ...DA_EVIDENCE_SUFFICIENCY_PROVISIONAL, minOverallConfidence: 0.999 } }),
    );
    expect(mutated).not.toBe(DA_CALIBRATION_CONFIG_FREEZE_FINGERPRINT);
  });

  it("a changed dimension weight changes both fingerprints", () => {
    const mutatedWeights = { ...DA_THESIS_FIT_DIMENSION_WEIGHTS, capital_efficiency: 0.999 };
    expect(stableHash(baseMethodology({ dimensionWeights: mutatedWeights }))).not.toBe(DA_METHODOLOGY_FINGERPRINT);
    const mutatedMethodology = stableHash(baseMethodology({ dimensionWeights: mutatedWeights }));
    expect(stableHash(baseFreeze({ methodologyFingerprint: mutatedMethodology }))).not.toBe(DA_CALIBRATION_CONFIG_FREEZE_FINGERPRINT);
  });

  it("a changed confidence adapter source-type mapping changes the freeze fingerprint", () => {
    const mutated = stableHash(
      baseFreeze({ confidenceAdapterSourceTypeReliabilityClass: { ...DA_SOURCE_TYPE_RELIABILITY_CLASS, block_explorer: "assumption" } }),
    );
    expect(mutated).not.toBe(DA_CALIBRATION_CONFIG_FREEZE_FINGERPRINT);
  });

  it("a changed confidence-math registry (reliability class base) changes the freeze fingerprint", () => {
    const mutated = stableHash(
      baseFreeze({
        reliabilityClassTable: { ...RELIABILITY_CLASS, regulatory_legal_fact: { base: 0.01, cap: 0.01 } },
      }),
    );
    expect(mutated).not.toBe(DA_CALIBRATION_CONFIG_FREEZE_FINGERPRINT);
  });

  it("a changed critical-dimension guard rule changes both fingerprints", () => {
    const mutatedGuard = { ...DA_CRITICAL_DIMENSION_EVIDENCE_GUARD, requireNonzeroCoverage: false as const };
    expect(stableHash(baseMethodology({ criticalDimensionGuard: mutatedGuard }))).not.toBe(DA_METHODOLOGY_FINGERPRINT);
  });
});
