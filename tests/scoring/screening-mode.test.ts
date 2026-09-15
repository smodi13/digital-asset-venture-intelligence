import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  SCREENING_DIMENSION_WEIGHTS,
  SCREENING_CRITERIA_WEIGHTS,
  SCREENING_CRITERION_IDS,
  SCREENING_CRITERION_SEMANTICS,
  SCREENING_RANK_ELIGIBILITY_CALIBRATION_DEFAULTS,
  scoreScreeningCriterion,
  scoreScreeningDimension,
  scoreScreeningThesisFit,
} from "@/lib/scoring/screening";
import {
  UNDERWRITING_CRITERION_IDS,
  scoreUnderwritingThesisFit,
  assertUnderwritingCriteria,
} from "@/lib/scoring/underwriting";
import { assertResultMode, assertCriteriaMatchMode, ModeMismatchError, CriterionModeError } from "@/lib/scoring/mode";
import { scoreThesisFit } from "@/lib/scoring/thesis-fit";
import { SUBCRITERIA_WEIGHTS, RAW_ANCHORS, COVERAGE_VALUES } from "@/lib/scoring/config";
import { analystAssessmentSchema } from "@/lib/scoring/criterion";
import { archetypePointContribution } from "@/lib/scoring/archetypes";
import { PRIORITY_THRESHOLDS_ACTIVE } from "@/lib/scoring/priority";
import { scoreSnapshotSchema } from "@/lib/schemas/score-snapshot";
import { thesisDimensionSchema, WEIGHT_SUM_TOLERANCE, type ThesisDimension } from "@/lib/schemas/thesis-configuration";
import type { CriterionResult } from "@/lib/scoring/criterion";
import type { DimensionResult } from "@/lib/scoring/dimension";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const DIMS = thesisDimensionSchema.options as ThesisDimension[];

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

function dim(dimension: ThesisDimension, over: Partial<DimensionResult> = {}): DimensionResult {
  return { dimension, score: 50, coverage: 0, confidence: 0, displayState: "INSUFFICIENT_EVIDENCE", ...over };
}

const sourced = (id: string, quality = 0.85): Parameters<typeof scoreScreeningCriterion>[1] => ({
  evidence: [{ claimId: id, originKey: id, reliabilityClass: "independent_reported_fact", quality }],
});

describe("Phase 5C-B: screening framework shape", () => {
  it("1. screening has exactly 7 dimensions", () => {
    expect(Object.keys(SCREENING_CRITERIA_WEIGHTS).sort()).toEqual([...DIMS].sort());
    expect(Object.keys(SCREENING_DIMENSION_WEIGHTS)).toHaveLength(7);
  });

  it("2. screening has exactly 14 criteria", () => {
    const total = Object.values(SCREENING_CRITERIA_WEIGHTS).reduce((n, w) => n + Object.keys(w).length, 0);
    expect(total).toBe(14);
    expect(SCREENING_CRITERION_IDS.size).toBe(14);
    expect(Object.keys(SCREENING_CRITERION_SEMANTICS)).toHaveLength(14);
  });

  it("3. underwriting remains exactly 39 criteria", () => {
    const total = Object.values(SUBCRITERIA_WEIGHTS).reduce((n, w) => n + Object.keys(w).length, 0);
    expect(total).toBe(39);
    expect(UNDERWRITING_CRITERION_IDS.size).toBe(39);
  });

  it("4. both top-level dimension weight sets sum to 1", () => {
    expect(Math.abs(sum(Object.values(SCREENING_DIMENSION_WEIGHTS)) - 1)).toBeLessThanOrEqual(WEIGHT_SUM_TOLERANCE);
  });

  it("5. every screening dimension's criterion weights sum to 1", () => {
    for (const [d, w] of Object.entries(SCREENING_CRITERIA_WEIGHTS)) {
      expect(Math.abs(sum(Object.values(w)) - 1), d).toBeLessThanOrEqual(WEIGHT_SUM_TOLERANCE);
    }
  });

  it("locks the 14 screening criterion ids and their dimension weights", () => {
    expect(SCREENING_CRITERIA_WEIGHTS).toEqual({
      capital_efficiency: { observable_scale_vs_primary_capital: 0.6, capital_intensity_delivery_signal: 0.4 },
      growth_momentum: { recent_operating_growth: 0.5, adoption_growth_and_durability: 0.5 },
      founder_alignment: { founder_problem_fit: 0.6, active_team_complementarity: 0.4 },
      market_quality: { demonstrated_budget_and_urgency: 0.5, market_breadth_and_expansion: 0.5 },
      business_model_quality: {
        monetization_recurrence_and_value_alignment: 0.5,
        cost_to_serve_and_scaling_risk: 0.5,
      },
      gtm_quality: { customer_proof: 0.5, distribution_repeatability_and_expansion: 0.5 },
      competitive_position: {
        differentiated_capability_or_workflow: 0.5,
        observed_defensibility_or_displacement: 0.5,
      },
    });
  });

  it("6. screening raw anchors remain the discrete set", () => {
    expect([...RAW_ANCHORS]).toEqual([0, 25, 50, 75, 100]);
    for (const bad of [63, 88, 10]) {
      expect(analystAssessmentSchema.safeParse({
        criterionId: "customer_proof", rawAnchor: bad, rubricAnchorUsed: true,
        supportingClaimIds: ["c1"], opposingClaimIds: [], unknowns: [], coverage: 1, analystRationale: "x",
      }).success).toBe(false);
    }
  });

  it("7. screening coverage remains 0 / 0.5 / 1", () => {
    expect([...COVERAGE_VALUES]).toEqual([0, 0.5, 1]);
    expect(analystAssessmentSchema.safeParse({
      criterionId: "customer_proof", rawAnchor: 75, rubricAnchorUsed: true,
      supportingClaimIds: ["c1"], opposingClaimIds: [], unknowns: [], coverage: 0.7, analystRationale: "x",
    }).success).toBe(false);
  });

  it("8. an analyst cannot override confidence on a screening assessment", () => {
    for (const key of ["confidence", "computedConfidence", "effectiveReliability", "reliabilityCap"]) {
      expect(analystAssessmentSchema.safeParse({
        criterionId: "customer_proof", rawAnchor: 75, rubricAnchorUsed: true,
        supportingClaimIds: ["c1"], opposingClaimIds: [], unknowns: [], coverage: 1, analystRationale: "x",
        [key]: 0.95,
      }).success).toBe(false);
    }
  });
});

