import { describe, it, expect } from "vitest";
import { migrateCompanyV6ToV7, migrateSignalEventV6ToV7 } from "@/lib/domain/migrate-v6-v7";
import type { Company, SignalEvent } from "@/lib/schemas";
import { SCHEMA_VERSION_V7 } from "@/lib/schemas/v7";

/**
 * Phase 2B section 20: the v6 -> v7 adapter is DORMANT. It only normalizes
 * shape; the defaults it supplies are not a claim that a v6 record is
 * digital-asset data.
 */

function syntheticCompany(): Company {
  return {
    id: "co1",
    schemaVersion: 6,
    name: "Example AI Co",
    aliases: [],
    domain: "example.test",
    foundedYear: { provenance: "unknown", value: null, confidence: "unknown", modelEligibility: "context_only", asOf: null, evidenceIds: [] },
    operatingOriginYear: null,
    hqLocation: null,
    sector: "AI infrastructure",
    subsector: null,
    stage: "seed",
    employeeCount: { provenance: "unknown", value: null, confidence: "unknown", modelEligibility: "context_only", asOf: null, evidenceIds: [] },
    totalRaised: { provenance: "unknown", value: null, confidence: "unknown", modelEligibility: "context_only", asOf: null, evidenceIds: [] },
    lastRound: { provenance: "unknown", value: null, confidence: "unknown", modelEligibility: "context_only", asOf: null, evidenceIds: [] },
    investorIds: [],
    founderIds: [],
    description: "An example synthetic company.",
    sourceIds: [],
    notes: null,
    firstObservedAt: "2026-01-01",
    lastUpdatedAt: "2026-01-01T00:00:00.000Z",
    isPrivate: true,
    properties: {},
  };
}

function syntheticSignalEvent(): SignalEvent {
  return {
    id: "e1",
    schemaVersion: 6,
    companyId: "co1",
    companyNameRaw: "Example AI Co",
    entityMatchConfidence: 1,
    entityMatchMethod: "exact",
    sourceId: "s1",
    sourceUrl: null,
    sourceRecordId: null,
    sourceReliability: 0.7,
    publicationDate: "2026-01-01",
    availabilityDate: "2026-01-01",
    availabilityEvidence: { method: "not_established", note: null } as never,
    ingestedAt: "2026-01-02T00:00:00.000Z",
    eventDate: null,
    signalType: "funding",
    signalCategory: "capital",
    signalDirection: "ambiguous",
    eventStatus: "completed",
    unconfirmedNote: null,
    rawStrength: 0.5,
    evidenceSummary: "A synthetic financing event.",
    evidenceIds: [],
    claimConfidence: "medium",
    humanVerified: "unverified",
    verifiedBy: null,
    verifiedAt: null,
    contradicts: [],
    contradictedBy: [],
    investmentInterpretation: null,
    interpretationBasis: "unknown",
  } as unknown as SignalEvent;
}

describe("v6 -> v7 migration adapter (dormant)", () => {
  it("normalizes a v6 Company to the documented v7 compatibility defaults", () => {
    const v7 = migrateCompanyV6ToV7(syntheticCompany());
    expect(v7.schemaVersion).toBe(SCHEMA_VERSION_V7);
    expect(v7.entityType).toBe("company");
    expect(v7.assetType).toBe("unknown");
    expect(v7.digitalAssetCategory).toBeNull();
    expect(v7.institutionalOrientation).toBeNull();
    expect(v7.digitalAssetLifecycle).toBeNull();
    expect(v7.digitalAssetMetrics).toBeNull();
  });

  it("normalizes a v6 SignalEvent to subjectType company", () => {
    const v7 = migrateSignalEventV6ToV7(syntheticSignalEvent());
    expect(v7.schemaVersion).toBe(SCHEMA_VERSION_V7);
    expect(v7.subjectType).toBe("company");
    expect(v7.signalType).toBe("funding");
  });

  it("Phase 3B-0.1: passes the v6 record's own eventStatus through rather than defaulting to completed", () => {
    const v6Event = { ...syntheticSignalEvent(), eventStatus: "reported_unconfirmed" as const, unconfirmedNote: "Terms not yet final." };
    const v7 = migrateSignalEventV6ToV7(v6Event);
    expect(v7.eventStatus).toBe("reported_unconfirmed");
    expect(v7.unconfirmedNote).toBe("Terms not yet final.");
  });

  it("Phase 3B-0.1: passes the v6 record's own interpretation through, never fabricating one", () => {
    const v7WithNone = migrateSignalEventV6ToV7(syntheticSignalEvent());
    expect(v7WithNone.analystInterpretation).toBeNull();
    expect(v7WithNone.interpretationBasis).toBe("unknown");

    const v6Event = {
      ...syntheticSignalEvent(),
      investmentInterpretation: "Suggests early product-market fit.",
      interpretationBasis: "evidence" as const,
    };
    const v7WithSome = migrateSignalEventV6ToV7(v6Event);
    expect(v7WithSome.analystInterpretation).toBe("Suggests early product-market fit.");
    expect(v7WithSome.interpretationBasis).toBe("evidence");
  });
});
