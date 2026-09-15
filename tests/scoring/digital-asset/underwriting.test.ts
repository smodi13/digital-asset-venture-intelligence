import { describe, it, expect } from "vitest";
import {
  DA_UNDERWRITING_CRITERIA_BY_DIMENSION,
  DA_UNDERWRITING_CRITERIA_WEIGHTS,
  DA_UNDERWRITING_CRITERION_IDS,
  DA_UNDERWRITING_CRITERION_SEMANTICS,
  DA_UNDERWRITING_WEIGHTS_STATUS,
} from "@/lib/scoring/digital-asset/underwriting";
import { UNDERWRITING_CRITERION_IDS } from "@/lib/scoring/underwriting";
import { thesisDimensionSchema } from "@/lib/schemas/thesis-configuration";

describe("digital-asset Underwriting registry", () => {
  it("has exactly 39 criteria", () => {
    expect(DA_UNDERWRITING_CRITERION_IDS.size).toBe(39);
  });

  it("has the exact per-dimension counts: 5/5/5/6/6/6/6", () => {
    const counts = Object.fromEntries(
      Object.entries(DA_UNDERWRITING_CRITERIA_BY_DIMENSION).map(([d, ids]) => [d, ids.length]),
    );
    expect(counts).toEqual({
      capital_efficiency: 5,
      growth_momentum: 5,
      founder_alignment: 5,
      market_quality: 6,
      business_model_quality: 6,
      gtm_quality: 6,
      competitive_position: 6,
    });
  });

  it("each dimension's weights sum to exactly 1 within tolerance", () => {
    for (const dimension of thesisDimensionSchema.options) {
      const sum = Object.values(DA_UNDERWRITING_CRITERIA_WEIGHTS[dimension]).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    }
  });

  it("five-criterion dimensions use 0.20 each", () => {
    for (const dimension of ["capital_efficiency", "growth_momentum", "founder_alignment"] as const) {
      for (const w of Object.values(DA_UNDERWRITING_CRITERIA_WEIGHTS[dimension])) {
        expect(w).toBeCloseTo(0.2, 12);
      }
    }
  });

  it("six-criterion dimensions use 1/6 each", () => {
    for (const dimension of [
      "market_quality",
      "business_model_quality",
      "gtm_quality",
      "competitive_position",
    ] as const) {
      for (const w of Object.values(DA_UNDERWRITING_CRITERIA_WEIGHTS[dimension])) {
        expect(w).toBeCloseTo(1 / 6, 12);
      }
    }
  });

  it("is labelled provisional, not calibrated for digital assets", () => {
    expect(DA_UNDERWRITING_WEIGHTS_STATUS).toMatch(/PROVISIONAL/);
  });

  it("reuses no inherited v6 Underwriting criterion id", () => {
    for (const id of DA_UNDERWRITING_CRITERION_IDS) {
      expect(UNDERWRITING_CRITERION_IDS.has(id)).toBe(false);
    }
  });

  it("every criterion has a definition", () => {
    for (const id of DA_UNDERWRITING_CRITERION_IDS) {
      expect(DA_UNDERWRITING_CRITERION_SEMANTICS[id]).toBeTruthy();
    }
  });
});