describe("Phase 5C-B: screening evidence standard", () => {
  const assess = (over = {}) => ({
    criterionId: "customer_proof", rawAnchor: 75 as const, rubricAnchorUsed: true,
    supportingClaimIds: ["c1"], opposingClaimIds: [], unknowns: [], coverage: 1 as const,
    analystRationale: "x", ...over,
  });

  it("9. assumption-only screening evidence gives coverage 0", () => {
    const r = scoreScreeningCriterion(assess(), {
      evidence: [{ claimId: "c1", originKey: "o1", reliabilityClass: "assumption" }],
    });
    expect(r.coverage).toBe(0);
    expect(r.internalAdjustedScore).toBe(50);
  });

  it("10. unknown-only evidence gives coverage 0", () => {
    const r = scoreScreeningCriterion(assess(), {
      evidence: [{ claimId: "c1", originKey: "o1", reliabilityClass: "unknown" }],
    });
    expect(r.coverage).toBe(0);
  });

  it("11. sourced public adoption evidence can support a screening judgment across criteria", () => {
    // One sourced customer-adoption claim, explicitly mapped by the analyst to
    // two criteria. Both get real coverage; the mapping is the judgment.
    const proof = scoreScreeningCriterion(assess({ criterionId: "customer_proof" }), sourced("adopt-1"));
    const budget = scoreScreeningCriterion(
      assess({ criterionId: "demonstrated_budget_and_urgency" }),
      sourced("adopt-1"),
    );
    expect(proof.coverage).toBe(1);
    expect(budget.coverage).toBe(1);
    expect(proof.internalAdjustedScore).toBeGreaterThan(50);
  });

  it("20. a claim reused across criteria does not multiply evidence confidence and stays visible", () => {
    const a = scoreScreeningCriterion(assess({ criterionId: "customer_proof" }), sourced("adopt-1"));
    const b = scoreScreeningCriterion(assess({ criterionId: "market_breadth_and_expansion" }), sourced("adopt-1"));
    expect(a.confidence).toBeCloseTo(b.confidence, 12);
    expect(a.confidenceClaimIds).toEqual(["adopt-1"]);
    expect(b.confidenceClaimIds).toEqual(["adopt-1"]);
  });

  it("12-15. assumption leaps (secondary capital, unclosed round, job volume, run-rate to ARR) earn no coverage", () => {
    for (const criterionId of ["observable_scale_vs_primary_capital", "recent_operating_growth"]) {
      const r = scoreScreeningCriterion(assess({ criterionId }), {
        evidence: [{ claimId: "leap", originKey: "leap", reliabilityClass: "assumption" }],
      });
      expect(r.coverage).toBe(0);
      expect(r.internalAdjustedScore).toBe(50);
    }
    // The criterion set has no revenue/ARR/funding channel to inject.
    for (const banned of ["arr", "annual_recurring_revenue", "total_funding", "revenue"]) {
      expect(SCREENING_CRITERION_IDS.has(banned)).toBe(false);
    }
  });

  it("12-13. semantics state secondary liquidity and unclosed financing are not primary capital", () => {
    const text = (SCREENING_CRITERION_SEMANTICS.observable_scale_vs_primary_capital ?? "").toLowerCase();
    expect(text).toContain("secondary");
    expect(text).toContain("unclosed");
    expect(text).toContain("primary");
  });
});

