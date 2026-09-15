import { describe, it, expect } from "vitest";
import { archetypePointContribution } from "@/lib/scoring/archetypes";
import { businessModelArchetypeSchema } from "@/lib/scoring/config";
import { scoreCriterion } from "@/lib/scoring/criterion";

describe("business model archetypes", () => {
  // Case 16: archetype itself provides zero points, for every archetype.
  it("contributes zero points regardless of archetype", () => {
    for (const archetype of businessModelArchetypeSchema.options) {
      expect(archetypePointContribution(archetype)).toBe(0);
    }
  });

  // Case 14/15: criterion scoring takes no archetype input, so an ad-supported
  // model is not scored as a failed SaaS and a compute model does not inherit
  // SaaS margin assumptions. The score depends only on the cited evidence.
  it("criterion scoring has no archetype channel", () => {
    const assessment = {
      criterionId: "margin_structure",
      rawAnchor: 50 as const,
      rubricAnchorUsed: true,
      supportingClaimIds: ["c1"],
      opposingClaimIds: [],
      unknowns: [],
      coverage: 1 as const,
      analystRationale: "ordinary margins for the model",
    };
    expect(scoreCriterion(assessment).internalAdjustedScore).toBe(50);
    // No archetype parameter: confidence is derived from evidence, not passed.
    expect(scoreCriterion.length).toBe(1);
  });
});
