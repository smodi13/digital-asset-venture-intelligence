import { describe, it, expect } from "vitest";
import { compileBatch } from "@/lib/research-v7/compile";
import { baseCompanyPacket, baseSource } from "./fixtures";

/**
 * Phase 3B-0.1 explicit availabilityDate strictness proof.
 *
 * Only an evidence-bearing source (one cited by an admitted EvidenceClaim,
 * SignalEvent, or digital-asset metric) is required to carry an
 * availabilityDate on or before the cutoff. A source kept only as a research
 * lead, never cited by anything, may lack one: it simply cannot support a
 * claim, event, or metric until one is established. See
 * lib/research-v7/integrity.ts (collectEvidenceBearingSourceIds).
 */

function packetCitingSource(overrides: Partial<Record<string, unknown>> = {}) {
  return baseCompanyPacket({
    sources: [baseSource(overrides)],
    evidenceClaims: [
      { ...(baseCompanyPacket().evidenceClaims as Record<string, unknown>[])[0], sourceId: "src-synthetic-01" },
    ],
  });
}

describe("availabilityDate strictness (Phase 3B-0.1)", () => {
  it("1. availabilityDate on or before the cutoff is valid", () => {
    const packet = packetCitingSource({ availabilityDate: "2026-09-10" });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("2. availabilityDate after the cutoff is an ERROR", () => {
    const packet = packetCitingSource({ availabilityDate: "2026-09-11" });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "cutoff_leakage" && i.severity === "ERROR")).toBe(true);
  });

  it("3. publicationDate on-time but availabilityDate after the cutoff is an ERROR", () => {
    const packet = packetCitingSource({ publishedAt: "2026-08-01", availabilityDate: "2026-09-20" });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "cutoff_leakage")).toBe(true);
  });

  it("4. publicationDate on-time but an evidence-bearing source with missing availabilityDate is an ERROR", () => {
    const packet = packetCitingSource({ publishedAt: "2026-08-01", availabilityDate: null });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "cutoff_leakage")).toBe(true);
  });

  it("5. ingestedAt on or before the cutoff never substitutes for availabilityDate (ingestedAt does not exist on SourceRecord at all)", () => {
    // SourceRecordV7 carries no ingestedAt field: it is compile-time audit
    // metadata stamped only on SignalEvent output, never author-supplied, and
    // never a candidate for cutoff eligibility. A source missing
    // availabilityDate fails regardless of when it was compiled.
    const packet = packetCitingSource({ availabilityDate: null });
    const result = compileBatch([{ label: "p", raw: packet }], {
      batch: "SYNTHETIC",
      now: new Date("2026-01-01T00:00:00.000Z"), // an early, on-time compile time
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "cutoff_leakage")).toBe(true);
  });

  it("6. publicationDate does not automatically populate availabilityDate", () => {
    const withoutAvailability = packetCitingSource({ publishedAt: "2026-01-01", availabilityDate: null });
    const withAvailability = packetCitingSource({ publishedAt: "2026-01-01", availabilityDate: "2026-01-01" });
    expect(compileBatch([{ label: "p", raw: withoutAvailability }], { batch: "SYNTHETIC" }).ok).toBe(false);
    expect(compileBatch([{ label: "p", raw: withAvailability }], { batch: "SYNTHETIC" }).ok).toBe(true);
  });

  it("a research-lead source (not cited by any claim, event, or metric) may lack availabilityDate", () => {
    const packet = baseCompanyPacket({
      sources: [
        baseSource({ availabilityDate: "2026-07-15" }), // cited by the default evidence claim
        baseSource({ id: "src-lead", url: "https://example.com/lead", availabilityDate: null }),
      ],
    });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("a source becomes subject to the cutoff the moment it is cited, even as a supportingSourceId", () => {
    const packet = baseCompanyPacket({
      sources: [
        baseSource({ availabilityDate: "2026-07-15" }),
        baseSource({ id: "src-support", url: "https://example.com/support", availabilityDate: null }),
      ],
      evidenceClaims: [
        {
          ...(baseCompanyPacket().evidenceClaims as Record<string, unknown>[])[0],
          supportingSourceIds: ["src-support"],
        },
      ],
    });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "cutoff_leakage")).toBe(true);
  });

  it("a source cited only by a SignalEvent is evidence-bearing", () => {
    const packet = baseCompanyPacket({
      sources: [baseSource({ id: "src-signal-only", url: "https://example.com/signal-only", availabilityDate: null })],
      evidenceClaims: [],
      signalEvents: [
        {
          id: "evt-01",
          schemaVersion: 7,
          subjectType: "company",
          subjectId: "co-synthetic-widgets",
          subjectNameRaw: "Synthetic Widgets Inc",
          signalType: "product_launch",
          signalCategory: "product",
          signalDirection: "positive",
          sourceId: "src-signal-only",
          rawStrength: 0.5,
          evidenceSummary: "Shipped.",
          evidenceIds: [],
          publicationDate: "2026-08-01",
          availabilityDate: "2026-08-01",
          eventDate: "2026-08-01",
          eventStatus: "completed",
          unconfirmedNote: null,
          analystInterpretation: null,
          interpretationBasis: "unknown",
        },
      ],
    });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "cutoff_leakage")).toBe(true);
  });
});
