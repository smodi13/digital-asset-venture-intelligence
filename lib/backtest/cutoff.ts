import type { SignalEvent } from "@/lib/schemas/signal-event";

/**
 * Historical cutoff eligibility.
 *
 * THE RULE
 *
 *   publicationDate <= cutoff  AND  availabilityDate <= cutoff
 *
 * Both conditions must hold. Both comparisons are inclusive.
 *
 * WHAT THE BACKTEST IS ACTUALLY ASKING
 *
 * The question is what information was publicly available on a past date. It
 * is NOT whether this particular software happened to be running then. Those
 * are different questions, and answering the second one by mistake makes the
 * backtest measure the age of the project rather than the quality of the
 * framework.
 *
 * That distinction is why ingestedAt takes no part in this rule. A press
 * release publicly available in June 2024 and read by this pipeline in
 * September 2026 was available to any investor in December 2024, so a December
 * 2024 backtest may use it. Excluding it would understate what the framework
 * could have seen, for a reason that has nothing to do with the framework.
 *
 * WHY availabilityDate IS A SEPARATE FIELD FROM publicationDate
 *
 * publicationDate is what a source SAYS. availabilityDate is what can be
 * DEMONSTRATED. They are usually the same and sometimes are not: an undated
 * page whose earliest archived snapshot is months after its claimed date has a
 * publication date it asserts and an availability date we can prove, and the
 * backtest must use the one we can prove.
 *
 * Requiring both to precede the cutoff means a source cannot buy eligibility
 * by asserting an early date, and cannot lose it merely because this project
 * found it late.
 *
 * FAILING CLOSED
 *
 * A missing, malformed, or uninterpretable date makes an event ineligible.
 * A null availabilityDate means historical availability could not be
 * established, and such an event is never backtest eligible. Nothing is
 * defaulted, inferred, or repaired into an eligible value, and in particular
 * availabilityDate is never quietly filled from publicationDate.
 *
 * Being wrong toward exclusion costs recall. Being wrong toward inclusion
 * silently invalidates the entire backtest, so the failure direction is fixed.
 *
 * A CONSEQUENCE WORTH STATING
 *
 * The set of records usable for current screening and the set usable for a
 * historical test are different, and the second is smaller. An event with a
 * null availabilityDate is perfectly good current evidence and is simply not
 * admissible historically. That is correct, not a defect.
 *
 * TWO WITHDRAWN RULES
 *
 * min(publicationDate, observationDate) <= cutoff admitted information
 * published before a cutoff but not seen until after it.
 *
 * max(publicationDate, observationDate) <= cutoff fixed that leak but
 * introduced the opposite error, excluding genuinely historical evidence
 * merely because this pipeline read it recently.
 *
 * Both are permanently withdrawn. tests/cutoff-leakage.test.ts pins the
 * current rule against both failure modes.
 */

/** The minimal shape the rule needs. Anything with these two dates works. */
export interface CutoffDatedEvent {
  publicationDate: string | null;
  availabilityDate: string | null;
}

/** Why an event was excluded. Surfaced so an exclusion is explainable. */
export type CutoffExclusionReason =
  | "publication_date_missing"
  | "publication_date_invalid"
  | "availability_not_established"
  | "availability_date_invalid"
  | "cutoff_invalid"
  | "published_after_cutoff"
  | "available_after_cutoff";

export interface CutoffDecision {
  eligible: boolean;
  /** Null when eligible. The first failing condition otherwise. */
  reason: CutoffExclusionReason | null;
}

/**
 * Strict calendar-date parse.
 *
 * Accepts exactly YYYY-MM-DD and requires the components to round trip, so
 * "2024-02-30" and "2024-13-01" are rejected rather than rolling over into a
 * neighbouring month the way Date parsing would.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseCutoffDate(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  if (y === undefined || m === undefined || d === undefined) return null;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const timestamp = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(timestamp)) return null;
  const roundTrip = new Date(timestamp);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
}

/**
 * Decide eligibility, with the reason for an exclusion.
 *
 * Conditions are checked in a fixed order so the reason is deterministic:
 * cutoff validity, then publication presence and validity, then availability
 * presence and validity, then the two comparisons.
 */
export function cutoffDecision(
  event: CutoffDatedEvent,
  cutoff: string,
): CutoffDecision {
  const cutoffAt = parseCutoffDate(cutoff);
  if (cutoffAt === null) return { eligible: false, reason: "cutoff_invalid" };

  if (event.publicationDate === null || event.publicationDate === undefined) {
    return { eligible: false, reason: "publication_date_missing" };
  }
  const publishedAt = parseCutoffDate(event.publicationDate);
  if (publishedAt === null) {
    return { eligible: false, reason: "publication_date_invalid" };
  }

  if (event.availabilityDate === null || event.availabilityDate === undefined) {
    // Historical availability was not established. Usable for current
    // screening, never for a historical test.
    return { eligible: false, reason: "availability_not_established" };
  }
  const availableAt = parseCutoffDate(event.availabilityDate);
  if (availableAt === null) {
    return { eligible: false, reason: "availability_date_invalid" };
  }

  if (publishedAt > cutoffAt) {
    return { eligible: false, reason: "published_after_cutoff" };
  }
  if (availableAt > cutoffAt) {
    return { eligible: false, reason: "available_after_cutoff" };
  }

  return { eligible: true, reason: null };
}

/**
 * Whether an event was publicly available at the cutoff.
 *
 * Derived at query time and never stored on the event. A stored flag would go
 * stale against a different cutoff, which is how a leak gets reintroduced
 * after the rule itself has been fixed.
 */
export function isCutoffEligible(
  event: CutoffDatedEvent,
  cutoff: string,
): boolean {
  return cutoffDecision(event, cutoff).eligible;
}

/**
 * Filter a set of events to those publicly available at the cutoff.
 *
 * Input order is preserved, so a caller that sorted its input keeps that
 * ordering and the resulting set hashes stably.
 */
export function eligibleEvents<T extends CutoffDatedEvent>(
  events: readonly T[],
  cutoff: string,
): T[] {
  return events.filter((event) => isCutoffEligible(event, cutoff));
}

/** The ids of the eligible events, sorted, for stable hashing and comparison. */
export function eligibleEventIds(
  events: readonly SignalEvent[],
  cutoff: string,
): string[] {
  return eligibleEvents(events, cutoff)
    .map((event) => event.id)
    .sort();
}

/**
 * Whether an event can ever be used in a historical test, at any cutoff.
 *
 * Separates "not available yet at this cutoff" from "never admissible". The
 * Backtest Lab uses this to report how much of the corpus is historically
 * usable at all, which is a limitation worth stating rather than discovering.
 */
export function isBacktestAdmissible(event: CutoffDatedEvent): boolean {
  return (
    parseCutoffDate(event.publicationDate) !== null &&
    parseCutoffDate(event.availabilityDate) !== null
  );
}
