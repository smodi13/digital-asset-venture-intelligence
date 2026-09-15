import { describe, it, expect } from "vitest";
import {
  THESIS_FIT_DIMENSION_WEIGHTS,
  SUBCRITERIA_WEIGHTS,
  MOMENTUM_FAMILY_WEIGHTS,
  RAW_ANCHORS,
  COVERAGE_VALUES,
  ARCHETYPE_POINT_CONTRIBUTION,
} from "@/lib/scoring/config";
import { WEIGHT_SUM_TOLERANCE } from "@/lib/schemas/thesis-configuration";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("scoring config weights", () => {
  // Case 40: dimension and thesis weights sum to exactly 1.
  it("thesis fit dimension weights sum to exactly 1", () => {
    expect(Math.abs(sum(Object.values(THESIS_FIT_DIMENSION_WEIGHTS)) - 1)).toBeLessThanOrEqual(
      WEIGHT_SUM_TOLERANCE,
    );
  });

  it("every dimension's subcriteria sum to exactly 1", () => {
    for (const [dimension, weights] of Object.entries(SUBCRITERIA_WEIGHTS)) {
      expect(
        Math.abs(sum(Object.values(weights)) - 1),
        `${dimension} subcriteria`,
      ).toBeLessThanOrEqual(WEIGHT_SUM_TOLERANCE);
    }
  });

  it("momentum family weights sum to exactly 1", () => {
    expect(Math.abs(sum(Object.values(MOMENTUM_FAMILY_WEIGHTS)) - 1)).toBeLessThanOrEqual(
      WEIGHT_SUM_TOLERANCE,
    );
  });

  it("locks the approved default dimension weights", () => {
    expect(THESIS_FIT_DIMENSION_WEIGHTS).toEqual({
      capital_efficiency: 0.2,
      growth_momentum: 0.2,
      founder_alignment: 0.15,
      market_quality: 0.15,
      business_model_quality: 0.1,
      gtm_quality: 0.1,
      competitive_position: 0.1,
    });
  });

  it("restricts raw anchors and coverage to the discrete sets", () => {
    expect([...RAW_ANCHORS]).toEqual([0, 25, 50, 75, 100]);
    expect([...COVERAGE_VALUES]).toEqual([0, 0.5, 1]);
  });

  // Case 16: archetype itself provides zero points.
  it("archetype point contribution is zero", () => {
    expect(ARCHETYPE_POINT_CONTRIBUTION).toBe(0);
  });
});

describe("subcriterion count (Phase 5B.1 regression)", () => {
  const EXPECTED_COUNTS: Record<string, number> = {
    capital_efficiency: 5,
    growth_momentum: 5,
    founder_alignment: 5,
    market_quality: 6,
    business_model_quality: 6,
    gtm_quality: 6,
    competitive_position: 6,
  };

  it("has exactly 7 dimensions", () => {
    expect(Object.keys(SUBCRITERIA_WEIGHTS).sort()).toEqual(Object.keys(EXPECTED_COUNTS).sort());
    expect(Object.keys(THESIS_FIT_DIMENSION_WEIGHTS)).toHaveLength(7);
  });

  it("has exactly 39 total subcriteria", () => {
    const total = Object.values(SUBCRITERIA_WEIGHTS).reduce((n, w) => n + Object.keys(w).length, 0);
    expect(total).toBe(39);
  });

  it("each dimension has its expected subcriterion count", () => {
    for (const [dimension, expected] of Object.entries(EXPECTED_COUNTS)) {
      expect(Object.keys(SUBCRITERIA_WEIGHTS[dimension as keyof typeof SUBCRITERIA_WEIGHTS]), dimension).toHaveLength(expected);
    }
  });

  it("every dimension's subcriteria weights sum to exactly 1", () => {
    for (const [dimension, weights] of Object.entries(SUBCRITERIA_WEIGHTS)) {
      expect(Math.abs(sum(Object.values(weights)) - 1), dimension).toBeLessThanOrEqual(WEIGHT_SUM_TOLERANCE);
    }
  });

  it("thesis dimension weights sum to exactly 1", () => {
    expect(Math.abs(sum(Object.values(THESIS_FIT_DIMENSION_WEIGHTS)) - 1)).toBeLessThanOrEqual(WEIGHT_SUM_TOLERANCE);
  });
});
