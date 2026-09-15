import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ingestSignalEvent,
  ingestSignalEvents,
  ingestSignalEventWithFixedTimestampForFixturesOnly,
  signalEventDraftSchema,
  IngestionError,
  type SignalEventDraft,
} from "@/lib/domain/ingest";
import { SCHEMA_VERSION, NOT_ESTABLISHED } from "@/lib/schemas";
import { isCutoffEligible } from "@/lib/backtest/cutoff";
import { walkTextFiles } from "@/lib/policy";

/**
 * The ingestion boundary.
 *
 * ingestedAt is audit metadata whose usefulness depends entirely on it being
 * true. These tests assert that a caller cannot set it, cannot backdate it,
 * and cannot change a historical result by trying.
 */

function draft(overrides: Partial<SignalEventDraft> = {}): SignalEventDraft {
  return {
    id: "evt-ingest-1",
    schemaVersion: SCHEMA_VERSION,
    companyId: "example-company-alpha",
    companyNameRaw: "Example Company Alpha",
    entityMatchConfidence: 0.95,
    entityMatchMethod: "domain",
    sourceId: "src-1",
    sourceUrl: "https://example.com/item",
    sourceRecordId: null,
    sourceReliability: 0.7,
    publicationDate: "2025-06-01",
    availabilityDate: "2025-06-01",
    availabilityEvidence: {
      method: "intrinsic_timestamp",
      sourceUrl: "https://example.com/item",
      sourceRecordId: null,
      note: null,
    },
    eventDate: null,
    signalType: "customer_momentum",
    signalCategory: "demand",
    signalDirection: "positive",
    eventStatus: "completed",
    unconfirmedNote: null,
    rawStrength: 0.5,
    evidenceSummary: "A paraphrased factual summary.",
    evidenceIds: [],
    claimConfidence: "medium",
    humanVerified: "unverified",
    verifiedBy: null,
    verifiedAt: null,
    contradicts: [],
    contradictedBy: [],
    investmentInterpretation: null,
    interpretationBasis: "unknown",
    ...overrides,
  };
}

describe("the draft shape excludes ingestedAt", () => {
  it("the draft schema has no ingestedAt field", () => {
    expect("ingestedAt" in signalEventDraftSchema.shape).toBe(false);
  });

  it("a valid draft parses", () => {
    expect(signalEventDraftSchema.safeParse(draft()).success).toBe(true);
  });

  it("an ingestedAt supplied on a draft is stripped, not honoured", () => {
    // The type already forbids this. The runtime strip handles the case the
    // type cannot: a value that arrived as JSON or crossed an unknown boundary.
    const smuggled = { ...draft(), ingestedAt: "1999-01-01T00:00:00.000Z" };
    const event = ingestSignalEvent(smuggled as SignalEventDraft);
    expect(event.ingestedAt).not.toBe("1999-01-01T00:00:00.000Z");
    expect(new Date(event.ingestedAt).getUTCFullYear()).toBeGreaterThan(2020);
  });
});

describe("production ingestion stamps the clock", () => {
  it("assigns an ingestedAt from the clock", () => {
    const before = Date.now();
    const event = ingestSignalEvent(draft());
    const after = Date.now();
    const stamped = new Date(event.ingestedAt).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });

  it("accepts no timestamp argument, so there is nothing to backdate", () => {
    // The production entry point takes exactly one parameter: the draft.
    expect(ingestSignalEvent.length).toBe(1);
  });

  it("stamps a batch with one consistent run timestamp", () => {
    const events = ingestSignalEvents([
      draft({ id: "evt-batch-1" }),
      draft({ id: "evt-batch-2" }),
      draft({ id: "evt-batch-3" }),
    ]);
    const stamps = new Set(events.map((e) => e.ingestedAt));
    expect(stamps.size).toBe(1);
  });

  it("rejects an invalid draft loudly rather than writing a broken record", () => {
    expect(() =>
      ingestSignalEvent(draft({ rawStrength: 5 } as Partial<SignalEventDraft>)),
    ).toThrow(IngestionError);
  });
});

describe("ingestion cannot precede public availability", () => {
  it("rejects an ingestedAt before the availabilityDate", () => {
    // You cannot read something before it exists. A record claiming otherwise
    // is either mis-stamped or an attempt to backdate.
    expect(() =>
      ingestSignalEventWithFixedTimestampForFixturesOnly(
        draft({ availabilityDate: "2026-05-01" }),
        "2026-01-01T00:00:00.000Z",
      ),
    ).toThrow(/must fall on or after availabilityDate/);
  });

  it("accepts an ingestedAt on the same day as availability", () => {
    const event = ingestSignalEventWithFixedTimestampForFixturesOnly(
      draft({ availabilityDate: "2026-01-01" }),
      "2026-01-01T09:00:00.000Z",
    );
    expect(event.ingestedAt).toBe("2026-01-01T09:00:00.000Z");
  });

  it("permits any ingestedAt when availability was never established", () => {
    const event = ingestSignalEventWithFixedTimestampForFixturesOnly(
      draft({ availabilityDate: null, availabilityEvidence: NOT_ESTABLISHED }),
      "2026-01-01T00:00:00.000Z",
    );
    expect(event.availabilityDate).toBeNull();
  });
});

