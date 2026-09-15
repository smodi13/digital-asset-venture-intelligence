import { describe, it, expect } from "vitest";
import { evaluateRankEligibility } from "@/lib/scoring/rank-eligibility";
import { evaluateMandateEligibility } from "@/lib/scoring/mandate";
import { scoreThesisFit } from "@/lib/scoring/thesis-fit";
import { thesisDimensionSchema, type ThesisDimension } from "@/lib/schemas/thesis-configuration";
import type { DimensionResult } from "@/lib/scoring/dimension";

const DIMS = thesisDimensionSchema.options as ThesisDimension[];

function wellCovered(): DimensionResult[] {
  return DIMS.map((dimension) => ({
    dimension,
    score: 72,
    coverage: 1,
    confidence: 0.8,
    displayState: "SCORED" as const,
  }));
}

describe("rank eligibility (calibration defaults)", () => {
  const dimensions = wellCovered();
  const thesisFit = scoreThesisFit(dimensions);

  it("a fully covered eligible company is rank eligible", () => {
    const r = evaluateRankEligibility({ mandateEligibility: "ELIGIBLE", thesisFit, dimensions });
    expect(r.rankEligible).toBe(true);
  });

  // Case 33: a material entity-resolution conflict blocks rank eligibility.
  it("a material entity-identity conflict blocks ranking", () => {
    const r = evaluateRankEligibility({
      mandateEligibility: "ELIGIBLE",
      thesisFit,
      dimensions,
      conflicts: [{ scope: "entity_identity", severity: "material" }],
    });
    expect(r.rankEligible).toBe(false);
  });

  // Case 34: a minor non-investment identity discrepancy does not block ranking.
  it("a minor founding-year discrepancy does not block ranking", () => {
    const r = evaluateRankEligibility({
      mandateEligibility: "ELIGIBLE",
      thesisFit,
      dimensions,
      conflicts: [{ scope: "entity_identity", severity: "minor" }],
    });
    expect(r.rankEligible).toBe(true);
  });

  it("an ineligible mandate blocks ranking", () => {
    const mandate = evaluateMandateEligibility({ exclusionTriggered: true, hasSufficientEvidence: true });
    const r = evaluateRankEligibility({ mandateEligibility: mandate, thesisFit, dimensions });
    expect(r.rankEligible).toBe(false);
  });
});
