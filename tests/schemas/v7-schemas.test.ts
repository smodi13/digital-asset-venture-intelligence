import { describe, it, expect } from "vitest";
import {
  companyV7Schema,
  SCHEMA_VERSION_V7,
  entityTypeSchema,
  assetTypeSchema,
  digitalAssetCategorySchema,
} from "@/lib/schemas/v7/company";
import {
  signalEventV7Schema,
  DIGITAL_ASSET_SIGNAL_TYPES,
  DIGITAL_ASSET_SIGNAL_SPECS,
  signalHalfLifeDays,
} from "@/lib/schemas/v7/signal-event";
import {
  sourceRecordV7Schema,
  DIGITAL_ASSET_SOURCE_TYPES,
} from "@/lib/schemas/v7/source-record";
import { SCHEMA_VERSION } from "@/lib/schemas/common";

/**
 * Phase 2B: the v7 schema namespace is parallel and strict.
 */

function baseCompany(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "c1",
    schemaVersion: SCHEMA_VERSION_V7,
    entityType: "protocol",
    assetType: "token",
    name: "Example Protocol",
    description: "An example digital-asset protocol.",
    domain: null,
    digitalAssetCategory: null,
    institutionalOrientation: null,
    digitalAssetLifecycle: null,
    digitalAssetMetrics: null,
    firstObservedAt: "2026-01-01",
    sourceIds: [],
    ...overrides,
  };
}

describe("v7 taxonomy", () => {
  it("has exactly eleven digital-asset categories", () => {
    expect(digitalAssetCategorySchema.options).toHaveLength(11);
    expect(digitalAssetCategorySchema.options).toContain(
      "custody_compliance_and_institutional_infrastructure",
    );
    expect(digitalAssetCategorySchema.options).not.toContain("enterprise_and_institutional_onchain");
    expect(digitalAssetCategorySchema.options).not.toContain("governance_coordination_and_identity");
  });

  it("SCHEMA_VERSION_V7 is 7 and the active SCHEMA_VERSION is untouched at 6", () => {
    expect(SCHEMA_VERSION_V7).toBe(7);
    expect(SCHEMA_VERSION).toBe(6);
  });
});

describe("v7 Company strictness", () => {
  it("parses a well-formed v7 company", () => {
    expect(companyV7Schema.safeParse(baseCompany()).success).toBe(true);
  });

  it("rejects a missing entityType", () => {
    const rest: Record<string, unknown> = { ...baseCompany() };
    delete rest.entityType;
    expect(companyV7Schema.safeParse(rest).success).toBe(false);
  });

  it("rejects a missing assetType", () => {
    const rest: Record<string, unknown> = { ...baseCompany() };
    delete rest.assetType;
    expect(companyV7Schema.safeParse(rest).success).toBe(false);
  });

  it("rejects schemaVersion other than 7", () => {
    expect(companyV7Schema.safeParse(baseCompany({ schemaVersion: 6 })).success).toBe(false);
  });

  it("institutionalOrientation accepts true, false, and null (never defaults to false)", () => {
    for (const v of [true, false, null]) {
      expect(companyV7Schema.safeParse(baseCompany({ institutionalOrientation: v })).success).toBe(true);
    }
  });

  it("entityType and assetType are closed enums", () => {
    expect(entityTypeSchema.options).toEqual(["company", "protocol", "network", "hybrid"]);
    expect(assetTypeSchema.options).toEqual([
      "equity",
      "token",
      "equity_and_token",
      "network_no_token",
      "unknown",
    ]);
  });
});

describe("digital-asset metrics: contextual, never fabricated", () => {
  it("a point-in-time metric with a value requires asOf", () => {
    const company = baseCompany({
      digitalAssetMetrics: {
        network: {
          tvlUsd: { value: 100, asOf: null, provenance: { kind: "sourced", confidence: "medium", sourceIds: [], evidenceIds: [], note: null } },
        },
      },
    });
    expect(companyV7Schema.safeParse(company).success).toBe(false);
  });

  it("null metrics parse cleanly (no default zero, no fabricated estimate)", () => {
    const company = baseCompany({ digitalAssetMetrics: { network: null, tokenMarket: null } });
    expect(companyV7Schema.safeParse(company).success).toBe(true);
  });
});

