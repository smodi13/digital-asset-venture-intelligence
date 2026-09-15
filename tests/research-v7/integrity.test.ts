import { describe, it, expect } from "vitest";
import { compileBatch } from "@/lib/research-v7/compile";
import { areSourcesIndependent, countIndependentSources } from "@/lib/research-v7/independence";
import type { SourceRecordV7 } from "@/lib/schemas/v7/source-record";
import { baseCompanyPacket, baseSource } from "./fixtures";

function packetWith(overrides: Record<string, unknown>) {
  return baseCompanyPacket(overrides);
}

describe("EvidenceClaim reference integrity", () => {
  it("rejects a claim citing an unresolved sourceId", () => {
    const packet = packetWith({
      evidenceClaims: [
        { ...(baseCompanyPacket().evidenceClaims as Record<string, unknown>[])[0], sourceId: "src-does-not-exist" },
      ],
    });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "evidence_source_unresolved")).toBe(true);
  });

  it("rejects a claim that contradicts itself", () => {
    const claim = (baseCompanyPacket().evidenceClaims as Record<string, unknown>[])[0]!;
    const packet = packetWith({ evidenceClaims: [{ ...claim, contradicts: [claim.id] }] });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "self_contradiction")).toBe(true);
  });

  it("rejects a contradiction reference to an unknown claim id", () => {
    const claim = (baseCompanyPacket().evidenceClaims as Record<string, unknown>[])[0]!;
    const packet = packetWith({ evidenceClaims: [{ ...claim, contradicts: ["clm-nonexistent"] }] });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "contradiction_unresolved")).toBe(true);
  });

  it("rejects duplicate claim ids", () => {
    const claim = (baseCompanyPacket().evidenceClaims as Record<string, unknown>[])[0]!;
    const packet = packetWith({ evidenceClaims: [claim, { ...claim, claim: "A different statement." }] });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "duplicate_claim_id")).toBe(true);
  });
});

describe("source originatesFrom integrity (case I: source reproduction chain)", () => {
  it("accepts a valid reproduction chain", () => {
    const packet = packetWith({
      sources: [
        baseSource({ id: "src-origin", originatesFrom: null }),
        baseSource({ id: "src-repro", url: "https://example.com/repro", originatesFrom: "src-origin", isPressReleaseReproduction: true }),
      ],
      evidenceClaims: [
        { ...(baseCompanyPacket().evidenceClaims as Record<string, unknown>[])[0], sourceId: "src-origin" },
      ],
    });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("rejects originatesFrom pointing at an unresolved source", () => {
    const packet = packetWith({
      sources: [baseSource({ id: "src-a", originatesFrom: "src-ghost" })],
    });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "origin_unresolved")).toBe(true);
  });

  it("detects a direct origin cycle", () => {
    const packet = packetWith({
      sources: [
        baseSource({ id: "src-a", url: "https://example.com/a", originatesFrom: "src-b" }),
        baseSource({ id: "src-b", url: "https://example.com/b", originatesFrom: "src-a" }),
      ],
    });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "origin_cycle")).toBe(true);
  });

  it("detects a longer origin cycle (a -> b -> c -> a)", () => {
    const packet = packetWith({
      sources: [
        baseSource({ id: "src-a", url: "https://example.com/a", originatesFrom: "src-b" }),
        baseSource({ id: "src-b", url: "https://example.com/b", originatesFrom: "src-c" }),
        baseSource({ id: "src-c", url: "https://example.com/c", originatesFrom: "src-a" }),
      ],
    });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "origin_cycle")).toBe(true);
  });
});

describe("same-origin corroboration (case J: block-explorer same-origin)", () => {
  function explorer(id: string, originatesFrom: string | null): SourceRecordV7 {
    return {
      id,
      schemaVersion: 7,
      publisher: "Some Explorer",
      title: "Transaction detail",
      url: `https://example.com/${id}`,
      sourceType: "block_explorer",
      tier: "a",
      reliability: 0.9,
      isIndependent: true,
      canCorroborate: true,
      accessedAt: "2026-08-01T00:00:00.000Z",
      publishedAt: "2026-07-01",
      availabilityDate: "2026-07-01",
      isPressReleaseReproduction: false,
      originatesFrom,
      supportRole: "onchain_fact",
    };
  }

  it("two explorers exposing the same ledger fact via originatesFrom collapse into one independent voice", () => {
    const byId = new Map<string, SourceRecordV7>([
      ["src-chain-fact", explorer("src-chain-fact", null)],
      ["src-explorer-a", explorer("src-explorer-a", "src-chain-fact")],
      ["src-explorer-b", explorer("src-explorer-b", "src-chain-fact")],
    ]);
    const summary = countIndependentSources(["src-explorer-a", "src-explorer-b"], byId);
    expect(summary.independentSourceCount).toBe(1);
    expect(summary.rawSourceCount).toBe(2);

    const pair = areSourcesIndependent("src-explorer-a", "src-explorer-b", byId);
    expect(pair.independent).toBe(false);
    expect(pair.reason).toBe("shared_origin");
  });

  it("two sources with genuinely distinct origins are independent", () => {
    const byId = new Map<string, SourceRecordV7>([
      ["src-x", explorer("src-x", null)],
      ["src-y", explorer("src-y", null)],
    ]);
    expect(areSourcesIndependent("src-x", "src-y", byId).independent).toBe(true);
    expect(countIndependentSources(["src-x", "src-y"], byId).independentSourceCount).toBe(2);
  });

  it("a source class that cannot corroborate never counts, however many URLs cite it", () => {
    const byId = new Map<string, SourceRecordV7>([
      ["src-a", { ...explorer("src-a", null), canCorroborate: false, isIndependent: false }],
      ["src-b", { ...explorer("src-b", null), canCorroborate: false, isIndependent: false }],
    ]);
    expect(countIndependentSources(["src-a", "src-b"], byId).independentSourceCount).toBe(0);
  });
});

