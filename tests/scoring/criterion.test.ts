import { describe, it, expect } from "vitest";
import {
  scoreCriterion,
  analystAssessmentSchema,
  type AnalystCriterionAssessment,
} from "@/lib/scoring/criterion";
import type { ConfidenceResolutionInput } from "@/lib/scoring/confidence";

function base(overrides: Partial<AnalystCriterionAssessment> = {}): AnalystCriterionAssessment {
  return {
    criterionId: "capital_productivity",
    rawAnchor: 75,
    rubricAnchorUsed: true,
    supportingClaimIds: ["claim-1"],
    opposingClaimIds: [],
    unknowns: [],
    coverage: 1,
    analystRationale: "test",
    ...overrides,
  };
}

// Evidence whose aggregate confidence resolves to a chosen value, so the
// adjusted-score arithmetic can be asserted against known inputs. A single
// independent_reported_fact origin resolves to exactly its quality (<= cap).
function evidenceAt(confidence: number): ConfidenceResolutionInput {
  return {
    evidence: [
      {
        claimId: "claim-1",
        originKey: "origin-1",
        reliabilityClass: "independent_reported_fact",
        quality: confidence,
      },
    ],
  };
}

describe("criterion calculation", () => {
  it("locks the four adjusted-score examples", () => {
    expect(scoreCriterion(base({ rawAnchor: 100, coverage: 1 }), evidenceAt(0.9)).internalAdjustedScore).toBeCloseTo(95, 10);
    expect(scoreCriterion(base({ rawAnchor: 100, coverage: 0.5 }), evidenceAt(0.9)).internalAdjustedScore).toBeCloseTo(72.5, 10);
    expect(scoreCriterion(base({ rawAnchor: 0, coverage: 1 }), evidenceAt(0.9)).internalAdjustedScore).toBeCloseTo(5, 10);
    expect(scoreCriterion(base({ rawAnchor: 0, coverage: 0.5 }), evidenceAt(0.9)).internalAdjustedScore).toBeCloseTo(27.5, 10);
  });

  // Case 6/7: low confidence shrinks strong and weak evidence toward 50 symmetrically.
  it("shrinks toward 50 symmetrically as confidence falls", () => {
    const strong = scoreCriterion(base({ rawAnchor: 100, coverage: 1 }), evidenceAt(0.2)).internalAdjustedScore;
    const weak = scoreCriterion(base({ rawAnchor: 0, coverage: 1 }), evidenceAt(0.2)).internalAdjustedScore;
    expect(strong - 50).toBeCloseTo(50 - weak, 10);
    expect(strong).toBeCloseTo(60, 10);
  });

  // Case 8: partial coverage participates in shrinkage.
  it("partial coverage participates in shrinkage", () => {
    const full = scoreCriterion(base({ rawAnchor: 100, coverage: 1 }), evidenceAt(0.8)).internalAdjustedScore;
    const partial = scoreCriterion(base({ rawAnchor: 100, coverage: 0.5 }), evidenceAt(0.8)).internalAdjustedScore;
    expect(full).toBeCloseTo(90, 10); // 50 + 0.8*1*50
    expect(partial).toBeCloseTo(70, 10); // 50 + 0.8*0.5*50
  });

  // Case 3: missing metric yields neutral-fill 50, not zero, and is not displayed.
  it("a null anchor fills 50 internally and displays INSUFFICIENT_EVIDENCE", () => {
    const r = scoreCriterion(base({ rawAnchor: null, supportingClaimIds: [], rubricAnchorUsed: false }));
    expect(r.internalAdjustedScore).toBe(50);
    expect(r.displayStatus).toBe("INSUFFICIENT_EVIDENCE");
    expect(r.confidence).toBe(0);
  });

  // Case 39: unknowns do not create positive or negative evidence.
  it("unknowns listed alongside a null anchor do not move the score", () => {
    const r = scoreCriterion(base({ rawAnchor: null, unknowns: ["arr", "nrr"], supportingClaimIds: [], rubricAnchorUsed: false }));
    expect(r.internalAdjustedScore).toBe(50);
  });

  // Case 35: raw score outside 0/25/50/75/100 fails validation.
  it("rejects a raw anchor outside the rubric set", () => {
    expect(analystAssessmentSchema.safeParse(base({ rawAnchor: 63 as unknown as 75 })).success).toBe(false);
  });

  // Case 36: coverage outside 0/.5/1 fails validation.
  it("rejects a coverage value outside the discrete set", () => {
    expect(analystAssessmentSchema.safeParse(base({ coverage: 0.7 as unknown as 1 })).success).toBe(false);
  });

  // Case 37: numeric raw anchor with no cited evidence fails validation.
  it("rejects a numeric anchor with no supporting or opposing claim", () => {
    expect(analystAssessmentSchema.safeParse(base({ supportingClaimIds: [], opposingClaimIds: [] })).success).toBe(false);
  });

  // A caller cannot smuggle a confidence scalar through the analyst assessment;
  // it fails loud rather than being silently stripped.
  it("rejects an analyst-supplied confidence key", () => {
    expect(analystAssessmentSchema.safeParse({ ...base(), confidence: 0.95 } as never).success).toBe(false);
  });

  it("rejects analyst-supplied computed-confidence override fields", () => {
    for (const key of ["computedConfidence", "effectiveReliability", "reliabilityCap"]) {
      expect(analystAssessmentSchema.safeParse({ ...base(), [key]: 0.9 } as never).success).toBe(false);
    }
  });

  it("a valid analyst assessment with normal inputs still parses", () => {
    const r = analystAssessmentSchema.safeParse(base({ supportingClaimIds: ["claim-1", "claim-2"], coverage: 0.5 }));
    expect(r.success).toBe(true);
  });

  it("scoreCriterion derives confidence only through resolveConfidence", () => {
    const r = scoreCriterion(base({ rawAnchor: 100, coverage: 1 }), evidenceAt(0.9));
    expect(r.confidence).toBeCloseTo(0.9, 10);
  });

  // Analyst anchor sets direction; it does not touch evidence confidence.
  it("raw anchor changes judgment direction but not evidence confidence", () => {
    const ev = evidenceAt(0.6);
    const up = scoreCriterion(base({ rawAnchor: 100 }), ev);
    const down = scoreCriterion(base({ rawAnchor: 0 }), ev);
    expect(up.confidence).toBe(down.confidence);
    expect(up.internalAdjustedScore).toBeGreaterThan(50);
    expect(down.internalAdjustedScore).toBeLessThan(50);
  });
});
