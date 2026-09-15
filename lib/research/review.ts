import { z } from "zod";

/**
 * The review queue.
 *
 * Records the pipeline could not confidently process go here rather than into
 * the corpus. This is the mechanism behind a rule that is easy to state and
 * easy to quietly abandon: a questionable record is never forced into the
 * corpus to improve coverage.
 *
 * The temptation is real. A universe of 120 companies looks better than 113,
 * and the seven that did not resolve are exactly the seven a coverage metric
 * would push someone to guess about. Making the queue a first-class output,
 * counted in the research summary, is what keeps that visible.
 *
 * Nothing here is a failure of the research. An unresolved company usually
 * means a source did not say clearly enough which company it meant, which is
 * a fact about the source.
 */

export const reviewReasonSchema = z.enum([
  "unresolved_company",
  "ambiguous_company",
  "missing_source",
  "missing_availability_evidence",
  "invalid_date",
  "duplicate_candidate",
  "contradictory_claim",
  "unconfirmed_financing",
  "unsupported_event_classification",
  "ambiguous_event_classification",
  "low_confidence_match",
  "unknown_signal_type",
  "excerpt_too_long",
  "schema_invalid",
]);
export type ReviewReason = z.infer<typeof reviewReasonSchema>;

export const REVIEW_REASON_GUIDANCE: Record<ReviewReason, string> = {
  unresolved_company:
    "No company in the universe matched. Add a domain to the record, or add the company to companies.yaml.",
  ambiguous_company:
    "Several companies matched. Supply a domain, which outranks every name-based rule.",
  missing_source: "The cited URL is not present in sources.yaml. Add it there first.",
  missing_availability_evidence:
    "An availability date was given with no defensible basis. Supply an availability method, or set the date to null with not_established.",
  invalid_date: "A date was malformed. Dates are calendar dates in YYYY-MM-DD form.",
  duplicate_candidate: "Another record shares a strong identity key with this one.",
  contradictory_claim: "This claim contradicts another and both have been kept. Record which is correct.",
  unconfirmed_financing:
    "An event was reported but not confirmed to have occurred. Confirm the outcome with a definitive source before it is treated as completed, and do not count it as capital raised.",
  unsupported_event_classification:
    "No headline pattern matched confidently. Classify the event by hand in events.yaml, or drop it.",
  ambiguous_event_classification:
    "Two different signal types matched at similar confidence. Classify by hand.",
  low_confidence_match:
    "A company matched only by name. Supply a domain to raise the match above the approval threshold.",
  unknown_signal_type: "The signal type is not defined in config/signals.yaml.",
  excerpt_too_long: "A verbatim excerpt exceeded the 280 character cap. Paraphrase it instead.",
  schema_invalid: "The record failed schema validation. The detail names the field.",
};

export const reviewItemSchema = z.object({
  reason: reviewReasonSchema,
  /** Which research file and which record, so a human can find it. */
  sourceFile: z.string().min(1),
  recordKey: z.string().min(1),
  detail: z.string().min(1),
  /** What to do about it. Copied from the guidance above. */
  guidance: z.string().min(1),
  /** Candidate ids where the problem was ambiguity. */
  candidates: z.array(z.string()).default([]),
});
export type ReviewItem = z.infer<typeof reviewItemSchema>;

export const reviewQueueSchema = z.object({
  schemaVersion: z.number().int().positive(),
  generatedAt: z.string().min(1),
  researchRunId: z.string().min(1),
  totalItems: z.number().int().nonnegative(),
  byReason: z.partialRecord(reviewReasonSchema, z.number().int().nonnegative()),
  items: z.array(reviewItemSchema),
});
export type ReviewQueue = z.infer<typeof reviewQueueSchema>;

/** Collects review items during a run and emits a deterministic report. */
export class ReviewCollector {
  private readonly items: ReviewItem[] = [];

  add(input: {
    reason: ReviewReason;
    sourceFile: string;
    recordKey: string;
    detail: string;
    candidates?: string[];
  }): void {
    this.items.push({
      reason: input.reason,
      sourceFile: input.sourceFile,
      recordKey: input.recordKey,
      detail: input.detail,
      guidance: REVIEW_REASON_GUIDANCE[input.reason],
      candidates: input.candidates ?? [],
    });
  }

  get size(): number {
    return this.items.length;
  }

  countBy(reason: ReviewReason): number {
    return this.items.filter((item) => item.reason === reason).length;
  }

  /**
   * The report, deterministically ordered.
   *
   * Sorted by reason, then file, then record key, so a re-run with unchanged
   * input produces a byte-identical report and a real change produces a small
   * diff.
   */
  report(meta: { generatedAt: string; researchRunId: string; schemaVersion: number }): ReviewQueue {
    const items = [...this.items].sort((a, b) => {
      if (a.reason !== b.reason) return a.reason.localeCompare(b.reason);
      if (a.sourceFile !== b.sourceFile) return a.sourceFile.localeCompare(b.sourceFile);
      if (a.recordKey !== b.recordKey) return a.recordKey.localeCompare(b.recordKey);
      return a.detail.localeCompare(b.detail);
    });

    const byReason: Partial<Record<ReviewReason, number>> = {};
    for (const item of items) {
      byReason[item.reason] = (byReason[item.reason] ?? 0) + 1;
    }

    return reviewQueueSchema.parse({
      schemaVersion: meta.schemaVersion,
      generatedAt: meta.generatedAt,
      researchRunId: meta.researchRunId,
      totalItems: items.length,
      byReason,
      items,
    });
  }
}
