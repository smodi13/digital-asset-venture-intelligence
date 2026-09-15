import { describe, it, expect } from "vitest";
import { compileBatch } from "@/lib/research-v7/compile";
import { baseCompanyPacket } from "./fixtures";

function signalEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "evt-synthetic-01",
    schemaVersion: 7,
    subjectType: "company",
    subjectId: "co-synthetic-widgets",
    subjectNameRaw: "Synthetic Widgets Inc",
    signalType: "product_launch",
    signalCategory: "product",
    signalDirection: "positive",
    sourceId: "src-synthetic-01",
    rawStrength: 0.6,
    evidenceSummary: "Synthetic Widgets shipped v1.",
    evidenceIds: ["clm-synthetic-01"],
    publicationDate: "2026-07-15",
    availabilityDate: "2026-07-15",
    eventDate: "2026-07-15",
    eventStatus: "completed",
    unconfirmedNote: null,
    analystInterpretation: null,
    interpretationBasis: "unknown",
    ...overrides,
  };
}

describe("SignalEvent integrity", () => {
  it("accepts a well-formed signal event", () => {
    const packet = baseCompanyPacket({ signalEvents: [signalEvent()] });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("rejects a signal event citing an unresolved sourceId", () => {
    const packet = baseCompanyPacket({ signalEvents: [signalEvent({ sourceId: "src-ghost" })] });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "signal_source_unresolved")).toBe(true);
  });

  it("rejects a signal event citing an unresolved evidenceId", () => {
    const packet = baseCompanyPacket({ signalEvents: [signalEvent({ evidenceIds: ["clm-ghost"] })] });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "signal_evidence_unresolved")).toBe(true);
  });

  it("rejects a signal event citing an unresolved subjectId", () => {
    const packet = baseCompanyPacket({ signalEvents: [signalEvent({ subjectId: "co-ghost" })] });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "signal_subject_unresolved")).toBe(true);
  });

  it("rejects subjectType incompatible with signalType (exploit is protocol/network only)", () => {
    const packet = baseCompanyPacket({
      signalEvents: [signalEvent({ signalType: "exploit", signalCategory: "risk", signalDirection: "negative" })],
    });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "schema_invalid")).toBe(true);
  });

  it("case H: reported_unconfirmed requires unconfirmedNote", () => {
    const missingNote = baseCompanyPacket({ signalEvents: [signalEvent({ eventStatus: "reported_unconfirmed" })] });
    const withNote = baseCompanyPacket({
      signalEvents: [signalEvent({ eventStatus: "reported_unconfirmed", unconfirmedNote: "Financing terms not yet final." })],
    });
    expect(compileBatch([{ label: "p", raw: missingNote }], { batch: "SYNTHETIC" }).ok).toBe(false);
    expect(compileBatch([{ label: "p", raw: withNote }], { batch: "SYNTHETIC" }).ok).toBe(true);
  });

  it("an analyst interpretation must state its basis", () => {
    const packet = baseCompanyPacket({
      signalEvents: [signalEvent({ analystInterpretation: "This suggests strong traction.", interpretationBasis: "unknown" })],
    });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
  });

  it("rejects a signal event that leaked past the cutoff", () => {
    const packet = baseCompanyPacket({ signalEvents: [signalEvent({ availabilityDate: "2026-09-20" })] });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "cutoff_leakage")).toBe(true);
  });

  it("stamps ingestedAt at compile time, not from packet input", () => {
    const now = new Date("2026-09-05T12:00:00.000Z");
    const packet = baseCompanyPacket({ signalEvents: [signalEvent()] });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC", now });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    expect(result.corpus?.signalEvents[0]?.ingestedAt).toBe(now.toISOString());
  });
});
