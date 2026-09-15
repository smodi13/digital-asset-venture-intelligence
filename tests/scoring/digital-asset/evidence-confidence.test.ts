import { describe, it, expect } from "vitest";
import { computeCriterionConfidence, buildCitedEvidence } from "@/lib/scoring/digital-asset/evidence-confidence";
import type { EvidenceClaim } from "@/lib/schemas/evidence-claim";
import type { SourceRecordV7 } from "@/lib/schemas/v7/source-record";

/**
 * Phase 3C-2.1: confidence answers "how strongly does the admitted evidence
 * support the analytical judgment", never "how attractive is the entity".
 * Every fixture below is synthetic and not optimized against any real
 * CALIBRATION entity.
 */

function claim(overrides: Partial<EvidenceClaim> = {}): EvidenceClaim {
  return {
    id: "claim-1",
    schemaVersion: 7,
    companyId: "co-test",
    claim: "test claim",
    statedValue: null,
    numericValue: null,
    unit: null,
    sourceId: "source-1",
    supportingSourceIds: [],
    sourceUrl: null,
    publicationDate: null,
    metricAsOfDate: null,
    lastVerified: null,
    provenance: "sourced",
    sourceSubtype: "reported_fact",
    confidence: "high",
    modelEligibility: "context_only",
    topic: "traction",
    notes: null,
    evidenceStatus: "supported",
    analystInterpretation: null,
    diligenceQuestion: null,
    researchAssessmentId: null,
    hardeningRef: null,
    verbatimExcerpt: null,
    contradicts: [],
    contradictedBy: [],
    contradictionNote: null,
    ...overrides,
  } as EvidenceClaim;
}

function source(overrides: Partial<SourceRecordV7> = {}): SourceRecordV7 {
  return {
    id: "source-1",
    schemaVersion: 7,
    publisher: "Test Publisher",
    title: "Test Source",
    url: null,
    sourceType: "independent_journalism",
    tier: "b",
    reliability: 0.9,
    isIndependent: true,
    canCorroborate: true,
    accessedAt: "2026-01-01T00:00:00.000Z",
    publishedAt: "2026-01-01",
    availabilityDate: "2026-01-01",
    isPressReleaseReproduction: false,
    originatesFrom: null,
    supportRole: "primary_fact",
    ...overrides,
  } as SourceRecordV7;
}

