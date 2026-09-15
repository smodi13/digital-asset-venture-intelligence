import { describe, it, expect } from "vitest";
import {
  cutoffDecision,
  isCutoffEligible,
  isBacktestAdmissible,
  eligibleEvents,
  eligibleEventIds,
  parseCutoffDate,
  type CutoffDatedEvent,
} from "@/lib/backtest/cutoff";
import { hashIdSet } from "@/lib/hash/canonical";
import { SCHEMA_VERSION, NOT_ESTABLISHED, type SignalEvent } from "@/lib/schemas";
import {
  ingestSignalEventWithFixedTimestampForFixturesOnly,
  type SignalEventDraft,
} from "@/lib/domain/ingest";

/**
 * Historical cutoff regression.
 *
 * THE RULE UNDER TEST
 *
 *   publicationDate <= cutoff  AND  availabilityDate <= cutoff
 *
 * ingestedAt takes no part. The backtest asks what information was publicly
 * available on a past date, not whether this software was running then.
 *
 * TWO WITHDRAWN RULES, BOTH PINNED AGAINST HERE
 *
 * The first used min(publication, observation) and admitted information that
 * had not been seen by the cutoff. The second used max(publication,
 * observation) where observation meant "when this pipeline read it", which
 * closed that leak but created the opposite error: it excluded genuinely
 * historical evidence merely because this project found it recently.
 *
 * Case A is the case the second rule got wrong. Case B is the case the first
 * rule got wrong. Both directions are tested, because a fix in one direction
 * that breaks the other is not a fix.
 */

const CUTOFF = "2026-01-01";

