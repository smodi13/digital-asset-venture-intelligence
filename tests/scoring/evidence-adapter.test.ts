import { describe, it, expect } from "vitest";
import {
  adaptCriterionEvidence,
  currentnessMattersFor,
  SCREENING_CURRENTNESS_POLICY,
  UntraceableDerivedClaimError,
  UnmappedReliabilityError,
  UnresolvedSourceError,
  OriginatesFromCycleError,
  AmbiguousReproductionError,
  FreshnessDateError,
  AdapterInputError,
  type AdapterClaim,
  type AdaptCriterionEvidenceOptions,
} from "@/lib/scoring/evidence-adapter";
import { resolveConfidence } from "@/lib/scoring/confidence";
import type { SourceRecord } from "@/lib/schemas/source-record";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function src(over: Partial<SourceRecord> & { id: string }): SourceRecord {
  return {
    schemaVersion: 6,
    publisher: "Publisher",
    title: "Title",
    url: null,
    sourceType: "independent_journalism",
    tier: "b",
    reliability: 0.7,
    accessedAt: "2026-05-01T00:00:00.000Z",
    publishedAt: null,
    isPressReleaseReproduction: false,
    originatesFrom: null,
    supportRole: null,
    termsNote: null,
    ...over,
  };
}

function claim(over: Partial<AdapterClaim> & { id: string }): AdapterClaim {
  return {
    schemaVersion: 6,
    companyId: "co-x",
    claim: "A checkable statement.",
    statedValue: null,
    numericValue: null,
    unit: null,
    sourceId: "src-primary",
    supportingSourceIds: [],
    sourceUrl: null,
    publicationDate: "2026-02-01",
    metricAsOfDate: "2026-02-01",
    lastVerified: "2026-03-01T00:00:00.000Z",
    provenance: "sourced",
    sourceSubtype: "reported_fact",
    confidence: "medium",
    modelEligibility: "context_only",
    topic: "growth_momentum",
    notes: null,
    evidenceStatus: null,
    analystInterpretation: null,
    diligenceQuestion: null,
    researchAssessmentId: null,
    hardeningRef: null,
    verbatimExcerpt: null,
    contradicts: [],
    contradictedBy: [],
    contradictionNote: null,
    ...over,
  } as AdapterClaim;
}

const AS_OF = "2026-06-01";

function run(
  over: Partial<AdaptCriterionEvidenceOptions> & {
    claims: readonly AdapterClaim[];
    sources: readonly SourceRecord[];
  },
) {
  return adaptCriterionEvidence({
    criterionId: "observable_scale_vs_primary_capital",
    asOfDate: AS_OF,
    ...over,
  });
}

const classesOf = (r: ReturnType<typeof adaptCriterionEvidence>) =>
  r.resolutionInput.evidence.map((e) => e.reliabilityClass);
const originsOf = (r: ReturnType<typeof adaptCriterionEvidence>) =>
  new Set(r.resolutionInput.evidence.map((e) => e.originKey));

/* -------------------------------------------------------------------------- */
/* Currentness policy                                                         */
/* -------------------------------------------------------------------------- */

describe("screening currentness policy", () => {
  it("covers exactly the 14 screening criteria", () => {
    expect(Object.keys(SCREENING_CURRENTNESS_POLICY)).toHaveLength(14);
  });

  it("disables freshness only for scale-vs-capital and founder-problem-fit", () => {
    const disabled = Object.entries(SCREENING_CURRENTNESS_POLICY)
      .filter(([, v]) => !v)
      .map(([k]) => k)
      .sort();
    expect(disabled).toEqual(["founder_problem_fit", "observable_scale_vs_primary_capital"]);
  });

  it("throws for a non-screening criterion", () => {
    expect(() => currentnessMattersFor("nonsense")).toThrow(AdapterInputError);
  });
});

/* -------------------------------------------------------------------------- */
/* 1-4  Provenance admissibility                                              */
/* -------------------------------------------------------------------------- */

