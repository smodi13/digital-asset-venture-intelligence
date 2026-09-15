import { describe, it, expect } from "vitest";
import {
  scoreConvergence,
  convergenceFamilyStrength,
  familyStrengthsFromPropositions,
  ConvergenceFamilyConflictError,
  type OriginContribution,
  type AtomicProposition,
} from "@/lib/scoring/convergence";

describe("signal convergence", () => {
  // Case 24: one convergence family does not create high convergence.
  it("one strong positive family yields about 30", () => {
    const r = scoreConvergence({ operating_growth: 0.9 });
    expect(r.positiveConvergence).toBeCloseTo(30, 6);
    expect(r.negativeConvergence).toBe(0);
  });

  // Case 25: three genuinely distinct positive families create materially higher convergence.
  it("three distinct positive families yield about 70", () => {
    const r = scoreConvergence({
      operating_growth: 0.8,
      customer_adoption: 0.7,
      product_usage: 0.6,
    });
    expect(r.positiveConvergence).toBeCloseTo(70, 6);
  });

  // Case 26: weak families below 0.25 do not inflate convergence breadth.
  it("ignores families below the active threshold", () => {
    const r = scoreConvergence({ operating_growth: 0.9, customer_adoption: 0.1, product_usage: 0.2 });
    expect(r.positiveActiveFamilies).toEqual(["operating_growth"]);
    expect(r.positiveConvergence).toBeCloseTo(30, 6);
  });

  // Case 27: repeated publications from one origin do not inflate a family.
  it("collapses repeated publications of one origin within a family", () => {
    const one: OriginContribution[] = [{ originKey: "press", value: 0.6 }];
    const many: OriginContribution[] = [
      { originKey: "press", value: 0.6 },
      { originKey: "press", value: 0.6 },
      { originKey: "press", value: 0.6 },
    ];
    expect(convergenceFamilyStrength(many)).toBeCloseTo(convergenceFamilyStrength(one), 10);
  });

  // Case 28: positive and negative convergence remain separately visible.
  it("keeps positive and negative convergence separate", () => {
    const r = scoreConvergence({ operating_growth: 0.8, risk_deterioration: -0.8 });
    expect(r.positiveConvergence).toBeGreaterThan(0);
    expect(r.negativeConvergence).toBeGreaterThan(0);
    expect(r.netConvergence).toBeCloseTo(r.positiveConvergence - r.negativeConvergence, 10);
  });
});

describe("cross-family proposition double counting", () => {
  const prop = (over: Partial<AtomicProposition> = {}): AtomicProposition => ({
    propositionKey: "p",
    originKey: "pub-1",
    primaryFamily: "customer_adoption",
    value: 0.9,
    ...over,
  });

  it("one propositionKey with conflicting families fails loud", () => {
    expect(() =>
      familyStrengthsFromPropositions([
        prop({ primaryFamily: "customer_adoption" }),
        prop({ primaryFamily: "product_usage" }),
      ]),
    ).toThrow(ConvergenceFamilyConflictError);
  });

  it("conflict detection is deterministic regardless of input order", () => {
    const a = [prop({ primaryFamily: "customer_adoption" }), prop({ primaryFamily: "product_usage" })];
    const b = [prop({ primaryFamily: "product_usage" }), prop({ primaryFamily: "customer_adoption" })];
    const msg = (ps: AtomicProposition[]) => {
      try {
        familyStrengthsFromPropositions(ps);
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    };
    expect(msg(a)).toBe(msg(b));
    expect(msg(a)).not.toBeNull();
  });

  it("same propositionKey with the same family deduplicates to one", () => {
    const strengths = familyStrengthsFromPropositions([
      prop({ primaryFamily: "customer_adoption" }),
      prop({ primaryFamily: "customer_adoption" }),
    ]);
    const r = scoreConvergence(strengths);
    expect(r.positiveActiveFamilies).toEqual(["customer_adoption"]);
  });

  it("two distinct atomic claims from one publication may create two families", () => {
    const strengths = familyStrengthsFromPropositions([
      prop({ propositionKey: "customer-count-doubled", primaryFamily: "customer_adoption" }),
      prop({ propositionKey: "usage-per-customer-3x", primaryFamily: "product_usage" }),
    ]);
    const r = scoreConvergence(strengths);
    expect(r.positiveActiveFamilies.sort()).toEqual(["customer_adoption", "product_usage"]);
  });

  it("three publications repeating one proposition remain one proposition", () => {
    const single = familyStrengthsFromPropositions([prop({ originKey: "pub-1" })]);
    const repeated = familyStrengthsFromPropositions([
      prop({ originKey: "pub-1" }),
      prop({ originKey: "pub-2" }),
      prop({ originKey: "pub-3" }),
    ]);
    expect(repeated.customer_adoption).toBeCloseTo(single.customer_adoption!, 10);
  });

  it("three genuinely distinct propositions in three families create breadth", () => {
    const strengths = familyStrengthsFromPropositions([
      prop({ propositionKey: "a", primaryFamily: "operating_growth", value: 0.8 }),
      prop({ propositionKey: "b", primaryFamily: "customer_adoption", value: 0.7 }),
      prop({ propositionKey: "c", primaryFamily: "product_usage", value: 0.6 }),
    ]);
    const r = scoreConvergence(strengths);
    expect(r.positiveActiveFamilies.length).toBe(3);
    expect(r.positiveConvergence).toBeCloseTo(70, 6);
  });

  it("negative and positive propositions remain independently visible", () => {
    const strengths = familyStrengthsFromPropositions([
      prop({ propositionKey: "good", primaryFamily: "operating_growth", value: 0.8 }),
      prop({ propositionKey: "bad", primaryFamily: "risk_deterioration", value: -0.8 }),
    ]);
    const r = scoreConvergence(strengths);
    expect(r.positiveActiveFamilies).toEqual(["operating_growth"]);
    expect(r.negativeActiveFamilies).toEqual(["risk_deterioration"]);
  });

  it("active-family threshold 0.25 still applies to derived strengths", () => {
    const strengths = familyStrengthsFromPropositions([
      prop({ propositionKey: "weak", primaryFamily: "operating_growth", value: 0.2 }),
    ]);
    expect(scoreConvergence(strengths).positiveActiveFamilies).toEqual([]);
  });
});
