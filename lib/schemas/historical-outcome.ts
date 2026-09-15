import { z } from "zod";
import { idSchema, isoDateSchema, schemaVersionSchema } from "./common";

/**
 * HistoricalOutcome: what actually happened to a company, for the backtest.
 *
 * The isControl field is the field that separates a credible backtest from
 * recall theatre. A scorer that flags everyone recalls everything, so outcomes
 * are always evaluated against companies drawn from the same sources and the
 * same window that did not have the outcome. Without controls the headline
 * number is meaningless.
 *
 * blindedAlias supports measuring how much a reader's or a model's recognition
 * of a famous company is doing the work, by re-running the evaluation with
 * names redacted.
 *
 * Phase 2 defines the schema only. The Backtest Lab is a later phase.
 */

export const outcomeTypeSchema = z.enum([
  "raised",
  "acquired",
  "ipo",
  "shutdown",
  "flat",
  "unknown",
]);
export type OutcomeType = z.infer<typeof outcomeTypeSchema>;

export const historicalOutcomeSchema = z
  .object({
    companyId: idSchema,
    schemaVersion: schemaVersionSchema,

    outcomeType: outcomeTypeSchema,
    /** Null only where the outcome type is unknown or flat. */
    outcomeDate: isoDateSchema.nullable(),
    outcomeDetail: z.string().min(1).nullable().default(null),
    sourceIds: z.array(idSchema).default([]),

    /**
     * True for a company included specifically as a control: same sources,
     * same window, no positive outcome. The comparison group.
     */
    isControl: z.boolean(),
    /** Stable pseudonym used when the evaluation runs blinded. */
    blindedAlias: z.string().min(1).nullable().default(null),
  })
  .refine((o) => !o.isControl || o.outcomeType === "flat" || o.outcomeType === "unknown", {
    message:
      "A control company must not carry a positive outcome type. Controls are the comparison group.",
    path: ["outcomeType"],
  })
  .refine(
    (o) =>
      o.outcomeType === "unknown" || o.outcomeType === "flat" || o.outcomeDate !== null,
    {
      message: "A realised outcome must carry the date it occurred.",
      path: ["outcomeDate"],
    },
  );

export type HistoricalOutcome = z.infer<typeof historicalOutcomeSchema>;