describe("provenance admissibility", () => {
  it("1: assumption claim is inadmissible", () => {
    const r = run({
      claims: [claim({ id: "a", provenance: "assumption", sourceSubtype: null, sourceId: null })],
      sources: [],
    });
    expect(r.excludedClaimIds).toEqual(["a"]);
    expect(r.admittedClaimIds).toEqual([]);
    expect(r.resolutionInput.evidence).toHaveLength(0);
  });

  it("2: unknown claim is inadmissible", () => {
    const r = run({
      claims: [claim({ id: "u", provenance: "unknown", sourceSubtype: null, sourceId: null })],
      sources: [],
    });
    expect(r.excludedClaimIds).toEqual(["u"]);
    expect(r.resolutionInput.evidence).toHaveLength(0);
  });

  it("3: untraceable derived claim fails", () => {
    expect(() =>
      run({
        claims: [claim({ id: "d", provenance: "derived", sourceSubtype: null })],
        sources: [src({ id: "src-primary" })],
      }),
    ).toThrow(UntraceableDerivedClaimError);

    expect(() =>
      run({
        claims: [
          claim({ id: "d", provenance: "derived", sourceSubtype: null, derivedInputClaimIds: ["missing"] }),
        ],
        sources: [src({ id: "src-primary" })],
      }),
    ).toThrow(UntraceableDerivedClaimError);
  });

  it("4: traceable derived claim preserves the dependency chain", () => {
    const a = claim({ id: "a", sourceId: "src-a" });
    const b = claim({ id: "b", sourceId: "src-b" });
    const d = claim({
      id: "d",
      provenance: "derived",
      sourceSubtype: null,
      derivedInputClaimIds: ["a", "b"],
    });
    const r = run({
      claims: [a, b, d],
      sources: [src({ id: "src-a" }), src({ id: "src-b" })],
    });
    const derivedEv = r.resolutionInput.evidence.find((e) => e.claimId === "d")!;
    expect(derivedEv.originKey).toBe("derived:d");
    expect(derivedEv.derivedFromConfidences).toHaveLength(2);
    const traceEntry = r.trace.find((t) => t.claimId === "d")!;
    expect(traceEntry.derivedInputClaimIds).toEqual(["a", "b"]);
    // Each input claim resolves to 0.9; the derived claim in isolation is
    // 0.95 * min(0.9, 0.9) = 0.855, never more.
    expect(derivedEv.derivedFromConfidences).toEqual([0.9, 0.9]);
    const derivedOnly = resolveConfidence({ evidence: [derivedEv], currentnessMatters: false });
    expect(derivedOnly.confidence).toBeCloseTo(0.855, 10);
  });
});

/* -------------------------------------------------------------------------- */
/* 5-18  Reliability mapping                                                  */
/* -------------------------------------------------------------------------- */

