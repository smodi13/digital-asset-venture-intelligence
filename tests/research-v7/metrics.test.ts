import { describe, it, expect } from "vitest";
import { compileBatch } from "@/lib/research-v7/compile";
import { validatePacket } from "@/lib/research-v7/validate";
import { baseCompanyPacket } from "./fixtures";

const provenance = (overrides: Partial<Record<string, unknown>> = {}) => ({
  kind: "sourced",
  confidence: "medium",
  sourceIds: ["src-synthetic-01"],
  evidenceIds: [],
  note: null,
  ...overrides,
});

describe("digital-asset metric integrity", () => {
  it("accepts a valid point-in-time metric (case G)", () => {
    const packet = baseCompanyPacket({
      entityType: "network",
      assetType: "network_no_token",
      digitalAssetMetrics: {
        network: { tvlUsd: { value: 1_000_000, asOf: "2026-08-01", provenance: provenance() } },
        tokenMarket: null,
      },
    });
    const result = validatePacket(packet, "fixture-point-in-time");
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("rejects a point-in-time metric with a value but no asOf date", () => {
    const packet = baseCompanyPacket({
      digitalAssetMetrics: {
        network: { tvlUsd: { value: 1_000_000, asOf: null, provenance: provenance() } },
        tokenMarket: null,
      },
    });
    const result = validatePacket(packet, "fixture-missing-asof");
    expect(result.ok).toBe(false);
  });

  it("accepts a valid period metric (case F)", () => {
    const packet = baseCompanyPacket({
      entityType: "network",
      assetType: "network_no_token",
      digitalAssetMetrics: {
        network: {
          protocolFeesUsd: { value: 50_000, periodStart: "2026-07-01", periodEnd: "2026-07-31", provenance: provenance() },
        },
        tokenMarket: null,
      },
    });
    const result = validatePacket(packet, "fixture-period");
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("rejects a period metric with periodEnd before periodStart", () => {
    const packet = baseCompanyPacket({
      digitalAssetMetrics: {
        network: {
          protocolFeesUsd: { value: 50_000, periodStart: "2026-07-31", periodEnd: "2026-07-01", provenance: provenance() },
        },
        tokenMarket: null,
      },
    });
    const result = validatePacket(packet, "fixture-bad-period");
    expect(result.ok).toBe(false);
  });

  it("rejects a metric periodEnd that leaks past the research cutoff", () => {
    const packet = baseCompanyPacket({
      digitalAssetMetrics: {
        network: {
          protocolFeesUsd: { value: 50_000, periodStart: "2026-09-01", periodEnd: "2026-09-20", provenance: provenance() },
        },
        tokenMarket: null,
      },
    });
    const result = compileBatch([{ label: "leaky-metric", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "metric_cutoff_leakage")).toBe(true);
  });

  it("token metrics are optional: an equity-only company may have all-null digitalAssetMetrics", () => {
    const packet = baseCompanyPacket({ digitalAssetMetrics: null });
    const result = validatePacket(packet, "fixture-null-metrics");
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("a company-only entity may have all token metrics null while carrying network metrics", () => {
    const packet = baseCompanyPacket({
      digitalAssetMetrics: { network: null, tokenMarket: null },
    });
    const result = validatePacket(packet, "fixture-all-null-metrics");
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("nullable metric value means unknown, never zero: a null value carries no date requirement", () => {
    const packet = baseCompanyPacket({
      digitalAssetMetrics: {
        network: { tvlUsd: { value: null, asOf: null, provenance: provenance({ kind: "unknown", confidence: "unknown" }) } },
        tokenMarket: null,
      },
    });
    const result = validatePacket(packet, "fixture-null-value");
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });
});