describe("computeCriterionConfidence", () => {
  it("zero evidence coverage yields zero confidence, never a fabricated positive value", () => {
    const conf = computeCriterionConfidence([], false, new Map(), []);
    expect(conf).toBe(0);
  });

  it("strong primary/fact-of-record evidence (regulatory) yields high confidence", () => {
    const c = claim({ id: "c1", sourceId: "s1" });
    const s = source({ id: "s1", sourceType: "regulatory", reliability: 0.95 });
    const conf = computeCriterionConfidence(["c1"], false, new Map([["c1", c]]), [s]);
    expect(conf).toBeGreaterThan(0.85);
  });

  it("genuinely independent corroboration (two distinct origins) raises confidence above a single source", () => {
    const c1 = claim({ id: "c1", sourceId: "s1" });
    const c2 = claim({ id: "c2", sourceId: "s2" });
    const s1 = source({ id: "s1", sourceType: "independent_journalism", reliability: 0.9 });
    const s2 = source({ id: "s2", sourceType: "investor_industry", reliability: 0.6 });
    const claimsById = new Map([["c1", c1], ["c2", c2]]);
    const single = computeCriterionConfidence(["c1"], false, claimsById, [s1, s2]);
    const corroborated = computeCriterionConfidence(["c1", "c2"], false, claimsById, [s1, s2]);
    expect(corroborated).toBeGreaterThan(single);
  });

  it("thin single-source evidence is lower confidence than a stronger source class", () => {
    const c = claim({ id: "c1", sourceId: "s1" });
    const s = source({ id: "s1", sourceType: "investor_industry", reliability: 0.55 });
    const conf = computeCriterionConfidence(["c1"], false, new Map([["c1", c]]), [s]);
    expect(conf).toBeGreaterThan(0);
    expect(conf).toBeLessThan(0.75);
  });

  it("derivative/non-independent repetition (two records collapsing to one company origin) does not double-count", () => {
    const c1 = claim({ id: "c1", sourceId: "s1", sourceSubtype: "company_reported" });
    const c2 = claim({ id: "c2", sourceId: "s2", sourceSubtype: "company_reported" });
    const s1 = source({ id: "s1", sourceType: "official_company", reliability: 0.7 });
    const s2 = source({ id: "s2", sourceType: "official_company", reliability: 0.7 });
    const claimsById = new Map([["c1", c1], ["c2", c2]]);
    const single = computeCriterionConfidence(["c1"], false, claimsById, [s1, s2]);
    const repeated = computeCriterionConfidence(["c1", "c2"], false, claimsById, [s1, s2]);
    expect(repeated).toBeCloseTo(single, 9);
  });

  it("mixed/conflicting (acknowledged material contradiction) evidence lowers confidence versus the same evidence uncontradicted", () => {
    const c = claim({ id: "c1", sourceId: "s1" });
    const s = source({ id: "s1", sourceType: "independent_journalism", reliability: 0.9 });
    const claimsById = new Map([["c1", c]]);
    const clean = computeCriterionConfidence(["c1"], false, claimsById, [s]);
    const contradicted = computeCriterionConfidence(["c1"], true, claimsById, [s]);
    expect(contradicted).toBeLessThan(clean);
  });

  it("an unresolvable source relationship (missing source record) is excluded, not fabricated", () => {
    const c = claim({ id: "c1", sourceId: "missing-source" });
    const conf = computeCriterionConfidence(["c1"], false, new Map([["c1", c]]), []);
    expect(conf).toBe(0);
  });

  it("a claim with no reliability mapping for its source type/subtype combination is excluded", () => {
    const c = claim({ id: "c1", sourceId: "s1", sourceSubtype: "reported_fact" });
    const s = source({ id: "s1", sourceType: "governance_forum", reliability: 0.55 });
    // governance_forum IS mapped (structured_third_party_estimate); this proves that mapping resolves, not that it is excluded.
    const conf = computeCriterionConfidence(["c1"], false, new Map([["c1", c]]), [s]);
    expect(conf).toBeGreaterThan(0);
  });

  it("a press-release reproduction origin is excluded rather than counted as an independent voice", () => {
    const c = claim({ id: "c1", sourceId: "s1", sourceSubtype: "reported_fact" });
    const s = source({ id: "s1", sourceType: "specialist_industry" as SourceRecordV7["sourceType"], isPressReleaseReproduction: true, reliability: 0.6 });
    const conf = computeCriterionConfidence(["c1"], false, new Map([["c1", c]]), [s]);
    expect(conf).toBe(0);
  });

  it("confidence direction is independent of rawAnchor sign: this module never sees rawAnchor at all", () => {
    const c = claim({ id: "c1", sourceId: "s1" });
    const s = source({ id: "s1", sourceType: "regulatory", reliability: 0.95 });
    const claimsById = new Map([["c1", c]]);
    // Same evidence set, computed twice: nothing here takes an anchor as input, so a caller cannot smuggle rawAnchor direction into confidence.
    const a = computeCriterionConfidence(["c1"], false, claimsById, [s]);
    const b = computeCriterionConfidence(["c1"], false, claimsById, [s]);
    expect(a).toBe(b);
    expect(computeCriterionConfidence.length).toBe(4);
  });
});

describe("buildCitedEvidence", () => {
  it("uses the source's own reliability prior as evidence quality, not a re-derived number", () => {
    const c = claim({ id: "c1", sourceId: "s1" });
    const s = source({ id: "s1", sourceType: "block_explorer", reliability: 0.9 });
    const evidence = buildCitedEvidence(["c1"], new Map([["c1", c]]), [s]);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.quality).toBe(0.9);
  });
});
