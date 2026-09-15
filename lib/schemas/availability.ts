import { z } from "zod";
import { idSchema, urlSchema } from "./common";

/**
 * AvailabilityEvidence: how a historical availability date was established.
 *
 * Phase 2.1 introduced availabilityDate, the earliest point in time at which
 * information is demonstrated to have been publicly available. On its own that
 * field is not auditable: a date with no explanation is indistinguishable from
 * a guess, and a guessed availability date silently corrupts every backtest it
 * touches.
 *
 * This object is the explanation. It records WHICH KIND of timestamp
 * established the date, and where that timestamp can be checked.
 *
 * The rule the schema enforces is simple and absolute. A non-null
 * availabilityDate must carry a method other than not_established, and a null
 * availabilityDate must carry not_established. There is no third state and no
 * way to record a historical date without saying why it is defensible.
 */

/**
 * How historical availability was established, ordered from strongest to
 * weakest.
 *
 * Each method names a specific, checkable kind of timestamp. The list is
 * deliberately short: a method that cannot be pointed at is not a method.
 */
export const availabilityMethodSchema = z.enum([
  /** A publication timestamp intrinsic to the source, such as a dated press release. */
  "intrinsic_timestamp",
  /** A filing timestamp from a regulator or registry. The strongest kind. */
  "regulatory_filing_timestamp",
  /** A platform event timestamp, such as a forum post created_at. */
  "platform_event_timestamp",
  /** A repository event timestamp, such as a commit, release, or star event. */
  "repository_event",
  /** An archived snapshot with a capture date, such as a web archive record. */
  "archive_snapshot",
  /** A human checked and recorded the basis. Requires a note. */
  "manual_verified",
  /** Historical availability could not be established. Requires a null date. */
  "not_established",
]);
export type AvailabilityMethod = z.infer<typeof availabilityMethodSchema>;

export const AVAILABILITY_METHOD_LABEL: Record<AvailabilityMethod, string> = {
  intrinsic_timestamp: "Intrinsic publication timestamp",
  regulatory_filing_timestamp: "Regulatory filing timestamp",
  platform_event_timestamp: "Platform event timestamp",
  repository_event: "Repository event timestamp",
  archive_snapshot: "Archived snapshot",
  manual_verified: "Manually verified",
  not_established: "Not established",
};

/** Methods that constitute a defensible basis for a historical date. */
export const DEFENSIBLE_AVAILABILITY_METHODS: readonly AvailabilityMethod[] = [
  "intrinsic_timestamp",
  "regulatory_filing_timestamp",
  "platform_event_timestamp",
  "repository_event",
  "archive_snapshot",
  "manual_verified",
];

export function isDefensibleAvailabilityMethod(
  method: AvailabilityMethod,
): boolean {
  return DEFENSIBLE_AVAILABILITY_METHODS.includes(method);
}

export const availabilityEvidenceSchema = z
  .object({
    method: availabilityMethodSchema,
    /**
     * Where the establishing timestamp can be checked.
     *
     * For an archive_snapshot this is the archive URL, which is what makes the
     * snapshot verifiable rather than merely asserted.
     */
    sourceUrl: urlSchema.nullable().default(null),
    /** The identifier the establishing system uses, such as a filing accession. */
    sourceRecordId: z.string().min(1).max(300).nullable().default(null),
    /** Why this basis is defensible. Mandatory for manual_verified. */
    note: z.string().min(1).max(500).nullable().default(null),
  })
  .refine((e) => e.method !== "manual_verified" || e.note !== null, {
    // A human assertion with no stated basis is the weakest possible evidence
    // wearing the label of the strongest. The note is what makes it checkable.
    message:
      "manual_verified requires a note explaining why the date is defensible.",
    path: ["note"],
  });

export type AvailabilityEvidence = z.infer<typeof availabilityEvidenceSchema>;

/** The canonical evidence value for information whose history is unknown. */
export const NOT_ESTABLISHED: AvailabilityEvidence = {
  method: "not_established",
  sourceUrl: null,
  sourceRecordId: null,
  note: null,
};

/**
 * Check an availability date against its evidence.
 *
 * Returns null when consistent, or the problem when not. Exported separately
 * from the schema refinement so a research script can report the problem to a
 * review queue rather than throwing.
 */
export function availabilityProblem(
  availabilityDate: string | null,
  evidence: AvailabilityEvidence,
): string | null {
  if (availabilityDate === null) {
    if (evidence.method !== "not_established") {
      return `availabilityDate is null but the method is "${evidence.method}". A null date must be recorded as not_established.`;
    }
    return null;
  }
  if (evidence.method === "not_established") {
    return "availabilityDate is set but the method is not_established. A historical date requires a defensible basis.";
  }
  if (!isDefensibleAvailabilityMethod(evidence.method)) {
    return `availabilityDate is set but the method "${evidence.method}" is not a defensible basis.`;
  }
  return null;
}

/** Attach the consistency rule to any object carrying both fields. */
export function refineAvailability<
  T extends { availabilityDate: string | null; availabilityEvidence: AvailabilityEvidence },
>(value: T, ctx: z.RefinementCtx): void {
  const problem = availabilityProblem(value.availabilityDate, value.availabilityEvidence);
  if (problem !== null) {
    ctx.addIssue({ code: "custom", path: ["availabilityEvidence"], message: problem });
  }
}

/** A reference to an entity the evidence points at, for future adapters. */
export const availabilityRefSchema = z.object({
  sourceId: idSchema.nullable().default(null),
});