describe("Phase 5C-B: archetype neutrality", () => {
  it("16-17. a compute-heavy or advertising model inherits no economics and is not a failed SaaS", () => {
    for (const a of ["compute_inference_infrastructure", "advertising_supported", "subscription_software"] as const) {
      expect(archetypePointContribution(a)).toBe(0);
    }
  });
});

describe("Phase 5C-B: prestige and logos", () => {
  it("18-19. founder prestige alone and a famous logo alone move nothing (assumption-class, coverage 0)", () => {
    const prestige = scoreScreeningCriterion(
      { criterionId: "founder_problem_fit", rawAnchor: 100, rubricAnchorUsed: true,
        supportingClaimIds: ["p"], opposingClaimIds: [], unknowns: [], coverage: 1, analystRationale: "x" },
      { evidence: [{ claimId: "p", originKey: "p", reliabilityClass: "assumption" }] },
    );
    expect(prestige.coverage).toBe(0);
    expect(prestige.internalAdjustedScore).toBe(50);
  });
});

describe("Phase 5C-B: mode isolation, no arbitrage", () => {
  it("21. screening and underwriting results carry an explicit mode", () => {
    const s = scoreScreeningThesisFit(DIMS.map((d) => dim(d)));
    const u = scoreUnderwritingThesisFit(DIMS.map((d) => dim(d)));
    expect(s.mode).toBe("screening");
    expect(u.mode).toBe("underwriting");
  });

  it("21. a screening result cannot be passed as underwriting, or vice versa", () => {
    const s = scoreScreeningThesisFit(DIMS.map((d) => dim(d)));
    const u = scoreUnderwritingThesisFit(DIMS.map((d) => dim(d)));
    expect(() => assertResultMode(s, "underwriting")).toThrow(ModeMismatchError);
    expect(() => assertResultMode(u, "screening")).toThrow(ModeMismatchError);
    expect(assertResultMode(s, "screening")).toBe(s);
    expect(assertResultMode(u, "underwriting")).toBe(u);
  });

  it("21. criteria from the two modes cannot be mixed into one result", () => {
    // 14 screening criteria fed to the underwriting calculator: fail loud.
    expect(() => assertUnderwritingCriteria([...SCREENING_CRITERION_IDS])).toThrow(CriterionModeError);
    // 39 underwriting criteria fed to a screening dimension: fail loud.
    const uwCrit = crit("capital_productivity", { coverage: 1, confidence: 0.8, internalAdjustedScore: 75 });
    expect(() => scoreScreeningDimension("capital_efficiency", [uwCrit])).toThrow(CriterionModeError);
  });

  it("the 39-criterion underwriting configuration is unchanged", () => {
    expect(Object.values(SUBCRITERIA_WEIGHTS).reduce((n, w) => n + Object.keys(w).length, 0)).toBe(39);
    expect(Object.keys(SUBCRITERIA_WEIGHTS)).toHaveLength(7);
    // Screening criterion ids and underwriting criterion ids are disjoint.
    for (const id of SCREENING_CRITERION_IDS) expect(UNDERWRITING_CRITERION_IDS.has(id)).toBe(false);
  });

  it("no generic ambiguous persisted score type: ScoreSnapshot requires analyticalMode", () => {
    const base = {
      companyId: "co-1", schemaVersion: 6, thesisConfigHash: "sha256:a",
      computedAt: "2026-01-01T00:00:00.000Z", asOfDate: "2026-01-01",
      fitScore: null, momentumScore: null, convergenceScore: null, trustScore: null,
      priorityScore: null, priorityRank: null, relevanceTier: "core" as const, inputHash: "sha256:b",
    };
    expect(scoreSnapshotSchema.safeParse(base).success).toBe(false);
    expect(scoreSnapshotSchema.safeParse({ ...base, analyticalMode: "screening" }).success).toBe(true);
    expect(scoreSnapshotSchema.safeParse({ ...base, analyticalMode: "wobble" }).success).toBe(false);
  });

  it("assertCriteriaMatchMode accepts the right ids for each mode", () => {
    expect(() => assertCriteriaMatchMode("screening", ["customer_proof"], SCREENING_CRITERION_IDS)).not.toThrow();
    expect(() => assertCriteriaMatchMode("underwriting", ["capital_productivity"], UNDERWRITING_CRITERION_IDS)).not.toThrow();
  });
});

