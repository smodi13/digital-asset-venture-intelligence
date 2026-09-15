import { describe, it, expect } from "vitest";
import { isCutoffEligible } from "@/lib/backtest/cutoff";
import {
  NOT_ESTABLISHED,
  SCHEMA_VERSION,
  MAX_VERBATIM_EXCERPT_CHARS,
  idSchema,
  propertyValueSchema,
  verbatimExcerptSchema,
  signalEventSchema,
  companySchema,
  personSchema,
  evidenceClaimSchema,
  sourceRecordSchema,
  pipelineRecordSchema,
  passRecordSchema,
  scoreSnapshotSchema,
  historicalOutcomeSchema,
  outreachDraftSchema,
  outreachStatusSchema,
  thesisDimensionSchema,
} from "@/lib/schemas";

/** A minimal valid SignalEvent, cloned and mutated by the cases below. */
const baseEvent = {
  id: "evt-1",
  schemaVersion: SCHEMA_VERSION,
  companyId: "co-1",
  companyNameRaw: "Example Company Alpha",
  entityMatchConfidence: 0.95,
  entityMatchMethod: "domain" as const,
  sourceId: "src-1",
  sourceUrl: "https://example.com/item",
  sourceReliability: 0.7,
  publicationDate: "2025-06-01",
  availabilityDate: "2025-06-01",
  availabilityEvidence: {
    method: "intrinsic_timestamp" as const,
    sourceUrl: "https://example.com/item",
    sourceRecordId: null,
    note: null,
  },
  ingestedAt: "2026-03-15T12:00:00.000Z",
  signalType: "customer_momentum" as const,
  signalCategory: "demand" as const,
  signalDirection: "positive" as const,
  rawStrength: 0.6,
  evidenceSummary: "A paraphrased factual summary of what was observed.",
  claimConfidence: "medium" as const,
};

describe("identity is stable and never positional", () => {
  it("accepts conventional stable ids", () => {
    for (const id of ["evt-1", "co.alpha", "src:2025-01", "a_b-c.d"]) {
      expect(idSchema.safeParse(id).success, id).toBe(true);
    }
  });

  it("rejects an empty id", () => {
    expect(idSchema.safeParse("").success).toBe(false);
  });

  it("rejects ids with spaces or slashes that would break a path or a key", () => {
    for (const id of ["a b", "a/b", " a", "#a"]) {
      expect(idSchema.safeParse(id).success, id).toBe(false);
    }
  });
});

