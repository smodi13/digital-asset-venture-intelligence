import { describe, it, expect } from "vitest";
import { compileBatch } from "@/lib/research-v7/compile";
import { baseCompanyPacket } from "./fixtures";

/**
 * Phase 3B-0.1 explicit eventStatus strictness proof.
 *
 * signalEventV7Schema defaults eventStatus to "completed" so the dormant
 * lib/domain/migrate-v6-v7.ts adapter can normalize v6 shape. That default
 * must never let a newly authored v7 research event skip classification: the
 * packet harness rejects any signal event whose raw input omits eventStatus
 * entirely, before the schema ever gets a chance to apply the default.
 */

function signalEvent(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
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

describe("eventStatus strictness (Phase 3B-0.1)", () => {
  it("a new v7 event that omits eventStatus entirely is rejected, never silently defaulted", () => {
    const event = signalEvent();
    delete (event as Record<string, unknown>).eventStatus;
    const packet = baseCompanyPacket({ signalEvents: [event] });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "event_status_required")).toBe(true);
  });

  it("an explicitly completed status is valid", () => {
    const packet = baseCompanyPacket({ signalEvents: [signalEvent({ eventStatus: "completed" })] });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("reported_unconfirmed without unconfirmedNote is rejected", () => {
    const packet = baseCompanyPacket({ signalEvents: [signalEvent({ eventStatus: "reported_unconfirmed", unconfirmedNote: null })] });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
  });

  it("reported_unconfirmed with unconfirmedNote is valid", () => {
    const packet = baseCompanyPacket({
      signalEvents: [signalEvent({ eventStatus: "reported_unconfirmed", unconfirmedNote: "Financing terms not yet final." })],
    });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("an interpretation without a stated basis is rejected", () => {
    const packet = baseCompanyPacket({
      signalEvents: [signalEvent({ analystInterpretation: "Suggests strong traction.", interpretationBasis: "unknown" })],
    });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
  });

  it("an interpretation with a stated basis is valid", () => {
    const packet = baseCompanyPacket({
      signalEvents: [signalEvent({ analystInterpretation: "Suggests strong traction.", interpretationBasis: "evidence" })],
    });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("no interpretation present does not fabricate a basis: interpretationBasis stays unknown", () => {
    const packet = baseCompanyPacket({ signalEvents: [signalEvent({ analystInterpretation: null, interpretationBasis: "unknown" })] });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    expect(result.corpus?.signalEvents[0]?.interpretationBasis).toBe("unknown");
    expect(result.corpus?.signalEvents[0]?.analystInterpretation).toBeNull();
  });
});
