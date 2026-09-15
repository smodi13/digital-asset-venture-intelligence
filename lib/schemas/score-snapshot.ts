import { z } from "zod";
import { analyticalModeSchema } from "@/lib/scoring/mode";
import { thesisDimensionSchema } from "./thesis-configuration";
import { interpretationBasisSchema } from "./signal-event";
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  schemaVersionSchema,
} from "./common";

/**
 * ScoreSnapshot: one immutable record of one scoring run.
 *
 * A displayed score that cannot be traced to its inputs is an assertion. This
 * object makes every score traceable: it records the exact input event and
 * claim ids, a hash of that input set, the hash of the thesis configuration in
 * force, and the per-dimension contributions that produced the total.
 *
 * The same pure scoring function that produces a snapshot in the live
 * application produces one in the Backtest Lab, which is what makes the
 * backtest a measurement rather than a demonstration.
 *
 * Phase 2 defines the schema only. No scoring is implemented.
 */

/** How far inside the thesis a company sits. Caps what its score can reach. */
export const relevanceTierSchema = z.enum([
  "core",
  "adjacent",
  "peripheral",
  "marginal",
  "outside",
]);
export type RelevanceTier = z.infer<typeof relevanceTierSchema>;

export const fitComponentSchema = z.object({
  key: thesisDimensionSchema,
  /** The dimension rating on its own scale, before weighting. */
  rating: z.number().min(0).max(10),
  /** The weight this dimension carried, from the thesis configuration. */
  weight: z.number().min(0).max(1),
  /** rating multiplied by weight. Recomputed, never hand entered. */
  contribution: z.number().finite(),
  /** Whether the rating rests on evidence, inference, assumption, or nothing. */
  basis: interpretationBasisSchema,
  /** The evidence that supports this rating. Empty means the basis is not evidence. */
  evidenceIds: z.array(idSchema).default([]),
});
export type FitComponent = z.infer<typeof fitComponentSchema>;

export const scoreSnapshotSchema = z
  .object({
    companyId: idSchema,
    schemaVersion: schemaVersionSchema,

    /**
     * Which analytical framework produced this snapshot: "screening" (14
     * public-observable criteria) or "underwriting" (39-criterion diligence).
     * Required, with no default: a persisted score is never mode-ambiguous, and
     * a Screening result is never averaged with or substituted for an
     * Underwriting one. This is a scoring-domain type, independent of
     * schemaVersion, which versions the persisted research corpus.
     */
    analyticalMode: analyticalModeSchema,

    /** Hash of the thesis configuration in force when this was computed. */
    thesisConfigHash: z.string().min(1),
    computedAt: isoDateTimeSchema,
    /**
     * The date this score is "as of". In the live application this is today;
     * in the Backtest Lab it is the historical cutoff.
     */
    asOfDate: isoDateSchema,

    fitScore: z.number().min(0).max(100).nullable(),
    fitComponents: z.array(fitComponentSchema).default([]),

    momentumScore: z.number().min(0).max(100).nullable(),
    convergenceScore: z.number().min(0).max(100).nullable(),
    /**
     * Legacy / inactive fields, retained for schema and hash stability only.
     * `trustScore` corresponds to the Trust engine that does not exist (Coverage
     * and Confidence are never collapsed into one metric); `priorityScore` /
     * `priorityRank` correspond to Action Priority, which is not implemented as a
     * decision function (`PRIORITY_THRESHOLDS_ACTIVE` is `false`). No code writes
     * these; they are always null in practice. See docs/limitations.md and
     * docs/methodology.md section 12. Not removed in the Phase 6B reconciliation.
     */
    trustScore: z.number().min(0).max(100).nullable(),
    priorityScore: z.number().min(0).max(100).nullable(),
    priorityRank: z.number().int().positive().nullable(),

    relevanceTier: relevanceTierSchema,

    /** Exactly the events that fed this score. The audit trail. */
    inputSignalEventIds: z.array(idSchema).default([]),
    inputEvidenceClaimIds: z.array(idSchema).default([]),
    /** Stable hash over the input id sets. Proves which inputs produced this. */
    inputHash: z.string().min(1),
  })
  .refine(
    (s) =>
      s.fitScore === null ||
      s.fitComponents.length === thesisDimensionSchema.options.length,
    {
      message:
        "A fit score requires a component for every thesis dimension. A partial set yields no score, never a zero-coerced one.",
      path: ["fitComponents"],
    },
  );

export type ScoreSnapshot = z.infer<typeof scoreSnapshotSchema>;