describe("SignalEvent", () => {
  it("accepts a minimal valid event", () => {
    expect(signalEventSchema.safeParse(baseEvent).success).toBe(true);
  });

  it("has no cutoffEligible field, because eligibility is derived at query time", () => {
    const parsed = signalEventSchema.parse(baseEvent);
    expect("cutoffEligible" in parsed).toBe(false);
  });

  it("has no adjustedStrength field, because it depends on thesis and time", () => {
    const parsed = signalEventSchema.parse(baseEvent);
    expect("adjustedStrength" in parsed).toBe(false);
  });

  it("strips an unknown field rather than storing a thesis-dependent value", () => {
    const parsed = signalEventSchema.parse({ ...baseEvent, adjustedStrength: 0.9 });
    expect("adjustedStrength" in parsed).toBe(false);
  });

  it("requires the temporal fields to be present, nullable but never absent", () => {
    const without = (key: string): Record<string, unknown> => {
      const clone: Record<string, unknown> = { ...baseEvent };
      delete clone[key];
      return clone;
    };
    expect(signalEventSchema.safeParse(without("publicationDate")).success).toBe(false);
    expect(signalEventSchema.safeParse(without("availabilityDate")).success).toBe(false);
    expect(signalEventSchema.safeParse(without("availabilityEvidence")).success).toBe(false);
    expect(signalEventSchema.safeParse(without("ingestedAt")).success).toBe(false);
  });

  it("carries no obsolete observationDate field", () => {
    // Replaced by availabilityDate (what can be demonstrated about the world)
    // and ingestedAt (audit metadata about us). The single conflated field
    // could not answer either question correctly.
    const parsed = signalEventSchema.parse(baseEvent);
    expect("observationDate" in parsed).toBe(false);
    const withOld = signalEventSchema.parse({
      ...baseEvent,
      observationDate: "2025-06-02",
    });
    expect("observationDate" in withOld).toBe(false);
  });

  it("permits a null availabilityDate, which makes the event backtest ineligible", () => {
    const parsed = signalEventSchema.safeParse({
      ...baseEvent,
      availabilityDate: null,
      availabilityEvidence: NOT_ESTABLISHED,
    });
    expect(parsed.success).toBe(true);
    expect(
      isCutoffEligible(
        { publicationDate: "2025-06-01", availabilityDate: null },
        "2026-01-01",
      ),
    ).toBe(false);
  });

  it("requires ingestedAt to be a full timestamp, not a bare date", () => {
    expect(signalEventSchema.safeParse({ ...baseEvent, ingestedAt: "2026-03-15" }).success).toBe(
      false,
    );
  });

  it("rejects an ingestedAt that precedes the availabilityDate", () => {
    const result = signalEventSchema.safeParse({
      ...baseEvent,
      availabilityDate: "2026-05-01",
      ingestedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("on or after availabilityDate");
  });

  it("keeps eventDate distinct from availability", () => {
    const parsed = signalEventSchema.parse({
      ...baseEvent,
      eventDate: "2025-01-15",
      availabilityDate: "2025-06-01",
    });
    expect(parsed.eventDate).toBe("2025-01-15");
    expect(parsed.availabilityDate).toBe("2025-06-01");
    expect(parsed.eventDate).not.toBe(parsed.availabilityDate);
  });

  it("ingestedAt does not affect historical eligibility", () => {
    const dates = { publicationDate: "2025-06-01", availabilityDate: "2025-06-01" };
    for (const ingestedAt of [
      "2025-06-02T00:00:00.000Z",
      "2026-03-15T12:00:00.000Z",
      "2030-01-01T00:00:00.000Z",
    ]) {
      const parsed = signalEventSchema.parse({ ...baseEvent, ...dates, ingestedAt });
      expect(isCutoffEligible(parsed, "2026-01-01")).toBe(true);
    }
  });

  it("rejects an unresolved match that still carries a companyId", () => {
    const result = signalEventSchema.safeParse({
      ...baseEvent,
      entityMatchMethod: "unresolved",
      companyId: "co-1",
    });
    expect(result.success).toBe(false);
  });

  it("caps a fuzzy name match at 0.8 confidence", () => {
    const tooConfident = signalEventSchema.safeParse({
      ...baseEvent,
      entityMatchMethod: "fuzzy",
      entityMatchConfidence: 0.95,
    });
    expect(tooConfident.success).toBe(false);

    const acceptable = signalEventSchema.safeParse({
      ...baseEvent,
      entityMatchMethod: "fuzzy",
      entityMatchConfidence: 0.75,
    });
    expect(acceptable.success).toBe(true);
  });

  it("requires an interpretation to state its basis", () => {
    const result = signalEventSchema.safeParse({
      ...baseEvent,
      investmentInterpretation: "This suggests durable demand.",
      interpretationBasis: "unknown",
    });
    expect(result.success).toBe(false);

    const withBasis = signalEventSchema.safeParse({
      ...baseEvent,
      investmentInterpretation: "This suggests durable demand.",
      interpretationBasis: "inferred",
    });
    expect(withBasis.success).toBe(true);
  });

  it("rejects a strength outside 0 to 1", () => {
    expect(signalEventSchema.safeParse({ ...baseEvent, rawStrength: 1.5 }).success).toBe(false);
    expect(signalEventSchema.safeParse({ ...baseEvent, rawStrength: -0.1 }).success).toBe(false);
  });
});

describe("verbatim excerpt cap", () => {
  it(`accepts an excerpt of exactly ${MAX_VERBATIM_EXCERPT_CHARS} characters`, () => {
    const atLimit = "a".repeat(MAX_VERBATIM_EXCERPT_CHARS);
    expect(verbatimExcerptSchema.safeParse(atLimit).success).toBe(true);
  });

  it("rejects an excerpt one character over the cap", () => {
    const overLimit = "a".repeat(MAX_VERBATIM_EXCERPT_CHARS + 1);
    const result = verbatimExcerptSchema.safeParse(overLimit);
    expect(result.success).toBe(false);
  });

  it("rejects an over-length excerpt inside an EvidenceClaim", () => {
    const claim = {
      id: "clm-1",
      schemaVersion: SCHEMA_VERSION,
      companyId: "co-1",
      claim: "The company disclosed a customer count.",
      sourceId: "src-1",
      sourceUrl: "https://example.com/item",
      publicationDate: "2025-06-01",
      provenance: "sourced" as const,
      sourceSubtype: "company_reported" as const,
      confidence: "medium" as const,
      topic: "customers",
    };
    const overLimit = "b".repeat(MAX_VERBATIM_EXCERPT_CHARS + 50);
    expect(evidenceClaimSchema.safeParse({ ...claim, verbatimExcerpt: overLimit }).success).toBe(false);
    expect(evidenceClaimSchema.safeParse({ ...claim, verbatimExcerpt: "short quote" }).success).toBe(true);
  });

  it("a sourced claim must say who is vouching for it", () => {
    const result = evidenceClaimSchema.safeParse({
      id: "clm-2",
      schemaVersion: SCHEMA_VERSION,
      companyId: "co-1",
      claim: "A claim with no attribution.",
      sourceId: "src-1",
      sourceUrl: null,
      publicationDate: null,
      provenance: "sourced",
      sourceSubtype: null,
      confidence: "medium",
      topic: "customers",
    });
    expect(result.success).toBe(false);
  });

  const analystAssumption = {
    id: "clm-asm",
    schemaVersion: SCHEMA_VERSION,
    companyId: "co-1",
    claim: "Analyst read of the GTM motion.",
    sourceId: null,
    sourceUrl: null,
    publicationDate: null,
    provenance: "assumption" as const,
    sourceSubtype: null,
    confidence: "low" as const,
    topic: "gtm_quality",
    analystInterpretation: "Founder-led sales, unproven repeatability.",
    diligenceQuestion: "What is pipeline coverage and rep ramp?",
  };

  it("an analyst assumption may carry no source at all", () => {
    expect(evidenceClaimSchema.safeParse(analystAssumption).success).toBe(true);
  });

  it("a source-less claim may not carry supporting sources or a sourceUrl", () => {
    expect(
      evidenceClaimSchema.safeParse({ ...analystAssumption, supportingSourceIds: ["src-9"] }).success,
    ).toBe(false);
    expect(
      evidenceClaimSchema.safeParse({ ...analystAssumption, sourceUrl: "https://example.com/x" })
        .success,
    ).toBe(false);
  });

  it("a sourced or derived claim must still cite a source", () => {
    expect(
      evidenceClaimSchema.safeParse({
        ...analystAssumption,
        provenance: "sourced",
        sourceSubtype: "reported_fact",
      }).success,
    ).toBe(false);
    expect(
      evidenceClaimSchema.safeParse({ ...analystAssumption, provenance: "derived" }).success,
    ).toBe(false);
  });
});

describe("Company", () => {
  const baseCompany = {
    id: "co-1",
    schemaVersion: SCHEMA_VERSION,
    name: "Example Company Alpha",
    domain: "example.com",
    foundedYear: { provenance: "unknown" as const, value: null, confidence: "unknown" as const },
    hqLocation: "Chicago, Illinois",
    sector: "Application software",
    stage: "series_b" as const,
    employeeCount: { provenance: "unknown" as const, value: null, confidence: "unknown" as const },
    totalRaised: { provenance: "unknown" as const, value: null, confidence: "unknown" as const },
    lastRound: { provenance: "unknown" as const, value: null, confidence: "unknown" as const },
    description: "A placeholder company record used for schema validation.",
    firstObservedAt: "2025-01-15",
    lastUpdatedAt: "2026-01-01T00:00:00.000Z",
    isPrivate: true,
  };

  it("accepts a company whose quantitative fields are all unknown", () => {
    expect(companySchema.safeParse(baseCompany).success).toBe(true);
  });

  it("validates custom properties rather than accepting anything", () => {
    const valid = companySchema.safeParse({
      ...baseCompany,
      properties: { arr_band: { type: "string", value: "10 to 25 million" } },
    });
    expect(valid.success).toBe(true);

    const invalid = companySchema.safeParse({
      ...baseCompany,
      properties: { arr_band: { type: "object", value: { nested: true } } },
    });
    expect(invalid.success).toBe(false);
  });

  it("accepts each supported property value type", () => {
    const cases = [
      { type: "string", value: "a" },
      { type: "number", value: 1 },
      { type: "boolean", value: true },
      { type: "date", value: "2026-01-01" },
      { type: "string_list", value: ["a", "b"] },
    ];
    for (const c of cases) {
      expect(propertyValueSchema.safeParse(c).success, JSON.stringify(c)).toBe(true);
    }
  });

  it("rejects a non-finite number property", () => {
    expect(propertyValueSchema.safeParse({ type: "number", value: Infinity }).success).toBe(false);
  });
});

describe("Person", () => {
  it("supports dated company tenures", () => {
    const result = personSchema.safeParse({
      id: "per-1",
      schemaVersion: SCHEMA_VERSION,
      name: "Placeholder Person",
      currentRole: "Chief executive",
      companyTenures: [
        {
          companyId: "co-1",
          companyName: "Example Company Alpha",
          role: "Chief executive",
          startDate: "2019-04-01",
          endDate: null,
          isFounder: true,
        },
      ],
      publicHandles: {},
    });
    expect(result.success).toBe(true);
  });
});

describe("SourceRecord independence", () => {
  const base = {
    id: "src-1",
    schemaVersion: SCHEMA_VERSION,
    publisher: "Example Wire",
    title: "Example Company Alpha announces expansion",
    url: "https://example.com/wire/1",
    sourceType: "independent_journalism" as const,
    tier: "a" as const,
    reliability: 0.85,
    accessedAt: "2026-01-01T00:00:00.000Z",
    publishedAt: "2025-11-04",
  };

  it("defaults isPressReleaseReproduction to false", () => {
    expect(sourceRecordSchema.parse(base).isPressReleaseReproduction).toBe(false);
  });

  it("records the origin of a reproduction so two copies collapse to one voice", () => {
    const parsed = sourceRecordSchema.parse({
      ...base,
      isPressReleaseReproduction: true,
      originatesFrom: "src-company-release",
    });
    expect(parsed.originatesFrom).toBe("src-company-release");
  });
});

describe("PipelineRecord and PassRecord", () => {
  it("pipeline stages are generic rather than firm specific", () => {
    const parsed = pipelineRecordSchema.parse({
      companyId: "co-1",
      schemaVersion: SCHEMA_VERSION,
      stage: "qualified",
      priority: "high",
      enteredStageAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(parsed.stage).toBe("qualified");
  });

  it("a pass reason of other requires a note", () => {
    const without = passRecordSchema.safeParse({
      companyId: "co-1",
      schemaVersion: SCHEMA_VERSION,
      passedAt: "2026-01-01T00:00:00.000Z",
      passReason: "other",
    });
    expect(without.success).toBe(false);

    const withNote = passRecordSchema.safeParse({
      companyId: "co-1",
      schemaVersion: SCHEMA_VERSION,
      passedAt: "2026-01-01T00:00:00.000Z",
      passReason: "other",
      passNote: "Structure did not fit any listed category.",
    });
    expect(withNote.success).toBe(true);
  });

  it("a revisit trigger links a pass to future signal types", () => {
    const parsed = passRecordSchema.parse({
      companyId: "co-1",
      schemaVersion: SCHEMA_VERSION,
      passedAt: "2026-01-01T00:00:00.000Z",
      passReason: "disclosure",
      revisitTrigger: ["customer_momentum", "funding"],
    });
    expect(parsed.revisitTrigger).toEqual(["customer_momentum", "funding"]);
  });

  it("rejects a revisit trigger that is not a known signal type", () => {
    const result = passRecordSchema.safeParse({
      companyId: "co-1",
      schemaVersion: SCHEMA_VERSION,
      passedAt: "2026-01-01T00:00:00.000Z",
      passReason: "stage",
      revisitTrigger: ["not_a_signal"],
    });
    expect(result.success).toBe(false);
  });
});

describe("ScoreSnapshot", () => {
  const base = {
    companyId: "co-1",
    schemaVersion: SCHEMA_VERSION,
    analyticalMode: "underwriting" as const,
    thesisConfigHash: "sha256:abc",
    computedAt: "2026-01-01T00:00:00.000Z",
    asOfDate: "2026-01-01",
    fitScore: null,
    momentumScore: null,
    convergenceScore: null,
    trustScore: null,
    priorityScore: null,
    priorityRank: null,
    relevanceTier: "core" as const,
    inputHash: "sha256:def",
  };

  it("accepts a snapshot with no scores computed yet", () => {
    expect(scoreSnapshotSchema.safeParse(base).success).toBe(true);
  });

  it("refuses a fit score built from a partial component set", () => {
    const partial = scoreSnapshotSchema.safeParse({
      ...base,
      fitScore: 72,
      fitComponents: [
        {
          key: "capital_efficiency",
          rating: 8,
          weight: 0.2,
          contribution: 1.6,
          basis: "evidence",
          evidenceIds: ["clm-1"],
        },
      ],
    });
    expect(partial.success).toBe(false);
  });

  it("accepts a fit score with a component for every dimension", () => {
    const complete = scoreSnapshotSchema.safeParse({
      ...base,
      fitScore: 72,
      fitComponents: thesisDimensionSchema.options.map((key) => ({
        key,
        rating: 7,
        weight: 1 / thesisDimensionSchema.options.length,
        contribution: 1,
        basis: "evidence",
        evidenceIds: ["clm-1"],
      })),
    });
    expect(complete.success).toBe(true);
  });
});

describe("HistoricalOutcome", () => {
  it("a control may not carry a positive outcome", () => {
    const result = historicalOutcomeSchema.safeParse({
      companyId: "co-1",
      schemaVersion: SCHEMA_VERSION,
      outcomeType: "raised",
      outcomeDate: "2026-02-01",
      isControl: true,
    });
    expect(result.success).toBe(false);
  });

  it("a realised outcome must carry its date", () => {
    const result = historicalOutcomeSchema.safeParse({
      companyId: "co-1",
      schemaVersion: SCHEMA_VERSION,
      outcomeType: "acquired",
      outcomeDate: null,
      isControl: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid control", () => {
    const result = historicalOutcomeSchema.safeParse({
      companyId: "co-2",
      schemaVersion: SCHEMA_VERSION,
      outcomeType: "flat",
      outcomeDate: null,
      isControl: true,
      blindedAlias: "Company 47",
    });
    expect(result.success).toBe(true);
  });
});

describe("OutreachDraft", () => {
  it("has no sent status, because this system does not send", () => {
    expect(outreachStatusSchema.options).toEqual(["draft", "reviewed", "not_sent"]);
    expect(outreachStatusSchema.safeParse("sent").success).toBe(false);
  });

  it("a reviewed draft must cite evidence and record its reviewer", () => {
    const uncited = outreachDraftSchema.safeParse({
      id: "out-1",
      schemaVersion: SCHEMA_VERSION,
      companyId: "co-1",
      draftedAt: "2026-01-01T00:00:00.000Z",
      channel: "email",
      body: "A draft with no citations.",
      status: "reviewed",
      reviewedBy: "analyst",
    });
    expect(uncited.success).toBe(false);

    const cited = outreachDraftSchema.safeParse({
      id: "out-2",
      schemaVersion: SCHEMA_VERSION,
      companyId: "co-1",
      draftedAt: "2026-01-01T00:00:00.000Z",
      channel: "email",
      body: "A draft citing its evidence.",
      citedEvidenceIds: ["clm-1"],
      status: "reviewed",
      reviewedBy: "analyst",
    });
    expect(cited.success).toBe(true);
  });
});
