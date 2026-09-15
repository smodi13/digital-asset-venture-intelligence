import { z } from "zod";
import {
  signalEventBaseSchema,
  signalEventSchema,
  type SignalEvent,
} from "@/lib/schemas/signal-event";

/**
 * The ingestion boundary.
 *
 * ingestedAt is audit metadata: it records when this pipeline actually read a
 * record. Its usefulness depends entirely on it being true, so a source
 * adapter must not be able to set it, and nothing should be able to backdate
 * it quietly.
 *
 * This module is the only supported way to create a SignalEvent. The boundary
 * is enforced three ways, because a comment alone would not survive contact
 * with a future adapter author in a hurry.
 *
 *   1. TYPE. Adapters produce a SignalEventDraft, whose type has no ingestedAt
 *      field at all. Passing one is a compile error.
 *   2. RUNTIME. Any ingestedAt present on an incoming object is stripped
 *      before stamping, so an untyped or JSON-shaped caller cannot smuggle one
 *      through.
 *   3. CLOCK. The production entry point reads the clock itself and accepts no
 *      timestamp argument. There is no parameter to pass a false value to.
 *
 * Deterministic fixture generation needs a fixed timestamp, which is a real
 * requirement and not a reason to weaken any of the above. It is served by a
 * separate, deliberately awkwardly named function that says in its own name
 * that it is not for production use.
 *
 * Note that ingestedAt never affects historical backtest eligibility. See
 * lib/backtest/cutoff.ts. Backdating it would corrupt the audit trail; it
 * would not change a single backtest result.
 */

/**
 * What a source adapter produces.
 *
 * Every SignalEvent field except ingestedAt, which the boundary supplies.
 */
export const signalEventDraftSchema = signalEventBaseSchema.omit({
  ingestedAt: true,
});

/**
 * The validated draft, after schema defaults have been applied.
 *
 * Adapters generally write SignalEventDraftInput and let the boundary fill
 * defaults; this is the shape after that has happened.
 */
export type SignalEventDraft = z.output<typeof signalEventDraftSchema>;

/**
 * What an adapter actually writes.
 *
 * Fields carrying a schema default may be omitted. Neither shape has an
 * ingestedAt field, which is the point.
 */
export type SignalEventDraftInput = z.input<typeof signalEventDraftSchema>;

export class IngestionError extends Error {
  constructor(detail: string) {
    super(`[ingest] ${detail}`);
    this.name = "IngestionError";
  }
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/**
 * Remove ingestedAt from an incoming object.
 *
 * The type already forbids it. This handles the case the type cannot: a value
 * that arrived as parsed JSON, crossed an `unknown` boundary, or was cast.
 */
function stripIngestedAt(draft: SignalEventDraftInput): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...(draft as Record<string, unknown>) };
  delete clone.ingestedAt;
  return clone;
}

function finalise(fields: Record<string, unknown>, ingestedAt: string): SignalEvent {
  const result = signalEventSchema.safeParse({ ...fields, ingestedAt });
  if (!result.success) {
    throw new IngestionError(formatIssues(result.error));
  }
  return result.data;
}

/**
 * Ingest a signal event, stamping the ingestion time from the clock.
 *
 * This is the production entry point. It takes no timestamp argument, so
 * there is nothing to backdate.
 */
export function ingestSignalEvent(draft: SignalEventDraftInput): SignalEvent {
  return finalise(stripIngestedAt(draft), new Date().toISOString());
}

/** Ingest a batch, stamping every record with one consistent run timestamp. */
export function ingestSignalEvents(
  drafts: readonly SignalEventDraftInput[],
): SignalEvent[] {
  // One stamp for the whole run, so records from a single ingestion are not
  // separated by millisecond drift in the audit trail.
  const ingestedAt = new Date().toISOString();
  return drafts.map((draft) => finalise(stripIngestedAt(draft), ingestedAt));
}

/**
 * Ingest with a fixed timestamp. FIXTURES AND TESTS ONLY.
 *
 * Deterministic fixture generation must produce byte-identical output on every
 * run, which a clock read would break. That is a legitimate need, so it gets
 * its own function rather than a parameter on the production one.
 *
 * The name is long and explicit on purpose: it should be obvious in review
 * that a production code path is calling something it should not be. A test
 * asserts that no file outside scripts/ and tests/ calls it.
 */
export function ingestSignalEventWithFixedTimestampForFixturesOnly(
  draft: SignalEventDraftInput,
  fixedIngestedAt: string,
): SignalEvent {
  return finalise(stripIngestedAt(draft), fixedIngestedAt);
}

/**
 * Ingest with the research run timestamp. RESEARCH CORPUS BUILDS ONLY.
 *
 * The second legitimate reason to supply a timestamp. A committed corpus must
 * be regenerable exactly, which a clock read would prevent: the manifest hash
 * would change on every run and stop meaning anything.
 *
 * This is a separate function from the fixture variant rather than a shared
 * one, so the two uses stay distinguishable in review and each can be
 * constrained to its own call sites by test. Both leave the production
 * constructor untouched.
 *
 * The timestamp is controlled at the orchestration layer, not by an adapter.
 * An adapter still cannot influence it.
 */
export function ingestSignalEventForReproducibleBuild(
  draft: SignalEventDraftInput,
  researchRunAt: string,
): SignalEvent {
  return finalise(stripIngestedAt(draft), researchRunAt);
}
