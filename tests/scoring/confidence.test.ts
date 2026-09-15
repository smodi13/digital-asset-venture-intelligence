import { describe, it, expect } from "vitest";
import {
  aggregateConfidence,
  derivedConfidence,
  applyContradiction,
  freshnessFactor,
  resolveConfidence,
  type EvidenceItem,
  type CitedEvidence,
} from "@/lib/scoring/confidence";

function cite(over: Partial<CitedEvidence> = {}): CitedEvidence {
  return {
    claimId: "claim-x",
    originKey: "origin-x",
    reliabilityClass: "company_private_kpi",
    ...over,
  };
}

describe("evidence confidence", () => {
  // Case 9: multiple independent third-party estimates cannot exceed the 0.70 cap.
  it("caps three independent structured estimates at 0.70", () => {
    const items: EvidenceItem[] = [
      { originKey: "vendor-a", reliabilityClass: "structured_third_party_estimate", quality: 0.5 },
      { originKey: "vendor-b", reliabilityClass: "structured_third_party_estimate", quality: 0.5 },
      { originKey: "vendor-c", reliabilityClass: "structured_third_party_estimate", quality: 0.5 },
    ];
    // 1 - 0.5^3 = 0.875 mathematically, capped to 0.70.
    expect(aggregateConfidence(items)).toBeCloseTo(0.7, 10);
  });

  // Case 10: two independently originated reported facts may reach but not exceed 0.95.
  it("caps two independent reported facts at 0.95", () => {
    const items: EvidenceItem[] = [
      { originKey: "filing", reliabilityClass: "independent_reported_fact", quality: 0.9 },
      { originKey: "registry", reliabilityClass: "independent_reported_fact", quality: 0.9 },
    ];
    expect(aggregateConfidence(items)).toBeCloseTo(0.95, 10);
  });

  // Case 2: ten articles repeating one CEO KPI remain one underlying origin.
  it("collapses repeated publications of one origin to a single company KPI", () => {
    const one: EvidenceItem[] = [
      { originKey: "ceo-kpi", reliabilityClass: "company_private_kpi" },
    ];
    const ten: EvidenceItem[] = Array.from({ length: 10 }, () => ({
      originKey: "ceo-kpi",
      reliabilityClass: "company_private_kpi" as const,
    }));
    expect(aggregateConfidence(ten)).toBeCloseTo(aggregateConfidence(one), 10);
    expect(aggregateConfidence(ten)).toBeCloseTo(0.7, 10);
  });

  // Case 11: derived claim confidence cannot exceed the weakest input.
  it("derived confidence stays below its weakest input", () => {
    expect(derivedConfidence([0.9, 0.6, 0.8])).toBeCloseTo(0.57, 10);
    expect(derivedConfidence([0.9, 0.6, 0.8])).toBeLessThan(0.6);
  });

  // Case 12: material factual contradiction lowers confidence.
  it("applies the material contradiction factor", () => {
    expect(applyContradiction(0.9, "material")).toBeCloseTo(0.585, 10);
    expect(applyContradiction(0.9, "none")).toBeCloseTo(0.9, 10);
  });

  // Case 13: mixed business evidence is not a factual contradiction and takes no penalty.
  it("does not penalize mixed evidence graded as no contradiction", () => {
    expect(applyContradiction(0.82, "none")).toBeCloseTo(0.82, 10);
  });

  // Case 38: assumptions alone do not create factual coverage / confidence.
  it("assumption-only evidence yields zero confidence", () => {
    expect(
      aggregateConfidence([
        { originKey: "a1", reliabilityClass: "assumption" },
        { originKey: "a2", reliabilityClass: "assumption" },
      ]),
    ).toBe(0);
  });

  it("freshness decays only across the configured bands", () => {
    expect(freshnessFactor(30)).toBe(1);
    expect(freshnessFactor(300)).toBe(0.9);
    expect(freshnessFactor(600)).toBe(0.75);
    expect(freshnessFactor(1000)).toBe(0.5);
  });
});

describe("confidence source of truth (resolveConfidence)", () => {
  it("company_private_kpi cannot be promoted beyond its 0.75 class cap", () => {
    const r = resolveConfidence({
      evidence: [cite({ reliabilityClass: "company_private_kpi", quality: 0.99 })],
    });
    expect(r.confidence).toBeCloseTo(0.75, 10);
  });

  it("structured_third_party_estimate cannot be promoted above 0.70", () => {
    const r = resolveConfidence({
      evidence: [
        cite({ originKey: "a", reliabilityClass: "structured_third_party_estimate", quality: 0.99 }),
        cite({ originKey: "b", reliabilityClass: "structured_third_party_estimate", quality: 0.99 }),
      ],
    });
    expect(r.confidence).toBeCloseTo(0.7, 10);
  });

  it("repeated same-origin publications cannot inflate confidence", () => {
    const one = resolveConfidence({ evidence: [cite({ originKey: "ceo" })] });
    const ten = resolveConfidence({
      evidence: Array.from({ length: 10 }, () => cite({ originKey: "ceo" })),
    });
    expect(ten.confidence).toBeCloseTo(one.confidence, 10);
    expect(ten.originGroupCount).toBe(1);
  });

  it("genuinely independent evidence increases confidence only within class rules", () => {
    const one = resolveConfidence({
      evidence: [cite({ originKey: "a", reliabilityClass: "investor_industry_evidence", quality: 0.6 })],
    });
    const two = resolveConfidence({
      evidence: [
        cite({ originKey: "a", reliabilityClass: "investor_industry_evidence", quality: 0.6 }),
        cite({ originKey: "b", reliabilityClass: "investor_industry_evidence", quality: 0.6 }),
      ],
    });
    expect(two.confidence).toBeGreaterThan(one.confidence);
    expect(two.confidence).toBeLessThanOrEqual(0.75); // class cap
  });

  it("contradiction factor lowers computed confidence", () => {
    const clean = resolveConfidence({ evidence: [cite({ quality: 0.7 })] });
    const conflicted = resolveConfidence({ evidence: [cite({ quality: 0.7 })], contradiction: "material" });
    expect(conflicted.confidence).toBeCloseTo(clean.confidence * 0.65, 10);
  });

  it("freshness lowers computed confidence only when currentness matters", () => {
    const stale = { evidence: [cite({ quality: 0.7, ageDays: 1000 })] };
    expect(resolveConfidence(stale).confidence).toBeCloseTo(0.7, 10); // enduring fact, no decay
    expect(resolveConfidence({ ...stale, currentnessMatters: true }).confidence).toBeCloseTo(0.35, 10);
  });

  it("derived-claim dependency ceilings the contribution below its weakest input", () => {
    const r = resolveConfidence({
      evidence: [
        cite({
          reliabilityClass: "independent_reported_fact",
          quality: 0.9,
          derivedFromConfidences: [0.5, 0.8],
        }),
      ],
    });
    expect(r.confidence).toBeCloseTo(0.95 * 0.5, 10);
  });

  it("exposes no unconstrained confidence input on the resolution contract", () => {
    // The only inputs are evidence descriptors, contradiction, and freshness.
    const r = resolveConfidence({ evidence: [] });
    expect(r.confidence).toBe(0);
  });
});