/** A date offset from the cutoff by whole days, as YYYY-MM-DD. */
function offsetDays(base: string, days: number): string {
  const at = parseCutoffDate(base);
  if (at === null) throw new Error(`invalid base date ${base}`);
  const shifted = new Date(at + days * 86_400_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dates(
  publicationDate: string | null,
  availabilityDate: string | null,
): CutoffDatedEvent {
  return { publicationDate, availabilityDate };
}

/* -------------------------------------------------------------------------- */
/* Enumerated cases A to H                                                    */
/* -------------------------------------------------------------------------- */

describe("cutoff eligibility, enumerated cases", () => {
  it("A: published before, available before, INGESTED AFTER is ELIGIBLE", () => {
    // The key historical-reconstruction case. A press release publicly
    // available in June 2024 and read by this pipeline in September 2026 was
    // available to any investor in December 2024, so a December 2024 backtest
    // may use it. The previous max(publication, observation) rule excluded
    // this, which measured the age of the project rather than the framework.
    const event = signalEvent({
      id: "evt-a",
      publicationDate: "2024-06-10",
      availabilityDate: "2024-06-10",
      ingestedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(isCutoffEligible(event, "2024-12-31")).toBe(true);
    expect(cutoffDecision(event, "2024-12-31").reason).toBeNull();
  });

  it("B: published before but available after is EXCLUDED", () => {
    // A source cannot buy eligibility by asserting an early date. What can be
    // demonstrated governs what can be asserted.
    const decision = cutoffDecision(dates("2025-12-20", "2026-02-10"), CUTOFF);
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe("available_after_cutoff");
  });

  it("C: published after but available before is excluded", () => {
    const decision = cutoffDecision(dates("2026-03-01", "2025-12-01"), CUTOFF);
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe("published_after_cutoff");
  });

  it("D: both after the cutoff is excluded", () => {
    expect(isCutoffEligible(dates("2026-02-01", "2026-02-02"), CUTOFF)).toBe(false);
  });

  it("E: a missing availabilityDate is excluded", () => {
    // Historical availability was not established. The record may be perfectly
    // good current screening evidence and is never admissible historically.
    const decision = cutoffDecision(dates("2025-06-01", null), CUTOFF);
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe("availability_not_established");
  });

  it("F: a missing publicationDate is excluded", () => {
    const decision = cutoffDecision(dates(null, "2025-06-01"), CUTOFF);
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe("publication_date_missing");
  });

  it("G: both exactly equal to the cutoff is eligible", () => {
    expect(isCutoffEligible(dates(CUTOFF, CUTOFF), CUTOFF)).toBe(true);
  });

  it("G: publication equal to the cutoff with availability before is eligible", () => {
    expect(isCutoffEligible(dates(CUTOFF, "2025-12-30"), CUTOFF)).toBe(true);
  });

  it("G: availability equal to the cutoff with publication before is eligible", () => {
    expect(isCutoffEligible(dates("2025-12-30", CUTOFF), CUTOFF)).toBe(true);
  });

  it("H: moving ingestedAt from before to after the cutoff does NOT change eligibility", () => {
    // ingestedAt is audit metadata. If it could change a historical result,
    // re-running an ingest would silently rewrite history.
    const base = {
      id: "evt-h",
      publicationDate: "2025-03-01",
      availabilityDate: "2025-03-01",
    };
    const ingestedBefore = signalEvent({ ...base, ingestedAt: "2025-06-01T00:00:00.000Z" });
    const ingestedAfter = signalEvent({ ...base, ingestedAt: "2026-11-30T00:00:00.000Z" });

    expect(isCutoffEligible(ingestedBefore, CUTOFF)).toBe(true);
    expect(isCutoffEligible(ingestedAfter, CUTOFF)).toBe(true);
    expect(isCutoffEligible(ingestedAfter, CUTOFF)).toBe(
      isCutoffEligible(ingestedBefore, CUTOFF),
    );
  });

  it("H: the same holds for an event that is excluded on its dates", () => {
    const base = {
      id: "evt-h2",
      publicationDate: "2026-05-01",
      availabilityDate: "2026-05-01",
    };
    const early = signalEvent({ ...base, ingestedAt: "2026-05-02T00:00:00.000Z" });
    const late = signalEvent({ ...base, ingestedAt: "2027-01-01T00:00:00.000Z" });
    expect(isCutoffEligible(early, CUTOFF)).toBe(false);
    expect(isCutoffEligible(late, CUTOFF)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe("invalid dates fail closed", () => {
  const invalid = [
    "not-a-date",
    "2026",
    "2026-13-01",
    "2024-02-30",
    "2026/01/01",
    "20260101",
    "2026-1-1",
    "",
    "2026-01-01T00:00:00Z",
  ];

  for (const bad of invalid) {
    it(`rejects publication date ${JSON.stringify(bad)}`, () => {
      const decision = cutoffDecision(dates(bad, "2025-01-01"), CUTOFF);
      expect(decision.eligible).toBe(false);
      expect(decision.reason).toBe("publication_date_invalid");
    });

    it(`rejects availability date ${JSON.stringify(bad)}`, () => {
      const decision = cutoffDecision(dates("2025-01-01", bad), CUTOFF);
      expect(decision.eligible).toBe(false);
      expect(decision.reason).toBe("availability_date_invalid");
    });
  }

  it("an invalid cutoff makes everything ineligible rather than everything eligible", () => {
    const decision = cutoffDecision(dates("2020-01-01", "2020-01-01"), "not-a-date");
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe("cutoff_invalid");
  });

  it("never defaults a missing date to something eligible", () => {
    expect(isCutoffEligible(dates(null, null), CUTOFF)).toBe(false);
  });

  it("never fills availabilityDate from publicationDate", () => {
    // The convenience that would destroy the distinction: a source asserting a
    // date is not a source demonstrating one.
    expect(isCutoffEligible(dates("2020-01-01", null), CUTOFF)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Case I: exhaustive offset table                                            */
/* -------------------------------------------------------------------------- */

describe("case I: exhaustive relative-offset table", () => {
  const offsets = [-2, -1, 0, 1, 2];

  it("matches the logical AND rule for every offset pair from -2 to +2 days", () => {
    const mismatches: string[] = [];
    for (const pubOffset of offsets) {
      for (const availOffset of offsets) {
        const expected = pubOffset <= 0 && availOffset <= 0;
        const actual = isCutoffEligible(
          dates(offsetDays(CUTOFF, pubOffset), offsetDays(CUTOFF, availOffset)),
          CUTOFF,
        );
        if (actual !== expected) {
          mismatches.push(
            `pub ${pubOffset}, avail ${availOffset}: expected ${expected}, got ${actual}`,
          );
        }
      }
    }
    expect(mismatches, mismatches.join("\n")).toEqual([]);
  });

  it("agrees with max(publication, availability) <= cutoff over the same table", () => {
    for (const pubOffset of offsets) {
      for (const availOffset of offsets) {
        const publicationDate = offsetDays(CUTOFF, pubOffset);
        const availabilityDate = offsetDays(CUTOFF, availOffset);
        const pub = parseCutoffDate(publicationDate);
        const avail = parseCutoffDate(availabilityDate);
        const cut = parseCutoffDate(CUTOFF);
        if (pub === null || avail === null || cut === null) throw new Error("setup error");
        expect(isCutoffEligible(dates(publicationDate, availabilityDate), CUTOFF)).toBe(
          Math.max(pub, avail) <= cut,
        );
      }
    }
  });

  it("is unaffected by ingestedAt across the whole table", () => {
    for (const pubOffset of offsets) {
      for (const availOffset of offsets) {
        const publicationDate = offsetDays(CUTOFF, pubOffset);
        const availabilityDate = offsetDays(CUTOFF, availOffset);
        const withEarlyIngest = signalEvent({
          id: `evt-${pubOffset}-${availOffset}-early`,
          publicationDate,
          availabilityDate,
          ingestedAt: `${offsetDays(CUTOFF, Math.max(availOffset, 0))}T00:00:00.000Z`,
        });
        const withLateIngest = signalEvent({
          id: `evt-${pubOffset}-${availOffset}-late`,
          publicationDate,
          availabilityDate,
          ingestedAt: "2027-06-01T00:00:00.000Z",
        });
        expect(isCutoffEligible(withLateIngest, CUTOFF)).toBe(
          isCutoffEligible(withEarlyIngest, CUTOFF),
        );
      }
    }
  });

  it("documents which pairs the withdrawn min rule would have wrongly admitted", () => {
    const wronglyAdmitted: string[] = [];
    for (const pubOffset of offsets) {
      for (const availOffset of offsets) {
        const byMin = Math.min(pubOffset, availOffset) <= 0;
        const byRule = pubOffset <= 0 && availOffset <= 0;
        if (byMin && !byRule) wronglyAdmitted.push(`pub ${pubOffset}, avail ${availOffset}`);
      }
    }
    expect(wronglyAdmitted).toContain("pub -2, avail 1");
    expect(wronglyAdmitted).toContain("pub 1, avail -2");
  });
});

/* -------------------------------------------------------------------------- */
/* Filtering regressions, cases J and K                                       */
/* -------------------------------------------------------------------------- */

function signalEvent(input: {
  id: string;
  publicationDate: string | null;
  availabilityDate: string | null;
  ingestedAt: string;
}): SignalEvent {
  const draft: SignalEventDraft = {
    id: input.id,
    schemaVersion: SCHEMA_VERSION,
    companyId: "example-company-alpha",
    companyNameRaw: "Example Company Alpha",
    entityMatchConfidence: 0.95,
    entityMatchMethod: "domain",
    sourceId: "src-example-0001",
    sourceUrl: "https://example.com/item",
    sourceRecordId: null,
    sourceReliability: 0.7,
    publicationDate: input.publicationDate,
    availabilityDate: input.availabilityDate,
    availabilityEvidence:
      input.availabilityDate === null
        ? NOT_ESTABLISHED
        : {
            method: "intrinsic_timestamp" as const,
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
    evidenceSummary: "Fixture event for the cutoff filtering regression.",
    evidenceIds: [],
    claimConfidence: "medium",
    humanVerified: "unverified",
    verifiedBy: null,
    verifiedAt: null,
    contradicts: [],
    contradictedBy: [],
    investmentInterpretation: null,
    interpretationBasis: "unknown",
  };
  return ingestSignalEventWithFixedTimestampForFixturesOnly(draft, input.ingestedAt);
}

describe("filtering regressions", () => {
  const baseline: SignalEvent[] = [
    signalEvent({
      id: "evt-a",
      publicationDate: "2025-03-01",
      availabilityDate: "2025-03-01",
      ingestedAt: "2025-03-02T00:00:00.000Z",
    }),
    signalEvent({
      id: "evt-b",
      publicationDate: "2025-07-15",
      availabilityDate: "2025-07-15",
      ingestedAt: "2025-07-16T00:00:00.000Z",
    }),
    signalEvent({
      id: "evt-c",
      publicationDate: "2025-12-31",
      availabilityDate: "2025-12-31",
      ingestedAt: "2025-12-31T12:00:00.000Z",
    }),
  ];

  /** Published and demonstrably available before the cutoff, ingested long after. */
  const lateIngested = signalEvent({
    id: "evt-late-ingest",
    publicationDate: "2025-05-01",
    availabilityDate: "2025-05-01",
    ingestedAt: "2026-09-20T00:00:00.000Z",
  });

  /** Published before the cutoff, but demonstrably available only after it. */
  const unavailable = signalEvent({
    id: "evt-unavailable",
    publicationDate: "2025-05-01",
    availabilityDate: "2026-04-01",
    ingestedAt: "2026-04-02T00:00:00.000Z",
  });

  it("J: a late-ingested but historically available event DOES change the eligible set", () => {
    // The evidence was publicly available before the cutoff, so a historical
    // test is entitled to use it. Excluding it would understate what the
    // framework could have seen for a reason unrelated to the framework.
    const before = eligibleEventIds(baseline, CUTOFF);
    const after = eligibleEventIds([...baseline, lateIngested], CUTOFF);

    expect(before).toEqual(["evt-a", "evt-b", "evt-c"]);
    expect(after).toContain("evt-late-ingest");
    expect(after).not.toEqual(before);
    expect(after).toHaveLength(before.length + 1);
  });

  it("J: the deterministic input hash changes when a historically available event is added", () => {
    const before = hashIdSet(eligibleEventIds(baseline, CUTOFF));
    const after = hashIdSet(eligibleEventIds([...baseline, lateIngested], CUTOFF));
    expect(after).not.toBe(before);
  });

  it("K: an event whose demonstrated availability is after the cutoff does NOT change the eligible set", () => {
    const before = eligibleEventIds(baseline, CUTOFF);
    const after = eligibleEventIds([...baseline, unavailable], CUTOFF);
    expect(after).toEqual(before);
  });

  it("K: the deterministic input hash is unchanged by an unavailable event", () => {
    // The property a ScoreSnapshot depends on: adding information the past
    // could not have had must not perturb a historical score.
    const before = hashIdSet(eligibleEventIds(baseline, CUTOFF));
    const after = hashIdSet(eligibleEventIds([...baseline, unavailable], CUTOFF));
    expect(after).toBe(before);
  });

  it("K: the unavailable event is admitted once the cutoff passes its availability date", () => {
    // Confirms the record is otherwise well formed, so the exclusion above is
    // the rule working rather than a malformed record being dropped.
    expect(eligibleEventIds([...baseline, unavailable], "2026-06-01")).toContain(
      "evt-unavailable",
    );
  });

  it("an event with a null availabilityDate never reaches the eligible set at any cutoff", () => {
    const neverAdmissible = signalEvent({
      id: "evt-null-availability",
      publicationDate: "2025-01-01",
      availabilityDate: null,
      ingestedAt: "2025-01-02T00:00:00.000Z",
    });
    for (const cutoff of ["2025-06-01", "2026-01-01", "2030-01-01"]) {
      expect(eligibleEventIds([neverAdmissible], cutoff)).toEqual([]);
    }
    expect(isBacktestAdmissible(neverAdmissible)).toBe(false);
  });

  it("filtering preserves input order", () => {
    const filtered = eligibleEvents([...baseline, unavailable], CUTOFF);
    expect(filtered.map((e) => e.id)).toEqual(["evt-a", "evt-b", "evt-c"]);
  });
});

/* -------------------------------------------------------------------------- */

describe("backtest admissibility is separate from eligibility at a cutoff", () => {
  it("distinguishes not yet available from never admissible", () => {
    const notYet = dates("2026-05-01", "2026-05-01");
    const never = dates("2025-01-01", null);
    expect(isCutoffEligible(notYet, CUTOFF)).toBe(false);
    expect(isCutoffEligible(never, CUTOFF)).toBe(false);
    // Only one of them could ever become eligible at a later cutoff.
    expect(isBacktestAdmissible(notYet)).toBe(true);
    expect(isBacktestAdmissible(never)).toBe(false);
  });
});

describe("eventDate is not part of the rule", () => {
  it("an event whose eventDate precedes the cutoff is still excluded when available after", () => {
    // A round closed in January and announced in April was not knowable in
    // February. Occurrence and availability are different questions.
    const event = signalEvent({
      id: "evt-occurrence",
      publicationDate: "2026-04-01",
      availabilityDate: "2026-04-01",
      ingestedAt: "2026-04-02T00:00:00.000Z",
    });
    const withEarlierOccurrence: SignalEvent = { ...event, eventDate: "2025-01-15" };
    expect(isCutoffEligible(withEarlierOccurrence, CUTOFF)).toBe(false);
  });
});
