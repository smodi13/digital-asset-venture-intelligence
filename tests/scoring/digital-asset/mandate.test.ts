import { describe, it, expect } from "vitest";
import { evaluateDigitalAssetMandate } from "@/lib/scoring/digital-asset/mandate";

describe("digital-asset mandate: eligibility and evidence sufficiency are separate", () => {
  it("insufficient public evidence is NOT an exclusion: yields unresolved, not ineligible", () => {
    const r = evaluateDigitalAssetMandate({
      hardExclusionTriggered: false,
      noAccessibleInstrument: false,
      coreQuestionsResolvable: false,
    });
    expect(r.eligibility).toBe("unresolved");
    expect(r.evidenceSufficiency).toBe("insufficient");
    expect(r.eligibility).not.toBe("ineligible");
  });

  it("a clear hard exclusion yields ineligible even with sufficient evidence", () => {
    const r = evaluateDigitalAssetMandate({
      hardExclusionTriggered: true,
      noAccessibleInstrument: false,
      coreQuestionsResolvable: true,
    });
    expect(r.eligibility).toBe("ineligible");
  });

  it("no accessible investable instrument (not merely 'no token') is a mandate issue", () => {
    const r = evaluateDigitalAssetMandate({
      hardExclusionTriggered: false,
      noAccessibleInstrument: true,
      coreQuestionsResolvable: true,
    });
    expect(r.eligibility).toBe("ineligible");
  });

  it("sufficient evidence with no exclusion yields eligible", () => {
    const r = evaluateDigitalAssetMandate({
      hardExclusionTriggered: false,
      noAccessibleInstrument: false,
      coreQuestionsResolvable: true,
    });
    expect(r.eligibility).toBe("eligible");
    expect(r.evidenceSufficiency).toBe("sufficient");
  });

  it("a pseudonymous team alone is not a hard exclusion input", () => {
    // Pseudonymity is not represented as hardExclusionTriggered by itself;
    // callers must independently evaluate governance/continuity evidence.
    const r = evaluateDigitalAssetMandate({
      hardExclusionTriggered: false,
      noAccessibleInstrument: false,
      coreQuestionsResolvable: true,
    });
    expect(r.eligibility).toBe("eligible");
  });
});