describe("v7 SignalEvent strictness and subject compatibility", () => {
  function baseEvent(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "e1",
      schemaVersion: SCHEMA_VERSION_V7,
      subjectType: "protocol",
      subjectId: "c1",
      subjectNameRaw: "Example",
      signalType: "protocol_launch",
      signalCategory: "network",
      signalDirection: "positive",
      sourceId: "s1",
      rawStrength: 0.6,
      evidenceSummary: "The protocol went live on mainnet.",
      evidenceIds: [],
      publicationDate: "2026-01-01",
      availabilityDate: "2026-01-01",
      eventDate: "2026-01-01",
      ...overrides,
    };
  }

  it("parses a well-formed event", () => {
    expect(signalEventV7Schema.safeParse(baseEvent()).success).toBe(true);
  });

  it("rejects a missing subjectType", () => {
    const rest: Record<string, unknown> = { ...baseEvent() };
    delete rest.subjectType;
    expect(signalEventV7Schema.safeParse(rest).success).toBe(false);
  });

  it("rejects hybrid as a subjectType", () => {
    expect(signalEventV7Schema.safeParse(baseEvent({ subjectType: "hybrid" })).success).toBe(false);
  });

  it("rejects token as a subjectType", () => {
    expect(signalEventV7Schema.safeParse(baseEvent({ subjectType: "token" })).success).toBe(false);
  });

  it("rejects protocol_launch with a company subject", () => {
    expect(
      signalEventV7Schema.safeParse(baseEvent({ subjectType: "company" })).success,
    ).toBe(false);
  });

  it("rejects network_milestone with a protocol or company subject", () => {
    for (const subjectType of ["protocol", "company"]) {
      expect(
        signalEventV7Schema.safeParse(
          baseEvent({ signalType: "network_milestone", signalCategory: "network", subjectType }),
        ).success,
      ).toBe(false);
    }
  });

  it("rejects exploit with a company subject", () => {
    expect(
      signalEventV7Schema.safeParse(
        baseEvent({ signalType: "exploit", signalCategory: "risk", signalDirection: "negative", subjectType: "company" }),
      ).success,
    ).toBe(false);
  });

  it("rejects governance_change with a company subject", () => {
    expect(
      signalEventV7Schema.safeParse(
        baseEvent({ signalType: "governance_change", signalCategory: "market", subjectType: "company" }),
      ).success,
    ).toBe(false);
  });

  it("has exactly 15 digital-asset signal types with a half-life hypothesis each", () => {
    expect(DIGITAL_ASSET_SIGNAL_TYPES).toHaveLength(15);
    for (const t of DIGITAL_ASSET_SIGNAL_TYPES) {
      expect(signalHalfLifeDays(t)).toBe(DIGITAL_ASSET_SIGNAL_SPECS[t].halfLifeDays);
      expect(signalHalfLifeDays(t)).toBeGreaterThan(0);
    }
  });

  it("token_launch is never in the allowed-positive set", () => {
    expect(DIGITAL_ASSET_SIGNAL_SPECS.token_launch.directions).not.toContain("positive");
  });

  it("an event with a rejected pairing still fails even with high strength", () => {
    expect(
      signalEventV7Schema.safeParse(baseEvent({ subjectType: "company", rawStrength: 1 })).success,
    ).toBe(false);
  });
});

describe("v7 SourceRecord: seven new classes, independence preserved", () => {
  it("has exactly seven digital-asset source classes", () => {
    expect(DIGITAL_ASSET_SOURCE_TYPES).toHaveLength(7);
  });

  it("rejects a non-independent class that claims to corroborate", () => {
    const record = {
      id: "s1",
      schemaVersion: SCHEMA_VERSION_V7,
      publisher: "Example Protocol Blog",
      title: "Roadmap update",
      url: "https://example.com/blog",
      sourceType: "official_protocol_source",
      tier: "b",
      reliability: 0.68,
      isIndependent: false,
      canCorroborate: true,
      accessedAt: "2026-01-01T00:00:00.000Z",
      publishedAt: "2026-01-01",
    };
    expect(sourceRecordV7Schema.safeParse(record).success).toBe(false);
  });

  it("analyst_inference can never corroborate", () => {
    const record = {
      id: "s2",
      schemaVersion: SCHEMA_VERSION_V7,
      publisher: "Analyst",
      title: "Inference",
      url: null,
      sourceType: "analyst_inference",
      tier: "d",
      reliability: 0.1,
      isIndependent: true,
      canCorroborate: true,
      accessedAt: "2026-01-01T00:00:00.000Z",
      publishedAt: null,
    };
    expect(sourceRecordV7Schema.safeParse(record).success).toBe(false);
  });

  it("block_explorer can be independent and corroborate", () => {
    const record = {
      id: "s3",
      schemaVersion: SCHEMA_VERSION_V7,
      publisher: "Explorer",
      title: "Transaction detail",
      url: "https://explorer.example.com/tx/0x1",
      sourceType: "block_explorer",
      tier: "a",
      reliability: 0.9,
      isIndependent: true,
      canCorroborate: true,
      accessedAt: "2026-01-01T00:00:00.000Z",
      publishedAt: null,
    };
    expect(sourceRecordV7Schema.safeParse(record).success).toBe(true);
  });
});