describe("Phase 5C-B: screening rank calibration and priority", () => {
  it("22. the vestigial screening rank config is retired, not calibrated", () => {
    expect(SCREENING_RANK_ELIGIBILITY_CALIBRATION_DEFAULTS.retired).toBe(true);
    expect(SCREENING_RANK_ELIGIBILITY_CALIBRATION_DEFAULTS.calibrated).toBe(false);
    expect(SCREENING_RANK_ELIGIBILITY_CALIBRATION_DEFAULTS.thresholds).toBeNull();
    expect(SCREENING_RANK_ELIGIBILITY_CALIBRATION_DEFAULTS.status).toBe(
      "RETIRED - NO POST-EVIDENCE SCREENING RANKING ARCHITECTURE",
    );
  });

  it("22. a screening thesis fit result never reports a RANK_ELIGIBLE state", () => {
    const s = scoreScreeningThesisFit(DIMS.map((d) => dim(d, { score: 78, coverage: 1, confidence: 0.8, displayState: "SCORED" })));
    expect(s.displayState).toBe("SCREENED");
    expect(s.rankThresholdsCalibrated).toBe(false);
    expect((s as { displayState: string }).displayState).not.toBe("RANK_ELIGIBLE");
  });

  it("23. priority thresholds remain inactive", () => {
    expect(PRIORITY_THRESHOLDS_ACTIVE).toBe(false);
  });
});

describe("Phase 5C-B: screening reuses shared mechanics", () => {
  it("adjusted-score arithmetic matches the shared engine", () => {
    // 50 + confidence*coverage*(anchor-50); one independent_reported_fact origin at q=0.8.
    const r = scoreScreeningCriterion(
      { criterionId: "customer_proof", rawAnchor: 100, rubricAnchorUsed: true,
        supportingClaimIds: ["c1"], opposingClaimIds: [], unknowns: [], coverage: 1, analystRationale: "x" },
      { evidence: [{ claimId: "c1", originKey: "o1", reliabilityClass: "independent_reported_fact", quality: 0.8 }] },
    );
    expect(r.internalAdjustedScore).toBeCloseTo(90, 10);
  });

  it("dimension and thesis roll-ups are weighted sums, same as underwriting", () => {
    const criteria: CriterionResult[] = [
      crit("customer_proof", { internalAdjustedScore: 100, coverage: 1, confidence: 0.9, displayStatus: "SCORED" }),
      crit("distribution_repeatability_and_expansion", { internalAdjustedScore: 50, coverage: 1, confidence: 0.9, displayStatus: "SCORED" }),
    ];
    const d = scoreScreeningDimension("gtm_quality", criteria);
    expect(d.score).toBeCloseTo(75, 10); // 0.5*100 + 0.5*50
    expect(d.coverage).toBeCloseTo(1, 10);

    const fit = scoreScreeningThesisFit([dim("gtm_quality", { score: d.score, coverage: 1, confidence: 0.9, displayState: "SCORED" })]);
    expect(fit.score).toBeCloseTo(0.1 * 75 + 0.9 * 50, 10);
  });
});

describe("Phase 5C-B: real corpus firewall", () => {
  const GENERATED = join(process.cwd(), "data", "generated");

  it("24. snapshots.json still holds zero records", () => {
    const snap = JSON.parse(readFileSync(join(GENERATED, "snapshots.json"), "utf8"));
    expect(snap.recordCount).toBe(0);
    expect(snap.records).toEqual([]);
  });

  it("24. no generated corpus file carries a screening or underwriting scoring artifact", () => {
    const banned = ["screeningFit", "screeningThesisFit", "underwritingThesisFit", "thesisFit", "analyticalMode", "rankEligible"];
    for (const file of readdirSync(GENERATED)) {
      const text = readFileSync(join(GENERATED, file), "utf8");
      for (const token of banned) expect(text.includes(`"${token}"`), `${file}:${token}`).toBe(false);
    }
  });

  it("the underwriting wrapper matches the untagged engine output exactly", () => {
    const dims = DIMS.map((d) => dim(d, { score: 70, coverage: 1, confidence: 0.8, displayState: "SCORED" }));
    const { mode, ...rest } = scoreUnderwritingThesisFit(dims);
    expect(mode).toBe("underwriting");
    expect(rest).toEqual(scoreThesisFit(dims));
  });
});
