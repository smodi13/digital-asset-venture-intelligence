import { describe, it, expect } from "vitest";
import {
  resolveApplicability,
  renormalizeDimension,
  type CriterionScoreInput,
} from "@/lib/scoring/digital-asset/applicability";
import { DA_UNDERWRITING_CRITERIA_BY_DIMENSION } from "@/lib/scoring/digital-asset/underwriting";

/**
 * Phase 2B section 15: applicability and evidence coverage are different
 * concepts. A criterion absent because an entity has no token must not move
 * the score.
 */

describe("applicability resolution", () => {
  it("token_issuance_and_emissions is not_applicable for an equity-only company", () => {
    const r = resolveApplicability("token_issuance_and_emissions", { entityType: "company", assetType: "equity" });
    expect(r.state).toBe("not_applicable");
    expect(r.reason).toBeTruthy();
  });

  it("token_issuance_and_emissions is not_applicable for a network_no_token protocol", () => {
    const r = resolveApplicability("token_issuance_and_emissions", { entityType: "protocol", assetType: "network_no_token" });
    expect(r.state).toBe("not_applicable");
  });

  it("token_issuance_and_emissions is applicable when assetType includes token exposure", () => {
    for (const assetType of ["token", "equity_and_token"] as const) {
      const r = resolveApplicability("token_issuance_and_emissions", { entityType: "hybrid", assetType });
      expect(r.state).toBe("applicable");
    }
  });

  it("token_issuance_and_emissions is unknown, not not_applicable, when assetType is unknown", () => {
    const r = resolveApplicability("token_issuance_and_emissions", { entityType: "company", assetType: "unknown" });
    expect(r.state).toBe("unknown");
    expect(r.reason).toBeTruthy();
  });

  it("a universal criterion is always applicable regardless of entity/asset type", () => {
    for (const assetType of ["equity", "token", "equity_and_token", "network_no_token", "unknown"] as const) {
      const r = resolveApplicability("capital_deployment_productivity", { entityType: "company", assetType });
      expect(r.state).toBe("applicable");
    }
  });

  it("unknown applicability is distinguishable from not_applicable", () => {
    const notApplicable = resolveApplicability("token_issuance_and_emissions", { entityType: "company", assetType: "equity" });
    const unknown = resolveApplicability("token_issuance_and_emissions", { entityType: "company", assetType: "unknown" });
    expect(notApplicable.state).not.toBe(unknown.state);
  });
});

describe("dimension renormalization", () => {
  const ids = DA_UNDERWRITING_CRITERIA_BY_DIMENSION.capital_efficiency;

  function fullyEvidenced(overrides: Record<string, Partial<CriterionScoreInput>> = {}): CriterionScoreInput[] {
    return ids.map((criterionId) => ({
      criterionId,
      applicability: "applicable" as const,
      rawAnchor: 75,
      coverage: 1,
      ...overrides[criterionId],
    }));
  }

  it("a not_applicable criterion is excluded from both the score and coverage denominators", () => {
    const criteria = fullyEvidenced({
      token_issuance_and_emissions: { applicability: "not_applicable", rawAnchor: null, coverage: 0 },
    });
    const r = renormalizeDimension("capital_efficiency", criteria);
    expect(r.effectiveWeights.token_issuance_and_emissions).toBeUndefined();
    expect(r.excludedNotApplicable).toContain("token_issuance_and_emissions");
    const remaining = Object.values(r.effectiveWeights);
    expect(remaining.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it("an unknown-applicability criterion stays in the denominator as a visible diligence gap", () => {
    const criteria = fullyEvidenced({
      token_issuance_and_emissions: { applicability: "unknown", rawAnchor: null, coverage: 0 },
    });
    const r = renormalizeDimension("capital_efficiency", criteria);
    expect(r.unresolvedApplicability).toContain("token_issuance_and_emissions");
    expect(r.effectiveWeights.token_issuance_and_emissions).toBeGreaterThan(0);
    const remaining = Object.values(r.effectiveWeights);
    expect(remaining.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it("no-token parity: an equity company (N/A) and a token company (fully evidenced) with identical universal evidence score identically", () => {
    const equityCompany = fullyEvidenced({
      token_issuance_and_emissions: { applicability: "not_applicable", rawAnchor: null, coverage: 0 },
    });
    const tokenCompany = fullyEvidenced(); // token_issuance_and_emissions applicable with the same anchor/coverage as everything else

    const equityResult = renormalizeDimension("capital_efficiency", equityCompany);
    const tokenResult = renormalizeDimension("capital_efficiency", tokenCompany);

    // Both fully evidenced at the same anchor on every applicable criterion:
    // the N/A exclusion changes the denominator, never the resulting score.
    expect(equityResult.score).toBeCloseTo(tokenResult.score, 9);
    expect(equityResult.coverage).toBeCloseTo(tokenResult.coverage, 9);
  });

  it("having a token does not add points: a non-applicable criterion contributes neither bonus nor penalty", () => {
    const withoutToken = fullyEvidenced({
      token_issuance_and_emissions: { applicability: "not_applicable", rawAnchor: null, coverage: 0 },
    });
    const withTokenButUnevidenced = fullyEvidenced({
      token_issuance_and_emissions: { applicability: "applicable", rawAnchor: null, coverage: 0 },
    });
    const a = renormalizeDimension("capital_efficiency", withoutToken);
    const b = renormalizeDimension("capital_efficiency", withTokenButUnevidenced);
    // An unevidenced applicable criterion fills neutral 50 with 0 coverage weight,
    // which is a different mechanism from exclusion, and is asserted not to
    // produce a higher score than the honestly-excluded case.
    expect(b.score).toBeLessThanOrEqual(a.score + 1e-9);
  });
});