describe("ingestedAt never affects historical eligibility", () => {
  it("two records differing only in ingestedAt are equally eligible", () => {
    const early = ingestSignalEventWithFixedTimestampForFixturesOnly(
      draft({ id: "evt-early" }),
      "2025-06-02T00:00:00.000Z",
    );
    const late = ingestSignalEventWithFixedTimestampForFixturesOnly(
      draft({ id: "evt-late" }),
      "2027-06-02T00:00:00.000Z",
    );
    expect(isCutoffEligible(late, "2026-01-01")).toBe(
      isCutoffEligible(early, "2026-01-01"),
    );
    expect(isCutoffEligible(late, "2026-01-01")).toBe(true);
  });

  it("backdating ingestedAt would corrupt the audit trail and change no result", () => {
    const honest = ingestSignalEventWithFixedTimestampForFixturesOnly(
      draft({ id: "evt-honest" }),
      "2026-09-01T00:00:00.000Z",
    );
    const backdated = ingestSignalEventWithFixedTimestampForFixturesOnly(
      draft({ id: "evt-honest" }),
      "2025-06-02T00:00:00.000Z",
    );
    expect(honest.ingestedAt).not.toBe(backdated.ingestedAt);
    for (const cutoff of ["2025-01-01", "2025-12-31", "2026-01-01", "2027-01-01"]) {
      expect(isCutoffEligible(backdated, cutoff)).toBe(isCutoffEligible(honest, cutoff));
    }
  });
});

describe("timestamp-supplying entry points are confined to their call sites", () => {
  const files = walkTextFiles(process.cwd(), { extensions: [".ts", ".tsx"] });

  it("the fixture variant is called only from fixtures and tests", () => {
    // The names are long and explicit so a production call site is obvious in
    // review. This asserts it mechanically rather than relying on review.
    const offenders = files.filter(
      (file) =>
        file.text.includes("ingestSignalEventWithFixedTimestampForFixturesOnly") &&
        !file.path.startsWith("tests/") &&
        !file.path.startsWith("scripts/") &&
        file.path !== "lib/domain/ingest.ts",
    );
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it("the research-build variant is called only from the pipeline orchestrator", () => {
    // A corpus build legitimately supplies a timestamp so the corpus is
    // regenerable exactly. No adapter may do so.
    const offenders = files.filter(
      (file) =>
        file.text.includes("ingestSignalEventForReproducibleBuild") &&
        !file.path.startsWith("tests/") &&
        file.path !== "lib/domain/ingest.ts" &&
        file.path !== "lib/research/pipeline.ts",
    );
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it("no source adapter supplies a timestamp", () => {
    const adapters = files.filter((f) => f.path.startsWith("lib/research/") && f.path.includes("adapter"));
    expect(adapters.length).toBeGreaterThan(0);
    for (const adapter of adapters) {
      expect(adapter.text.includes("ingestSignalEvent"), adapter.path).toBe(false);
    }
  });
});

describe("the committed fixture uses the three-date model", () => {
  const fixture = JSON.parse(
    readFileSync(
      join(process.cwd(), "data/generated/signal-events.json"),
      "utf8",
    ),
  ) as { records: Array<Record<string, unknown>> };

  it("every record carries an ingestedAt and no observationDate", () => {
    for (const record of fixture.records) {
      expect(typeof record.ingestedAt).toBe("string");
      expect("observationDate" in record).toBe(false);
      expect("availabilityDate" in record).toBe(true);
    }
  });

  it("is ingested after the 2026-01-01 cutoff used in the cutoff tests", () => {
    // The fixture itself demonstrates the central point: late ingestion does
    // not disqualify historically available evidence.
    for (const record of fixture.records) {
      expect(String(record.ingestedAt) > "2026-01-01").toBe(true);
    }
  });

  it("still yields an eligible record at that cutoff despite late ingestion", () => {
    const eligible = fixture.records.filter((r) =>
      isCutoffEligible(
        {
          publicationDate: (r.publicationDate as string | null) ?? null,
          availabilityDate: (r.availabilityDate as string | null) ?? null,
        },
        "2026-01-01",
      ),
    );
    expect(eligible.length).toBeGreaterThan(0);
  });

  // The three-date model's edge cases (a null availability date, an
  // availability date that postdates publication) are proven on synthetic
  // fixtures in tests/research/availability.test.ts. The real Batch 1 corpus
  // carries an intrinsic source timestamp on every event, so it does not
  // exercise those cases and is not asserted to.
});
