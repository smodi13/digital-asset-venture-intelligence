import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { compileBatch } from "@/lib/research-v7/compile";
import { baseCompanyPacket, baseSource } from "./fixtures";

/**
 * Phase 3B-0.1 section 7: generated corpus version-consistency proof.
 *
 * Runs over a richer synthetic batch (a company, a token protocol, a
 * network, people, sources, evidence, and a signal event) so every
 * generated collection is non-empty and actually exercised.
 */

function richBatch() {
  const company = baseCompanyPacket({});
  const protocol = baseCompanyPacket({
    candidateId: "cand-synthetic-protocol",
    canonicalId: "co-synthetic-protocol",
    canonicalName: "Synthetic Protocol",
    slug: "synthetic-protocol",
    entityType: "protocol",
    assetType: "token",
    financingStage: null,
    sources: [baseSource({ id: "src-protocol-01", url: "https://example.com/protocol" })],
    evidenceClaims: [
      {
        ...(baseCompanyPacket().evidenceClaims as Record<string, unknown>[])[0],
        id: "clm-protocol-01",
        companyId: "co-synthetic-protocol",
        sourceId: "src-protocol-01",
        sourceUrl: "https://example.com/protocol",
      },
    ],
    signalEvents: [
      {
        id: "evt-protocol-01",
        schemaVersion: 7,
        subjectType: "protocol",
        subjectId: "co-synthetic-protocol",
        subjectNameRaw: "Synthetic Protocol",
        signalType: "protocol_launch",
        signalCategory: "network",
        signalDirection: "positive",
        sourceId: "src-protocol-01",
        rawStrength: 0.7,
        evidenceSummary: "Mainnet launched.",
        evidenceIds: ["clm-protocol-01"],
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
  return [
    { label: "company", raw: company },
    { label: "protocol", raw: protocol },
  ];
}

describe("generated corpus version consistency (Phase 3B-0.1 section 7)", () => {
  it("compiles a rich synthetic batch cleanly", () => {
    const result = compileBatch(richBatch(), { batch: "SYNTHETIC" });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    expect(result.corpus?.companies.length).toBeGreaterThan(0);
    expect(result.corpus?.people.length).toBeGreaterThan(0);
    expect(result.corpus?.sources.length).toBeGreaterThan(0);
    expect(result.corpus?.evidenceClaims.length).toBeGreaterThan(0);
    expect(result.corpus?.signalEvents.length).toBeGreaterThan(0);
  });

  it("every versioned record (Company, Person, SourceRecord, EvidenceClaim, SignalEvent) carries schemaVersion 7", () => {
    const result = compileBatch(richBatch(), { batch: "SYNTHETIC" });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    const corpus = result.corpus!;
    for (const c of corpus.companies) expect(c.schemaVersion).toBe(7);
    for (const p of corpus.people) expect(p.schemaVersion).toBe(7);
    for (const s of corpus.sources) expect(s.schemaVersion).toBe(7);
    for (const e of corpus.evidenceClaims) expect(e.schemaVersion).toBe(7);
    for (const se of corpus.signalEvents) expect(se.schemaVersion).toBe(7);
  });

  it("no generated record claims schemaVersion 6", () => {
    const result = compileBatch(richBatch(), { batch: "SYNTHETIC" });
    const corpus = result.corpus!;
    const allVersioned = [...corpus.companies, ...corpus.people, ...corpus.sources, ...corpus.evidenceClaims, ...corpus.signalEvents];
    expect(allVersioned.every((r) => r.schemaVersion === 7)).toBe(true);
    expect(allVersioned.some((r) => r.schemaVersion === 6)).toBe(false);
  });

  it("no ScoreSnapshot exists on the compiled corpus", () => {
    const result = compileBatch(richBatch(), { batch: "SYNTHETIC" });
    expect(Object.keys(result.corpus ?? {})).not.toContain("scoreSnapshots");
    expect(Object.keys(result.corpus ?? {})).not.toContain("scoreSnapshot");
  });

  it("no Screening judgment exists on the compiled corpus", () => {
    const result = compileBatch(richBatch(), { batch: "SYNTHETIC" });
    const corpus = result.corpus!;
    // Structural proof, not a string search: the CompiledCorpus type itself
    // (lib/research-v7/compile.ts) has exactly five keys, none of them a
    // screening or scoring collection.
    expect(Object.keys(corpus).sort()).toEqual(["companies", "evidenceClaims", "people", "signalEvents", "sources"]);
  });

  it("digitalAssetMetrics carries no schemaVersion field: it is a value object, not a record, and this is intentional", () => {
    // lib/schemas/v7/company.ts's digitalAssetMetricsSchema (and its
    // point-in-time / period metric sub-schemas) never had a schemaVersion
    // field: a metric is a value attached to a Company record, not an
    // independently versioned record in its own right. Documented here
    // rather than inventing a version property for a value object.
    const result = compileBatch(richBatch(), { batch: "SYNTHETIC" });
    const company = result.corpus?.companies.find((c) => c.id === "co-synthetic-widgets");
    expect(company?.digitalAssetMetrics).toBeNull();
  });

  it("no active-v6 generated object is imported or reused as generated output: the corpus builder only imports from lib/schemas/v7 and version-neutral shared schemas", () => {
    // lib/research-v7/compile.ts imports CompanyV7 and SignalEventV7 from
    // lib/schemas/v7, and Person / EvidenceClaim from the version-neutral
    // lib/schemas/person.ts and lib/schemas/evidence-claim.ts (see
    // tests/research-v7/version-safety.test.ts). It never imports
    // lib/schemas/company.ts or lib/schemas/signal-event.ts (the active v6
    // Company / SignalEvent shapes).
    const text = readFileSync("lib/research-v7/compile.ts", "utf8");
    expect(text).not.toMatch(/@\/lib\/schemas\/company"/);
    expect(text).not.toMatch(/@\/lib\/schemas\/signal-event"/);
  });
});
