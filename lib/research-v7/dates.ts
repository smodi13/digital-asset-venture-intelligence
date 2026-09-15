/**
 * Date semantics and research-cutoff rules for the v7 research harness
 * (Phase 3B-0, PARALLEL / DORMANT).
 *
 * Preserves the project's existing date discipline: publicationDate,
 * availabilityDate, and ingestedAt are distinct concepts, and availabilityDate
 * is the decisive field for cutoff leakage. See docs/source-policy.md and
 * lib/schemas/signal-event.ts for the established rationale this mirrors.
 */

/** The frozen Phase 3 research cutoff. Evidence available after this date must not enter the sealed corpus. */
export const RESEARCH_CUTOFF = "2026-09-10";

/** Parse an ISO date (YYYY-MM-DD). Returns null rather than throwing on malformed input. */
export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whether `value` is on or before the cutoff. A malformed or missing date is never treated as on-time. */
export function isOnOrBeforeCutoff(value: string | null, cutoff = RESEARCH_CUTOFF): boolean {
  const d = parseIsoDate(value);
  const c = parseIsoDate(cutoff);
  if (!d || !c) return false;
  return d.getTime() <= c.getTime();
}

export interface CutoffCheckInput {
  publicationDate: string | null;
  availabilityDate: string | null;
}

export type CutoffViolationReason =
  | "availability_date_after_cutoff"
  | "publication_date_after_cutoff"
  | "availability_date_missing";

/**
 * Evaluate a source or event's dates against the research cutoff.
 *
 * availabilityDate is decisive. A null availabilityDate is not silently
 * inferred from publicationDate: it is reported so a reviewer can supply one
 * or accept the record as leakage-unproven, never coerced automatically.
 */
export function checkCutoff(
  input: CutoffCheckInput,
  cutoff = RESEARCH_CUTOFF,
): { ok: boolean; reason: CutoffViolationReason | null } {
  if (input.publicationDate !== null && !isOnOrBeforeCutoff(input.publicationDate, cutoff)) {
    return { ok: false, reason: "publication_date_after_cutoff" };
  }
  if (input.availabilityDate === null) {
    return { ok: false, reason: "availability_date_missing" };
  }
  if (!isOnOrBeforeCutoff(input.availabilityDate, cutoff)) {
    return { ok: false, reason: "availability_date_after_cutoff" };
  }
  return { ok: true, reason: null };
}

/** periodEnd must not fall before periodStart. Both dates must parse. */
export function isValidPeriod(periodStart: string | null, periodEnd: string | null): boolean {
  if (periodStart === null || periodEnd === null) return true; // nullability enforced elsewhere
  const s = parseIsoDate(periodStart);
  const e = parseIsoDate(periodEnd);
  if (!s || !e) return false;
  return s.getTime() <= e.getTime();
}