describe("source duplicate detection", () => {
  it("flags two source ids resolving to the same normalized URL as an error", () => {
    const packet = packetWith({
      sources: [
        baseSource({ id: "src-a", url: "https://example.com/page?utm_source=x" }),
        baseSource({ id: "src-b", url: "https://example.com/page" }),
      ],
    });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "duplicate_source_url")).toBe(true);
  });

  it("flags same publisher/title/date under different URLs as a warning, without merging", () => {
    const packet = packetWith({
      sources: [
        baseSource({ id: "src-a", url: "https://example.com/a", publisher: "Wire", title: "Big News", publishedAt: "2026-05-01" }),
        baseSource({ id: "src-b", url: "https://example.com/b", publisher: "Wire", title: "Big News", publishedAt: "2026-05-01" }),
      ],
      evidenceClaims: [
        { ...(baseCompanyPacket().evidenceClaims as Record<string, unknown>[])[0], sourceId: "src-a" },
      ],
    });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    expect(result.issues.some((i) => i.code === "likely_duplicate_source" && i.severity === "WARNING")).toBe(true);
    // Not merged: both source ids survive into the compiled corpus.
    expect(result.corpus?.sources.map((s) => s.id).sort()).toEqual(["src-a", "src-b"]);
  });

  it("does not merge two legitimately independent articles with similar titles", () => {
    const packet = packetWith({
      sources: [
        baseSource({ id: "src-a", url: "https://example.com/a", publisher: "Outlet One", title: "Synthetic Widgets raises funding" }),
        baseSource({ id: "src-b", url: "https://example.com/b", publisher: "Outlet Two", title: "Synthetic Widgets raises new funding" }),
      ],
    });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.issues.some((i) => i.code === "likely_duplicate_source" || i.code === "duplicate_source_url")).toBe(false);
  });
});

describe("person duplicate warning (case N)", () => {
  it("warns, but does not error, when the same normalized name appears under different ids", () => {
    const packetA = packetWith({
      canonicalId: "co-alpha",
      candidateId: "cand-alpha",
      sources: [baseSource({ id: "src-alpha", url: "https://example.com/alpha" })],
      evidenceClaims: [{ ...(baseCompanyPacket().evidenceClaims as Record<string, unknown>[])[0], id: "clm-alpha", companyId: "co-alpha", sourceId: "src-alpha", sourceUrl: "https://example.com/alpha" }],
      people: [
        { id: "per-a1", schemaVersion: 7, name: "Grace Synthetic", aliases: [], currentRole: "CEO", companyTenures: [], priorCompanies: [], education: [], publicHandles: { github: null, x: null, linkedin: null, website: null }, signalEventIds: [], sourceIds: [] },
      ],
    });
    const packetB = packetWith({
      canonicalId: "co-beta",
      candidateId: "cand-beta",
      canonicalName: "Synthetic Beta",
      slug: "synthetic-beta",
      people: [
        { id: "per-a2", schemaVersion: 7, name: "Grace Synthetic", aliases: [], currentRole: "Advisor", companyTenures: [], priorCompanies: [], education: [], publicHandles: { github: null, x: null, linkedin: null, website: null }, signalEventIds: [], sourceIds: [] },
      ],
      evidenceClaims: [{ ...(baseCompanyPacket().evidenceClaims as Record<string, unknown>[])[0], id: "clm-beta", companyId: "co-beta", sourceId: "src-beta", sourceUrl: "https://example.com/beta" }],
      sources: [baseSource({ id: "src-beta", url: "https://example.com/beta" })],
    });
    const result = compileBatch(
      [
        { label: "a", raw: packetA },
        { label: "b", raw: packetB },
      ],
      { batch: "SYNTHETIC" },
    );
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    expect(result.issues.some((i) => i.code === "duplicate_person_name" && i.severity === "WARNING")).toBe(true);
  });
});

describe("entity dedupe", () => {
  it("rejects two packets sharing a canonicalId", () => {
    const a = packetWith({});
    const b = packetWith({ candidateId: "cand-synthetic-002" });
    const result = compileBatch(
      [
        { label: "a", raw: a },
        { label: "b", raw: b },
      ],
      { batch: "SYNTHETIC" },
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "duplicate_entity_id")).toBe(true);
  });
});

describe("deterministic compilation", () => {
  it("produces byte-identical output across repeated compilations of the same input", () => {
    const packet = packetWith({});
    const opts = { batch: "SYNTHETIC" as const, now: new Date("2026-09-05T00:00:00.000Z") };
    const first = compileBatch([{ label: "p", raw: packet }], opts);
    const second = compileBatch([{ label: "p", raw: packet }], opts);
    expect(first.ok && second.ok).toBe(true);
    expect(first.files).toEqual(second.files);
  });
});

describe("no ScoreSnapshot", () => {
  it("the compiled corpus has no ScoreSnapshot field", () => {
    const result = compileBatch([{ label: "p", raw: packetWith({}) }], { batch: "SYNTHETIC" });
    expect(result.corpus).not.toBeNull();
    expect(Object.keys(result.corpus ?? {})).not.toContain("scoreSnapshots");
  });
});
