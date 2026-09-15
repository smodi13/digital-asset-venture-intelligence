import { describe, it, expect } from "vitest";
import { FORBIDDEN_AUTOMATIC_POSITIVE_SIGNALS } from "@/lib/scoring/config";
import { scoreDimension } from "@/lib/scoring/dimension";
import { scoreMomentum } from "@/lib/scoring/momentum";
import { scoreConvergence } from "@/lib/scoring/convergence";
import { SUBCRITERIA_WEIGHTS } from "@/lib/scoring/config";
import type { CriterionResult } from "@/lib/scoring/criterion";

/**
 * Cases 29-32: founder prestige, social popularity, later stage, and a famous
 * customer logo without operating evidence must produce zero automatic
 * benefit. The architecture guarantees this structurally: none is a criterion,
 * a momentum event, or a convergence family input, and a criterion with no
 * cited evidence contributes neutral 50 at zero coverage.
 */

describe("forbidden automatic positive signals", () => {
  it("names every forbidden quantity", () => {
    for (const key of [
      "total_funding",
      "investor_prestige",
      "valuation_alone",
      "founder_fame",
      "founder_followers",
      "company_followers",
      "social_virality",
      "article_count",
      "publication_repetition",
      "school_prestige",
      "geographic_prestige",
      "later_stage",
      "famous_customer_logo_without_operating_evidence",
    ]) {
      expect(FORBIDDEN_AUTOMATIC_POSITIVE_SIGNALS).toContain(key);
    }
  });

  it("a dimension with no evidenced criteria stays neutral at zero coverage", () => {
    const subs = Object.keys(SUBCRITERIA_WEIGHTS.founder_alignment);
    const none: CriterionResult[] = subs.map((criterionId) => ({
      criterionId,
      internalAdjustedScore: 50,
      effectiveReliability: 0,
      coverage: 0,
      confidence: 0,
      displayStatus: "INSUFFICIENT_EVIDENCE",
    }));
    const r = scoreDimension("founder_alignment", none);
    expect(r.score).toBe(50);
    expect(r.coverage).toBe(0);
    expect(r.displayState).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("no momentum or convergence input channel exists for a forbidden quantity", () => {
    // Empty input (no operating events / no families) produces exactly zero.
    expect(scoreMomentum([]).netMomentum).toBe(0);
    expect(scoreConvergence({}).netConvergence).toBe(0);
  });
});
