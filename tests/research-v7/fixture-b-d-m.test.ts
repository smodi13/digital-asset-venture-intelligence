import { describe, it, expect } from "vitest";
import { compileBatch } from "@/lib/research-v7/compile";
import { validatePacket } from "@/lib/research-v7/validate";
import { baseCompanyPacket } from "./fixtures";

/**
 * Phase 3B-0.1: explicit, named synthetic fixtures for cases B (token
 * protocol), D (network), and M (unknown applicability-related research
 * context). Phase 3B-0 exercised these only incidentally through
 * entityType/assetType variants elsewhere; this file names them so they
 * cannot disappear through incidental coverage.
 */

describe("Fixture B: token protocol (entityType=protocol, assetType=token)", () => {
  function tokenProtocolPacket(overrides: Partial<Record<string, unknown>> = {}) {
    return baseCompanyPacket({
      candidateId: "cand-synthetic-protocol",
      canonicalId: "co-synthetic-protocol",
      canonicalName: "Synthetic Protocol",
      slug: "synthetic-protocol",
      description: "A synthetic token protocol fixture, never a real entity.",
      domain: null,
      entityType: "protocol",
      assetType: "token",
      financingStage: null,
      digitalAssetLifecycle: "mainnet_early",
      category: "core_protocols_and_scaling",
      evidenceClaims: [
        { ...(baseCompanyPacket().evidenceClaims as Record<string, unknown>[])[0], companyId: "co-synthetic-protocol" },
      ],
      ...overrides,
    });
  }

  it("validates through the packet harness", () => {
    const result = validatePacket(tokenProtocolPacket(), "fixture-b");
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    expect(result.packet?.entityType).toBe("protocol");
    expect(result.packet?.assetType).toBe("token");
  });

  it("token existence carries no scoring field: the packet schema has no channel for one", () => {
    // Token existence cannot raise a score here because no score field exists
    // anywhere in the packet schema at all (see FORBIDDEN_PACKET_FIELDS):
    // research records evidence, never a judgment.
    const result = validatePacket(tokenProtocolPacket({ criterionScore: 90 }), "fixture-b-forbidden");
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "forbidden_scoring_field")).toBe(true);
  });

  it("token metrics remain optional: a token protocol may carry null digitalAssetMetrics", () => {
    const result = validatePacket(tokenProtocolPacket({ digitalAssetMetrics: null }), "fixture-b-no-metrics");
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("subject compatibility: a protocol_launch SignalEvent accepts subjectType protocol", () => {
    const packet = tokenProtocolPacket({
      signalEvents: [
        {
          id: "evt-protocol-launch",
          schemaVersion: 7,
          subjectType: "protocol",
          subjectId: "co-synthetic-protocol",
          subjectNameRaw: "Synthetic Protocol",
          signalType: "protocol_launch",
          signalCategory: "network",
          signalDirection: "positive",
          sourceId: "src-synthetic-01",
          rawStrength: 0.7,
          evidenceSummary: "Mainnet launched.",
          evidenceIds: ["clm-synthetic-01"],
          publicationDate: "2026-07-15",
          availabilityDate: "2026-07-15",
          eventDate: "2026-07-15",
          eventStatus: "completed",
          unconfirmedNote: null,
          analystInterpretation: null,
          interpretationBasis: "unknown",
        },
      ],
    });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("subject compatibility: protocol_launch rejects a company subject", () => {
    const packet = tokenProtocolPacket({
      signalEvents: [
        {
          id: "evt-protocol-launch-bad",
          schemaVersion: 7,
          subjectType: "company",
          subjectId: "co-synthetic-protocol",
          subjectNameRaw: "Synthetic Protocol",
          signalType: "protocol_launch",
          signalCategory: "network",
          signalDirection: "positive",
          sourceId: "src-synthetic-01",
          rawStrength: 0.7,
          evidenceSummary: "Mainnet launched.",
          evidenceIds: ["clm-synthetic-01"],
          publicationDate: "2026-07-15",
          availabilityDate: "2026-07-15",
          eventDate: "2026-07-15",
          eventStatus: "completed",
          unconfirmedNote: null,
          analystInterpretation: null,
          interpretationBasis: "unknown",
        },
      ],
    });
    const result = validatePacket(packet, "fixture-b-bad-subject");
    expect(result.ok).toBe(false);
  });

  it("no company financing stage is forced merely because the entity is a protocol: financingStage stays null", () => {
    const result = validatePacket(tokenProtocolPacket(), "fixture-b-no-stage");
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    expect(result.packet?.financingStage).toBeNull();
  });
});

describe("Fixture D: network (entityType=network)", () => {
  function networkPacket(overrides: Partial<Record<string, unknown>> = {}) {
    return baseCompanyPacket({
      candidateId: "cand-synthetic-network",
      canonicalId: "co-synthetic-network",
      canonicalName: "Synthetic Network",
      slug: "synthetic-network",
      description: "A synthetic network fixture, never a real entity.",
      domain: null,
      entityType: "network",
      assetType: "network_no_token",
      financingStage: null,
      digitalAssetLifecycle: "mainnet_established",
      category: "core_protocols_and_scaling",
      evidenceClaims: [
        { ...(baseCompanyPacket().evidenceClaims as Record<string, unknown>[])[0], companyId: "co-synthetic-network" },
      ],
      ...overrides,
    });
  }

  it("validates through the packet harness", () => {
    const result = validatePacket(networkPacket(), "fixture-d");
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    expect(result.packet?.entityType).toBe("network");
  });

  it("network-specific SignalEvent compatibility: network_milestone accepts subjectType network", () => {
    const packet = networkPacket({
      signalEvents: [
        {
          id: "evt-network-milestone",
          schemaVersion: 7,
          subjectType: "network",
          subjectId: "co-synthetic-network",
          subjectNameRaw: "Synthetic Network",
          signalType: "network_milestone",
          signalCategory: "network",
          signalDirection: "positive",
          sourceId: "src-synthetic-01",
          rawStrength: 0.6,
          evidenceSummary: "Reached a mainnet milestone.",
          evidenceIds: ["clm-synthetic-01"],
          publicationDate: "2026-07-15",
          availabilityDate: "2026-07-15",
          eventDate: "2026-07-15",
          eventStatus: "completed",
          unconfirmedNote: null,
          analystInterpretation: null,
          interpretationBasis: "unknown",
        },
      ],
    });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("network-specific SignalEvent compatibility: network_milestone rejects a protocol subject", () => {
    const packet = networkPacket({
      signalEvents: [
        {
          id: "evt-network-milestone-bad",
          schemaVersion: 7,
          subjectType: "protocol",
          subjectId: "co-synthetic-network",
          subjectNameRaw: "Synthetic Network",
          signalType: "network_milestone",
          signalCategory: "network",
          signalDirection: "positive",
          sourceId: "src-synthetic-01",
          rawStrength: 0.6,
          evidenceSummary: "Reached a mainnet milestone.",
          evidenceIds: ["clm-synthetic-01"],
          publicationDate: "2026-07-15",
          availabilityDate: "2026-07-15",
          eventDate: "2026-07-15",
          eventStatus: "completed",
          unconfirmedNote: null,
          analystInterpretation: null,
          interpretationBasis: "unknown",
        },
      ],
    });
    const result = validatePacket(packet, "fixture-d-bad-subject");
    expect(result.ok).toBe(false);
  });

  it("digitalAssetLifecycle works independently from financingStage", () => {
    const withBoth = validatePacket(networkPacket({ digitalAssetLifecycle: "testnet", financingStage: "series_a" }), "fixture-d-both");
    const withNeither = validatePacket(networkPacket({ digitalAssetLifecycle: null, financingStage: null }), "fixture-d-neither");
    expect(withBoth.ok, JSON.stringify(withBoth.issues)).toBe(true);
    expect(withBoth.packet?.digitalAssetLifecycle).toBe("testnet");
    expect(withBoth.packet?.financingStage).toBe("series_a");
    expect(withNeither.ok, JSON.stringify(withNeither.issues)).toBe(true);
  });

  it("network identity does not silently become company: entityType is preserved through compilation", () => {
    const result = compileBatch([{ label: "p", raw: networkPacket() }], { batch: "SYNTHETIC" });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    expect(result.corpus?.companies[0]?.entityType).toBe("network");
  });
});

describe("Fixture M: unknown applicability-related research context", () => {
  function packetWithApplicabilityGap(overrides: Partial<Record<string, unknown>> = {}) {
    return baseCompanyPacket({
      unknowns: [
        {
          id: "gap-token-criterion-applicability",
          whatWasSearched: "Whether Synthetic Widgets Inc plans to issue a token, and under what structure.",
          whatCouldNotBeEstablished:
            "No public source confirms or rules out a future token launch. It is not yet knowable whether a token-specific Underwriting criterion will ever apply to this entity.",
          expectedToMatter: true,
        },
      ],
      ...overrides,
    });
  }

  it("represents the applicability uncertainty as a research gap, and validates cleanly", () => {
    const result = validatePacket(packetWithApplicabilityGap(), "fixture-m");
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    expect(result.packet?.unknowns).toHaveLength(1);
    expect(result.packet?.unknowns[0]?.expectedToMatter).toBe(true);
  });

  it("does not create a rawAnchor to represent the gap", () => {
    const gap = (packetWithApplicabilityGap().unknowns as Record<string, unknown>[])[0]!;
    const packet = packetWithApplicabilityGap({ unknowns: [{ ...gap, rawAnchor: null }] });
    const result = validatePacket(packet, "fixture-m-rawanchor");
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "forbidden_scoring_field")).toBe(true);
  });

  it("does not create a criterion applicability judgment: the unknown-gap shape has no such field at all", () => {
    const gap = (packetWithApplicabilityGap().unknowns as Record<string, unknown>[])[0]!;
    const packet = packetWithApplicabilityGap({ unknowns: [{ ...gap, criterionApplicability: "applicable" }] });
    const result = validatePacket(packet, "fixture-m-applicability");
    expect(result.ok).toBe(false);
    // Rejected as an unrecognized key under the strict unknown-gap schema,
    // not merely as a named forbidden field: there is structurally no room
    // for a criterion applicability judgment in a research packet.
    expect(result.issues.some((i) => i.code === "schema_invalid")).toBe(true);
  });

  it("does not create a criterion score to represent the gap", () => {
    const gap = (packetWithApplicabilityGap().unknowns as Record<string, unknown>[])[0]!;
    const packet = packetWithApplicabilityGap({ unknowns: [{ ...gap, criterionScore: 0 }] });
    const result = validatePacket(packet, "fixture-m-criterionscore");
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "forbidden_scoring_field")).toBe(true);
  });
});
