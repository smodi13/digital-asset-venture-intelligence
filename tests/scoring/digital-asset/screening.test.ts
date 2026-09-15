import { describe, it, expect } from "vitest";
import {
  DA_SCREENING_CRITERIA_WEIGHTS,
  DA_SCREENING_CRITERION_IDS,
  DA_SCREENING_CRITERION_SEMANTICS,
  DA_SCREENING_TO_UNDERWRITING,
  DA_SCREENING_WEIGHTS_STATUS,
} from "@/lib/scoring/digital-asset/screening";
import { DA_UNDERWRITING_CRITERION_IDS } from "@/lib/scoring/digital-asset/underwriting";
import { SCREENING_CRITERION_IDS } from "@/lib/scoring/screening";
import { UNDERWRITING_CRITERION_IDS } from "@/lib/scoring/underwriting";
import { thesisDimensionSchema } from "@/lib/schemas/thesis-configuration";

describe("digital-asset Screening registry", () => {
  it("has exactly 14 criteria, two per dimension", () => {
    expect(DA_SCREENING_CRITERION_IDS.size).toBe(14);
    for (const dimension of thesisDimensionSchema.options) {
      expect(Object.keys(DA_SCREENING_CRITERIA_WEIGHTS[dimension])).toHaveLength(2);
    }
  });

  it("each dimension's weights sum to exactly 1 (0.50 / 0.50)", () => {
    for (const [dimension, weights] of Object.entries(DA_SCREENING_CRITERIA_WEIGHTS)) {
      const values = Object.values(weights);
      expect(values).toEqual([0.5, 0.5]);
      expect(values.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      void dimension;
    }
  });

  it("is labelled provisional", () => {
    expect(DA_SCREENING_WEIGHTS_STATUS).toMatch(/PROVISIONAL/);
  });

  it("reuses no inherited v6 Screening criterion id", () => {
    for (const id of DA_SCREENING_CRITERION_IDS) {
      expect(SCREENING_CRITERION_IDS.has(id)).toBe(false);
    }
  });

  it("every criterion has a semantic definition", () => {
    for (const id of DA_SCREENING_CRITERION_IDS) {
      expect(DA_SCREENING_CRITERION_SEMANTICS[id]).toBeTruthy();
    }
  });

  it("every Screening criterion maps to at least one Underwriting criterion, and every mapped id exists", () => {
    for (const id of DA_SCREENING_CRITERION_IDS) {
      const targets = DA_SCREENING_TO_UNDERWRITING[id];
      expect(targets).toBeDefined();
      expect(targets!.length).toBeGreaterThan(0);
      for (const target of targets!) {
        expect(DA_UNDERWRITING_CRITERION_IDS.has(target)).toBe(true);
      }
    }
  });

  it("no v6 Underwriting criterion id overlaps the digital-asset Underwriting id set", () => {
    for (const id of DA_UNDERWRITING_CRITERION_IDS) {
      expect(UNDERWRITING_CRITERION_IDS.has(id)).toBe(false);
    }
  });
});
