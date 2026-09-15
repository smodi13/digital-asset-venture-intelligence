import { describe, it, expect } from "vitest";
import {
  DA_FORBIDDEN_AUTOMATIC_POSITIVE,
  DA_CRITICAL_DIMENSION_EVIDENCE_GUARD,
  DA_EVIDENCE_SUFFICIENCY_PROVISIONAL,
} from "@/lib/scoring/digital-asset/config";
import { renormalizeDimension, type CriterionScoreInput } from "@/lib/scoring/digital-asset/applicability";
import { DA_UNDERWRITING_CRITERIA_BY_DIMENSION } from "@/lib/scoring/digital-asset/underwriting";

describe("digital-asset forbidden automatic-positive registry", () => {
  it("names every required forbidden quantity", () => {
    for (const key of [
      "funding",
      "ecosystem_funding",
      "token_launch",
      "token_price_appreciation",
      "fdv_or_market_cap_appreciation",
      "tvl_growth_alone",
      "github_stars",
      "repo_popularity",
      "emission_funded_activity",
      "article_count",
      "publication_repetition",
      "famous_logo_without_operating_evidence",
      "prestige",
    ]) {
      expect(DA_FORBIDDEN_AUTOMATIC_POSITIVE).toContain(key);
    }
  });

  it("does not modify the active v6 registry", () => {
    // The active registry lives at lib/scoring/config.ts and is untouched; this
    // module never imports or extends it.
    expect(DA_FORBIDDEN_AUTOMATIC_POSITIVE).not.toBe(undefined);
  });
});

describe("structural proof: no forbidden quantity can raise a score", () => {
  function unevidenced(dimension: keyof typeof DA_UNDERWRITING_CRITERIA_BY_DIMENSION): CriterionScoreInput[] {
    return DA_UNDERWRITING_CRITERIA_BY_DIMENSION[dimension].map((criterionId) => ({
      criterionId,
      applicability: "applicable" as const,
      rawAnchor: null,
      coverage: 0,
    }));
  }

  it("funding alone -> no positive score (no criterion channel exists for it)", () => {
    const r = renormalizeDimension("capital_efficiency", unevidenced("capital_efficiency"));
    expect(r.score).toBeCloseTo(50, 9);
  });

  it("token launch alone -> no positive score", () => {
    const r = renormalizeDimension("growth_momentum", unevidenced("growth_momentum"));
    expect(r.score).toBeCloseTo(50, 9);
  });

  it("token price / FDV / market cap appreciation alone -> no positive score", () => {
    const r = renormalizeDimension("business_model_quality", unevidenced("business_model_quality"));
    expect(r.score).toBeCloseTo(50, 9);
  });

  it("TVL alone -> no PMF claim (growth_momentum stays neutral with no cited evidence)", () => {
    const r = renormalizeDimension("growth_momentum", unevidenced("growth_momentum"));
    expect(r.score).toBeCloseTo(50, 9);
    expect(r.coverage).toBe(0);
  });

  it("GitHub activity alone -> no commercial-traction claim", () => {
    const r = renormalizeDimension("gtm_quality", unevidenced("gtm_quality"));
    expect(r.score).toBeCloseTo(50, 9);
  });

  it("publication repetition -> no independence boost (not a criterion, not evidence)", () => {
    expect(DA_FORBIDDEN_AUTOMATIC_POSITIVE).toContain("publication_repetition");
  });

  it("token existence -> no bonus; no-token state -> no penalty", () => {
    const withToken = renormalizeDimension("capital_efficiency", [
      ...DA_UNDERWRITING_CRITERIA_BY_DIMENSION.capital_efficiency
        .filter((id) => id !== "token_issuance_and_emissions")
        .map((criterionId) => ({ criterionId, applicability: "applicable" as const, rawAnchor: 50, coverage: 1 })),
      { criterionId: "token_issuance_and_emissions", applicability: "not_applicable" as const, rawAnchor: null, coverage: 0 },
    ]);
    expect(withToken.score).toBeCloseTo(50, 9);
  });
});

describe("critical-dimension guard is a zero-coverage veto only, provisional", () => {
  it("names capital_efficiency and growth_momentum explicitly", () => {
    expect(DA_CRITICAL_DIMENSION_EVIDENCE_GUARD.dimensions).toEqual(["capital_efficiency", "growth_momentum"]);
  });

  it("is not calibrated for digital assets", () => {
    expect(DA_CRITICAL_DIMENSION_EVIDENCE_GUARD.calibrated).toBe(false);
  });
});

describe("digital-asset evidence-bar thresholds are provisional and inactive", () => {
  it("are not active and not claimed calibrated", () => {
    expect(DA_EVIDENCE_SUFFICIENCY_PROVISIONAL.active).toBe(false);
    expect(DA_EVIDENCE_SUFFICIENCY_PROVISIONAL.calibrated).toBe(false);
  });
});
