import { describe, it, expect } from "vitest";
import { scoreThesisFit } from "@/lib/scoring/thesis-fit";
import { evaluateRankEligibility } from "@/lib/scoring/rank-eligibility";
import { thesisDimensionSchema, type ThesisDimension } from "@/lib/schemas/thesis-configuration";
import type { DimensionResult } from "@/lib/scoring/dimension";

const DIMS = thesisDimensionSchema.options as ThesisDimension[];

function dim(dimension: ThesisDimension, over: Partial<DimensionResult> = {}): DimensionResult {
  return {
    dimension,
    score: 50,
    coverage: 0,
    confidence: 0,
    displayState: "INSUFFICIENT_EVIDENCE",
    ...over,
  };
}

describe("overall thesis fit", () => {
  // Case 4 + 5: sparse company with two exceptional dimensions and five unknown.
  it("is not rank eligible and does not display as a normal scored company", () => {
    const dimensions = DIMS.map((d, i) =>
      i < 2
        ? dim(d, { score: 95, coverage: 1, confidence: 0.9, displayState: "SCORED" })
        : dim(d),
    );
    const fit = scoreThesisFit(dimensions);
    expect(fit.displayState).toBe("INSUFFICIENT_EVIDENCE");

    const rank = evaluateRankEligibility({
      mandateEligibility: "ELIGIBLE",
      thesisFit: fit,
      dimensions,
    });
    expect(rank.rankEligible).toBe(false);
  });

  it("well-covered company reports PROVISIONAL until rank eligible", () => {
    const dimensions = DIMS.map((d) => dim(d, { score: 70, coverage: 1, confidence: 0.8, displayState: "SCORED" }));
    expect(scoreThesisFit(dimensions).displayState).toBe("PROVISIONAL");
    expect(scoreThesisFit(dimensions, true).displayState).toBe("RANK_ELIGIBLE");
  });
});
