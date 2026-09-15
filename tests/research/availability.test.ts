import { describe, it, expect } from "vitest";
import {
  availabilityEvidenceSchema,
  availabilityMethodSchema,
  availabilityProblem,
  isDefensibleAvailabilityMethod,
  NOT_ESTABLISHED,
  signalEventSchema,
  SCHEMA_VERSION,
} from "@/lib/schemas";
import { isCutoffEligible } from "@/lib/backtest/cutoff";

/**
 * AvailabilityEvidence.
 *
 * The rule under test: a historical availability date may not be recorded
 * without a defensible basis. A date with no explanation is indistinguishable
 * from a guess, and a guessed availability date silently corrupts every
 * backtest it touches.
 */

const baseEvent = {
  id: "evt-1",
  schemaVersion: SCHEMA_VERSION,
  companyId: "co-1",
  companyNameRaw: "Example Company",
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
  evidenceSummary: "A paraphrased factual summary.",
  claimConfidence: "medium" as const,
};

describe("the method vocabulary", () => {
  it("offers the seven specified methods", () => {
    expect([...availabilityMethodSchema.options].sort()).toEqual(
      [
        "archive_snapshot",
        "intrinsic_timestamp",
        "manual_verified",
        "not_established",
        "platform_event_timestamp",
        "regulatory_filing_timestamp",
        "repository_event",
      ].sort(),
    );
  });

  it("treats every method except not_established as defensible", () => {
    for (const method of availabilityMethodSchema.options) {
      expect(isDefensibleAvailabilityMethod(method)).toBe(method !== "not_established");
    }
  });
});

describe("manual_verified requires a note", () => {
  it("rejects manual_verified with no note", () => {
    const result = availabilityEvidenceSchema.safeParse({
      method: "manual_verified",
      sourceUrl: null,
      sourceRecordId: null,
      note: null,
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("requires a note");
  });

  it("accepts manual_verified with a note", () => {
    expect(
      availabilityEvidenceSchema.safeParse({
        method: "manual_verified",
        note: "Checked the print edition dated 2025-04-02.",
      }).success,
    ).toBe(true);
  });

  it("other methods do not require a note", () => {
    expect(
      availabilityEvidenceSchema.safeParse({ method: "intrinsic_timestamp" }).success,
    ).toBe(true);
  });
});

describe("archive_snapshot retains its archive reference", () => {
  it("keeps the archive URL and record id", () => {
    const parsed = availabilityEvidenceSchema.parse({
      method: "archive_snapshot",
      sourceUrl: "https://archive.example/2025/06/01/page",
      sourceRecordId: "snapshot-20250601",
      note: null,
    });
    expect(parsed.sourceUrl).toBe("https://archive.example/2025/06/01/page");
    expect(parsed.sourceRecordId).toBe("snapshot-20250601");
  });
});

describe("NEGATIVE: a historical date with no provenance is rejected", () => {
  it("rejects an availability date recorded as not_established", () => {
    // The central rule. Without it, availabilityDate is unauditable.
    const result = signalEventSchema.safeParse({
      ...baseEvent,
      availabilityDate: "2025-06-01",
      availabilityEvidence: NOT_ESTABLISHED,
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("requires a defensible basis");
  });

  it("rejects a null availability date paired with a defensible method", () => {
    // The mirror error: claiming a basis for a date that does not exist.
    const result = signalEventSchema.safeParse({
      ...baseEvent,
      availabilityDate: null,
      availabilityEvidence: { method: "intrinsic_timestamp", sourceUrl: null, sourceRecordId: null, note: null },
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("must be recorded as not_established");
  });

  it("accepts a null date with not_established", () => {
    const result = signalEventSchema.safeParse({
      ...baseEvent,
      availabilityDate: null,
      availabilityEvidence: NOT_ESTABLISHED,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a date with each defensible method", () => {
    for (const method of availabilityMethodSchema.options) {
      if (method === "not_established") continue;
      const evidence =
        method === "manual_verified"
          ? { method, sourceUrl: null, sourceRecordId: null, note: "basis recorded" }
          : { method, sourceUrl: null, sourceRecordId: null, note: null };
      const result = signalEventSchema.safeParse({ ...baseEvent, availabilityEvidence: evidence });
      expect(result.success, `${method} was rejected`).toBe(true);
    }
  });

  it("an event with not_established is never backtest eligible", () => {
    const event = signalEventSchema.parse({
      ...baseEvent,
      availabilityDate: null,
      availabilityEvidence: NOT_ESTABLISHED,
    });
    for (const cutoff of ["2025-01-01", "2026-01-01", "2030-01-01"]) {
      expect(isCutoffEligible(event, cutoff)).toBe(false);
    }
  });
});

describe("availabilityProblem reports rather than throws", () => {
  it("returns null when consistent", () => {
    expect(availabilityProblem("2025-01-01", { method: "archive_snapshot", sourceUrl: null, sourceRecordId: null, note: null })).toBeNull();
    expect(availabilityProblem(null, NOT_ESTABLISHED)).toBeNull();
  });

  it("describes the inconsistency when there is one", () => {
    expect(availabilityProblem("2025-01-01", NOT_ESTABLISHED)).toContain("defensible basis");
    expect(
      availabilityProblem(null, { method: "repository_event", sourceUrl: null, sourceRecordId: null, note: null }),
    ).toContain("not_established");
  });
});