describe("reliability mapping", () => {
  it("5: company_reported identity -> direct_company_verifiable_fact", () => {
    const r = run({
      claims: [claim({ id: "c", sourceSubtype: "company_reported", topic: "identity" })],
      sources: [src({ id: "src-primary", sourceType: "official_company" })],
    });
    expect(classesOf(r)).toEqual(["direct_company_verifiable_fact"]);
  });

  it("6: company_reported non-identity -> company_private_kpi", () => {
    const r = run({
      claims: [claim({ id: "c", sourceSubtype: "company_reported", topic: "growth_momentum" })],
      sources: [src({ id: "src-primary", sourceType: "official_company" })],
    });
    expect(classesOf(r)).toEqual(["company_private_kpi"]);
  });

  it("7: a company KPI repeated by 5 publications has one company origin", () => {
    const r = run({
      claims: [
        claim({
          id: "c",
          sourceSubtype: "company_reported",
          topic: "growth_momentum",
          sourceId: "s1",
          supportingSourceIds: ["s2", "s3", "s4", "s5"],
        }),
      ],
      sources: [
        src({ id: "s1", sourceType: "official_company" }),
        src({ id: "s2", sourceType: "independent_journalism" }),
        src({ id: "s3", sourceType: "specialist_industry" }),
        src({ id: "s4", sourceType: "investor_industry" }),
        src({ id: "s5", sourceType: "structured_secondary" }),
      ],
    });
    expect(r.resolutionInput.evidence).toHaveLength(5);
    expect(originsOf(r)).toEqual(new Set(["company:co-x"]));
  });

  it("8: a company KPI repeated by independent journalism does not become independent_reported_fact", () => {
    const r = run({
      claims: [
        claim({
          id: "c",
          sourceSubtype: "company_reported",
          topic: "growth_momentum",
          sourceId: "s1",
          supportingSourceIds: ["s2"],
        }),
      ],
      sources: [
        src({ id: "s1", sourceType: "official_company" }),
        src({ id: "s2", sourceType: "independent_journalism" }),
      ],
    });
    expect(new Set(classesOf(r))).toEqual(new Set(["company_private_kpi"]));
  });

  it("9: third_party_estimate -> structured_third_party_estimate regardless of publisher", () => {
    const r = run({
      claims: [claim({ id: "c", sourceSubtype: "third_party_estimate" })],
      sources: [src({ id: "src-primary", sourceType: "regulatory" })],
    });
    expect(classesOf(r)).toEqual(["structured_third_party_estimate"]);
  });

  it("10: independent third-party estimates may combine but cannot exceed the 0.70 cap", () => {
    const r = run({
      claims: [
        claim({ id: "c1", sourceSubtype: "third_party_estimate", sourceId: "sa" }),
        claim({ id: "c2", sourceSubtype: "third_party_estimate", sourceId: "sb" }),
      ],
      sources: [src({ id: "sa" }), src({ id: "sb" })],
    });
    expect(originsOf(r).size).toBe(2);
    const resolved = resolveConfidence(r.resolutionInput);
    expect(resolved.confidence).toBeLessThanOrEqual(0.7 + 1e-9);
    expect(resolved.confidence).toBeCloseTo(0.7, 10);
  });

  const reportedFactCases: Array<[SourceRecord["sourceType"], string]> = [
    ["regulatory", "regulatory_legal_fact"],
    ["independent_journalism", "independent_reported_fact"],
    ["customer_vendor", "customer_vendor_own_experience"],
    ["official_company", "direct_company_verifiable_fact"],
    ["identified_social", "direct_company_verifiable_fact"],
    ["investor_industry", "investor_industry_evidence"],
    ["structured_secondary", "investor_industry_evidence"],
  ];
  reportedFactCases.forEach(([sourceType, expected], i) => {
    it(`${11 + i}: reported_fact + ${sourceType} -> ${expected}`, () => {
      const r = run({
        claims: [claim({ id: "c", sourceSubtype: "reported_fact" })],
        sources: [src({ id: "src-primary", sourceType })],
      });
      expect(classesOf(r)).toEqual([expected]);
    });
  });

  it("18: an unmapped source type fails loud", () => {
    expect(() =>
      run({
        claims: [claim({ id: "c", sourceSubtype: "reported_fact" })],
        sources: [src({ id: "src-primary", sourceType: "community" })],
      }),
    ).toThrow(UnmappedReliabilityError);
  });
});

/* -------------------------------------------------------------------------- */
/* 19-24  Source relationships and origin resolution                         */
/* -------------------------------------------------------------------------- */

describe("source and origin resolution", () => {
  it("19: a supporting source resolves and contributes evidence", () => {
    const r = run({
      claims: [claim({ id: "c", sourceSubtype: "reported_fact", sourceId: "p", supportingSourceIds: ["s"] })],
      sources: [
        src({ id: "p", sourceType: "independent_journalism" }),
        src({ id: "s", sourceType: "regulatory" }),
      ],
    });
    expect(r.resolutionInput.evidence).toHaveLength(2);
  });

  it("20: an unresolved primary source fails", () => {
    expect(() =>
      run({
        claims: [claim({ id: "c", sourceSubtype: "reported_fact", sourceId: "gone" })],
        sources: [],
      }),
    ).toThrow(UnresolvedSourceError);
  });

  it("21: an originatesFrom chain resolves to its root", () => {
    const r = run({
      claims: [claim({ id: "c", sourceSubtype: "reported_fact", sourceId: "wire" })],
      sources: [
        src({ id: "wire", sourceType: "structured_secondary", originatesFrom: "mid" }),
        src({ id: "mid", sourceType: "structured_secondary", originatesFrom: "root" }),
        src({ id: "root", sourceType: "independent_journalism" }),
      ],
    });
    expect(originsOf(r)).toEqual(new Set(["source:root"]));
    // Reliability class maps from the claim's own cited source class; the
    // originatesFrom chain governs origin only, not reliability.
    expect(classesOf(r)).toEqual(["investor_industry_evidence"]);
  });

  it("22: an originatesFrom cycle fails", () => {
    expect(() =>
      run({
        claims: [claim({ id: "c", sourceSubtype: "reported_fact", sourceId: "a" })],
        sources: [
          src({ id: "a", originatesFrom: "b" }),
          src({ id: "b", originatesFrom: "a" }),
        ],
      }),
    ).toThrow(OriginatesFromCycleError);
  });

  it("23: a company press-release reproduction resolves to company origin", () => {
    const r = run({
      claims: [claim({ id: "c", sourceSubtype: "reported_fact", sourceId: "pr" })],
      sources: [src({ id: "pr", sourceType: "official_company", isPressReleaseReproduction: true })],
    });
    expect(originsOf(r)).toEqual(new Set(["company:co-x"]));
  });

  it("24: an ambiguous non-company reproduction without an origin fails", () => {
    expect(() =>
      run({
        claims: [claim({ id: "c", sourceSubtype: "reported_fact", sourceId: "wire" })],
        sources: [
          src({ id: "wire", sourceType: "independent_journalism", isPressReleaseReproduction: true }),
        ],
      }),
    ).toThrow(AmbiguousReproductionError);
  });
});

