import { describe, it, expect } from "vitest";
import { scoreDimension } from "@/lib/scoring/dimension";
import { SUBCRITERIA_WEIGHTS } from "@/lib/scoring/config";
import type { CriterionResult } from "@/lib/scoring/criterion";

function crit(id: string, over: Partial<CriterionResult> = {}): CriterionResult {
  return {
    criterionId: id,
    internalAdjustedScore: 50,
    effectiveReliability: 0,
    coverage: 0,
    confidence: 0,
    displayStatus: "INSUFFICIENT_EVIDENCE",
    ...over,
  };
}

const CE_SUBS = Object.keys(SUBCRITERIA_WEIGHTS.capital_efficiency);

describe("dimension calculation", () => {
  // Case 3: a missing metric does not create a zero dimension.
  it("a null subcriterion fills neutral 50 internally, never zero", () => {
    const criteria = CE_SUBS.map((id, i) =>
      i === 0
        ? crit(id) // capital_productivity unknown
        : crit(id, { internalAdjustedScore: 75, coverage: 1, confidence: 0.8, displayStatus: "SCORED" }),
    );
    const r = scoreDimension("capital_efficiency", criteria);
    expect(r.score).toBeGreaterThan(50); // not dragged toward zero
    expect(r.coverage).toBeCloseTo(0.7, 10); // 0.3 weight uncovered
    expect(r.displayState).toBe("SCORED");
  });

  it("weighted mean confidence is taken over covered criteria only", () => {
    const criteria = CE_SUBS.map((id, i) =>
      crit(id, {
        internalAdjustedScore: 60,
        coverage: i < 3 ? 1 : 0,
        confidence: i < 3 ? 0.9 : 0,
        displayStatus: i < 3 ? "SCORED" : "INSUFFICIENT_EVIDENCE",
      }),
    );
    const r = scoreDimension("capital_efficiency", criteria);
    expect(r.confidence).toBeCloseTo(0.9, 10);
  });

  it("display state follows coverage bands", () => {
    const at = (coverage: number) =>
      scoreDimension(
        "capital_efficiency",
        CE_SUBS.map((id, i) =>
          crit(id, { coverage: i === 0 ? (coverage as 0 | 0.5 | 1) : 0 }),
        ),
      ).displayState;
    // only weight 0.3 carries coverage
    expect(scoreDimension("capital_efficiency", CE_SUBS.map((id) => crit(id))).displayState).toBe(
      "INSUFFICIENT_EVIDENCE",
    );
    expect(at(0)).toBe("INSUFFICIENT_EVIDENCE");
  });
});