/* -------------------------------------------------------------------------- */
/* 25-26  Hard separation                                                     */
/* -------------------------------------------------------------------------- */

describe("hard separation from research metadata", () => {
  it("25: research confidence cannot affect the mapped class", () => {
    const low = run({
      claims: [claim({ id: "c", sourceSubtype: "reported_fact", confidence: "unknown", evidenceStatus: "insufficient" })],
      sources: [src({ id: "src-primary", sourceType: "regulatory" })],
    });
    const high = run({
      claims: [claim({ id: "c", sourceSubtype: "reported_fact", confidence: "high", evidenceStatus: "supported" })],
      sources: [src({ id: "src-primary", sourceType: "regulatory" })],
    });
    expect(classesOf(low)).toEqual(["regulatory_legal_fact"]);
    expect(classesOf(high)).toEqual(["regulatory_legal_fact"]);
    expect(resolveConfidence(low.resolutionInput).confidence).toBe(
      resolveConfidence(high.resolutionInput).confidence,
    );
  });

  it("26: SourceRecord.reliability and tier cannot affect the mapped class or confidence", () => {
    const weak = run({
      claims: [claim({ id: "c", sourceSubtype: "reported_fact" })],
      sources: [src({ id: "src-primary", sourceType: "regulatory", reliability: 0.01, tier: "d" })],
    });
    const strong = run({
      claims: [claim({ id: "c", sourceSubtype: "reported_fact" })],
      sources: [src({ id: "src-primary", sourceType: "regulatory", reliability: 0.99, tier: "a" })],
    });
    expect(classesOf(weak)).toEqual(classesOf(strong));
    expect(resolveConfidence(weak.resolutionInput).confidence).toBe(
      resolveConfidence(strong.resolutionInput).confidence,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 27-33  Freshness                                                           */
/* -------------------------------------------------------------------------- */

describe("freshness policy", () => {
  it("27: observable_scale_vs_primary_capital has freshness disabled", () => {
    const r = run({
      criterionId: "observable_scale_vs_primary_capital",
      claims: [claim({ id: "c", publicationDate: "2010-01-01", metricAsOfDate: "2010-01-01" })],
      sources: [src({ id: "src-primary", sourceType: "regulatory" })],
    });
    expect(r.resolutionInput.currentnessMatters).toBe(false);
    expect(r.resolutionInput.evidence[0]!.ageDays).toBeUndefined();
    expect(resolveConfidence(r.resolutionInput).freshnessFactor).toBe(1);
  });

  it("28: founder_problem_fit has freshness disabled", () => {
    const r = run({
      criterionId: "founder_problem_fit",
      claims: [claim({ id: "c", publicationDate: "2009-01-01", metricAsOfDate: "2009-01-01" })],
      sources: [src({ id: "src-primary", sourceType: "regulatory" })],
    });
    expect(r.resolutionInput.evidence[0]!.ageDays).toBeUndefined();
  });

  it("29: a current criterion uses metricAsOfDate first", () => {
    const r = run({
      criterionId: "recent_operating_growth",
      claims: [
        claim({
          id: "c",
          metricAsOfDate: "2026-01-01",
          publicationDate: "2026-05-01",
          lastVerified: "2026-05-20T00:00:00.000Z",
        }),
      ],
      sources: [src({ id: "src-primary", sourceType: "regulatory" })],
    });
    expect(r.trace[0]!.observationDate).toBe("2026-01-01");
    expect(r.resolutionInput.evidence[0]!.ageDays).toBe(151);
  });

  it("30: then publicationDate", () => {
    const r = run({
      criterionId: "recent_operating_growth",
      claims: [
        claim({ id: "c", metricAsOfDate: null, publicationDate: "2026-05-01", lastVerified: "2026-05-20T00:00:00.000Z" }),
      ],
      sources: [src({ id: "src-primary", sourceType: "regulatory" })],
    });
    expect(r.trace[0]!.observationDate).toBe("2026-05-01");
  });

  it("31: then lastVerified", () => {
    const r = run({
      criterionId: "recent_operating_growth",
      claims: [claim({ id: "c", metricAsOfDate: null, publicationDate: null, lastVerified: "2026-05-20T00:00:00.000Z" })],
      sources: [src({ id: "src-primary", sourceType: "regulatory" })],
    });
    expect(r.trace[0]!.observationDate).toBe("2026-05-20T00:00:00.000Z");
  });

  it("32: a missing freshness date fails for a current criterion", () => {
    expect(() =>
      run({
        criterionId: "recent_operating_growth",
        claims: [claim({ id: "c", metricAsOfDate: null, publicationDate: null, lastVerified: null })],
        sources: [src({ id: "src-primary", sourceType: "regulatory" })],
      }),
    ).toThrow(FreshnessDateError);
  });

  it("33: a future freshness date fails", () => {
    expect(() =>
      run({
        criterionId: "recent_operating_growth",
        claims: [claim({ id: "c", metricAsOfDate: "2027-01-01" })],
        sources: [src({ id: "src-primary", sourceType: "regulatory" })],
      }),
    ).toThrow(FreshnessDateError);
  });
});

/* -------------------------------------------------------------------------- */
/* 34-37  Contradiction mapping                                               */
/* -------------------------------------------------------------------------- */

describe("contradiction mapping", () => {
  it("34: an explicit qualifying sourced contradiction -> material", () => {
    const r = run({
      claims: [
        claim({ id: "a", sourceSubtype: "reported_fact", sourceId: "sa", contradicts: ["b"] }),
        claim({ id: "b", sourceSubtype: "reported_fact", sourceId: "sb" }),
      ],
      sources: [src({ id: "sa" }), src({ id: "sb" })],
    });
    expect(r.contradiction).toBe("material");
  });

  it("35: a contradiction note only -> minor", () => {
    const r = run({
      claims: [claim({ id: "a", sourceSubtype: "reported_fact", contradictionNote: "figures disagree" })],
      sources: [src({ id: "src-primary" })],
    });
    expect(r.contradiction).toBe("minor");
  });

  it("36: an excluded unknown claim does not create a material contradiction", () => {
    const r = run({
      claims: [
        claim({ id: "a", sourceSubtype: "reported_fact", contradicts: ["u"] }),
        claim({ id: "u", provenance: "unknown", sourceSubtype: null, sourceId: null }),
      ],
      sources: [src({ id: "src-primary" })],
    });
    expect(r.contradiction).toBe("none");
  });

  it("37: an excluded sourced contradictory claim can create a material contradiction", () => {
    const r = run({
      claims: [
        claim({ id: "a", sourceSubtype: "reported_fact", contradicts: ["x"] }),
        claim({ id: "x", sourceSubtype: "reported_fact", sourceId: "sx", reviewedButExcluded: true }),
      ],
      sources: [src({ id: "src-primary" }), src({ id: "sx" })],
    });
    expect(r.excludedClaimIds).toContain("x");
    expect(r.contradiction).toBe("material");
  });
});

/* -------------------------------------------------------------------------- */
/* 38  No caller confidence override                                          */
/* -------------------------------------------------------------------------- */

describe("no caller confidence override", () => {
  it("38: the adapter rejects any extra option key", () => {
    expect(() =>
      adaptCriterionEvidence({
        criterionId: "observable_scale_vs_primary_capital",
        asOfDate: AS_OF,
        claims: [claim({ id: "c" })],
        sources: [src({ id: "src-primary" })],
        // @ts-expect-error caller confidence override is not part of the API
        confidence: 0.99,
      }),
    ).toThrow(AdapterInputError);
  });

  it("38b: the resolution input carries no confidence scalar, only described evidence", () => {
    const r = run({
      claims: [claim({ id: "c", sourceSubtype: "reported_fact" })],
      sources: [src({ id: "src-primary" })],
    });
    for (const e of r.resolutionInput.evidence) {
      expect(e).not.toHaveProperty("quality");
      expect(e).not.toHaveProperty("confidence");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Phase 5C-E: reviewed-but-excluded evidence hardening                       */
/* -------------------------------------------------------------------------- */

describe("Phase 5C-E: reviewed-but-excluded adapter hardening", () => {
  const admittedSourced = () =>
    claim({ id: "keep", sourceSubtype: "reported_fact", sourceId: "s-keep" });
  const keepSrc = () => src({ id: "s-keep", sourceType: "independent_journalism" });

  // A baseline covered result so we can prove the excluded claim changes nothing.
  const baseline = () =>
    run({ claims: [admittedSourced()], sources: [keepSrc()] });

  it("39: an excluded unknown claim is accepted for audit and does not throw", () => {
    const r = run({
      claims: [admittedSourced(), claim({ id: "x", provenance: "unknown", sourceSubtype: null, sourceId: null, reviewedButExcluded: true })],
      sources: [keepSrc()],
    });
    expect(r.excludedClaimIds).toContain("x");
    expect(r.trace.find((t) => t.claimId === "x")!.rule).toBe("admissibility.reviewed_but_excluded");
  });

  it("40: an excluded assumption claim is accepted for audit and does not throw", () => {
    const r = run({
      claims: [admittedSourced(), claim({ id: "x", provenance: "assumption", sourceSubtype: null, sourceId: null, reviewedButExcluded: true })],
      sources: [keepSrc()],
    });
    expect(r.excludedClaimIds).toContain("x");
  });

  it("41: an excluded UNTRACEABLE DERIVED claim is accepted for audit and does not throw", () => {
    expect(() =>
      run({
        claims: [
          admittedSourced(),
          claim({ id: "x", provenance: "derived", sourceSubtype: null, sourceId: null, reviewedButExcluded: true }),
        ],
        sources: [keepSrc()],
      }),
    ).not.toThrow();
  });

  it("42: an excluded inadmissible claim emits zero scoring CitedEvidence", () => {
    const r = run({
      claims: [
        admittedSourced(),
        claim({ id: "x", provenance: "derived", sourceSubtype: null, sourceId: null, reviewedButExcluded: true }),
      ],
      sources: [keepSrc()],
    });
    expect(r.resolutionInput.evidence.some((e) => e.claimId === "x")).toBe(false);
    expect(r.trace.find((t) => t.claimId === "x")!.admitted).toBe(false);
  });

  it("43-45: an excluded inadmissible claim cannot change confidence, coverage, or adjusted score", () => {
    const base = resolveConfidence(baseline().resolutionInput);
    const withExcluded = run({
      claims: [
        admittedSourced(),
        claim({ id: "x", provenance: "derived", sourceSubtype: null, sourceId: null, reviewedButExcluded: true, contradicts: ["keep"] }),
      ],
      sources: [keepSrc()],
    });
    const after = resolveConfidence(withExcluded.resolutionInput);
    expect(after.confidence).toBe(base.confidence);
    expect(after.reliabilityCap).toBe(base.reliabilityCap);
    expect(after.contradictionFactor).toBe(base.contradictionFactor);
    // Same admitted evidence set -> identical CitedEvidence.
    expect(withExcluded.resolutionInput.evidence).toEqual(baseline().resolutionInput.evidence);
    expect(withExcluded.contradiction).toBe("none");
  });

  it("46: an excluded unknown claim cannot create a material contradiction by itself", () => {
    const r = run({
      claims: [
        claim({ id: "a", sourceSubtype: "reported_fact", sourceId: "sa", contradicts: ["x"] }),
        claim({ id: "x", provenance: "unknown", sourceSubtype: null, sourceId: null, reviewedButExcluded: true }),
      ],
      sources: [src({ id: "sa" })],
    });
    expect(r.contradiction).toBe("none");
  });

  it("47: an excluded untraceable derived claim cannot create a material contradiction", () => {
    const r = run({
      claims: [
        claim({ id: "a", sourceSubtype: "reported_fact", sourceId: "sa", contradicts: ["x"] }),
        claim({ id: "x", provenance: "derived", sourceSubtype: null, sourceId: null, reviewedButExcluded: true }),
      ],
      sources: [src({ id: "sa" })],
    });
    expect(r.contradiction).toBe("none");
  });

  it("48: an excluded SOURCED explicitly contradictory claim can create a material contradiction", () => {
    const r = run({
      claims: [
        claim({ id: "a", sourceSubtype: "reported_fact", sourceId: "sa", contradicts: ["x"] }),
        claim({ id: "x", sourceSubtype: "reported_fact", sourceId: "sx", reviewedButExcluded: true }),
      ],
      sources: [src({ id: "sa" }), src({ id: "sx" })],
    });
    expect(r.excludedClaimIds).toContain("x");
    expect(r.contradiction).toBe("material");
  });

  it("49: an ADMITTED untraceable derived claim still throws", () => {
    expect(() =>
      run({
        claims: [claim({ id: "d", provenance: "derived", sourceSubtype: null })],
        sources: [src({ id: "src-primary" })],
      }),
    ).toThrow(UntraceableDerivedClaimError);
  });

  it("50: an ADMITTED unknown claim still contributes no evidence (remains inadmissible)", () => {
    const r = run({
      claims: [claim({ id: "u", provenance: "unknown", sourceSubtype: null, sourceId: null })],
      sources: [],
    });
    expect(r.resolutionInput.evidence).toHaveLength(0);
    expect(r.admittedClaimIds).toEqual([]);
  });

  it("51: no caller-side filtering is needed for an excluded untraceable derived claim", () => {
    // The Phase 5C-D calibration runner had to withhold clm-003b362358 before
    // calling the adapter. That workaround is no longer required: the claim can
    // be passed straight through with reviewedButExcluded set.
    const passedThrough = run({
      claims: [
        admittedSourced(),
        claim({ id: "clm-003b362358", provenance: "derived", sourceSubtype: null, sourceId: null, reviewedButExcluded: true }),
      ],
      sources: [keepSrc()],
    });
    const preFiltered = run({ claims: [admittedSourced()], sources: [keepSrc()] });
    expect(passedThrough.resolutionInput).toEqual(preFiltered.resolutionInput);
    expect(passedThrough.excludedClaimIds).toContain("clm-003b362358");
  });

  it("52: the Phase 5C-D Glean pattern works through the adapter directly", () => {
    // Two admitted sourced leaf claims + the reviewed-but-excluded derived
    // claim whose (schema v6) traceable inputs cannot be expressed. The two
    // leaves still score; the derived claim is audit-only.
    const leafA = claim({ id: "leaf-a", sourceSubtype: "company_reported", topic: "growth_momentum", sourceId: "co-src" });
    const leafB = claim({ id: "leaf-b", sourceSubtype: "reported_fact", sourceId: "j-src" });
    const derived = claim({
      id: "clm-003b362358",
      provenance: "derived",
      sourceSubtype: null,
      sourceId: null,
      reviewedButExcluded: true,
    });
    const r = run({
      criterionId: "monetization_recurrence_and_value_alignment",
      claims: [leafA, leafB, derived],
      sources: [
        src({ id: "co-src", sourceType: "official_company" }),
        src({ id: "j-src", sourceType: "independent_journalism" }),
      ],
    });
    expect(r.admittedClaimIds.sort()).toEqual(["leaf-a", "leaf-b"]);
    expect(r.excludedClaimIds).toEqual(["clm-003b362358"]);
    expect(r.resolutionInput.evidence.some((e) => e.claimId === "clm-003b362358")).toBe(false);
    expect(resolveConfidence(r.resolutionInput).confidence).toBeGreaterThan(0);
  });
});
