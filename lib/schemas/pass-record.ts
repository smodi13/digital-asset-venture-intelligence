import { z } from "zod";
import { signalTypeSchema } from "./signal-event";
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  schemaVersionSchema,
} from "./common";

/**
 * PassRecord: why a company was set aside, and what would bring it back.
 *
 * The revisitTrigger field is the point of this object. A pass file that only
 * records rejections is a graveyard. A pass file that names the specific future
 * signal which would invalidate the reason for passing is an active sourcing
 * instrument: when that signal arrives, the company resurfaces on its own.
 */

/**
 * Why a company was passed on.
 *
 * Controlled so that pass reasons are countable across the portfolio, with an
 * "other" escape hatch that requires a note. Extending this list is a schema
 * change on purpose, because a silently growing free-text reason field would
 * make the pass file unanalysable within a quarter.
 */
export const passReasonSchema = z.enum([
  "valuation",
  "stage",
  "sector",
  "geography",
  "team",
  "market",
  "competition",
  "capital_intensity",
  "disclosure",
  "timing",
  "business_model",
  "ownership",
  "other",
]);
export type PassReason = z.infer<typeof passReasonSchema>;

export const PASS_REASON_LABEL: Record<PassReason, string> = {
  valuation: "Valuation",
  stage: "Stage fit",
  sector: "Sector fit",
  geography: "Geography",
  team: "Team",
  market: "Market quality",
  competition: "Competitive position",
  capital_intensity: "Capital intensity",
  disclosure: "Insufficient disclosure",
  timing: "Timing",
  business_model: "Business model",
  ownership: "Ownership or structure",
  other: "Other",
};

export const passRecordSchema = z
  .object({
    companyId: idSchema,
    schemaVersion: schemaVersionSchema,

    passedAt: isoDateTimeSchema,
    passReason: passReasonSchema,
    passNote: z.string().min(1).nullable().default(null),

    /**
     * The signal types that would justify reopening this pass.
     *
     * Linking a pass to a future signal type is what makes pass memory active.
     * A company passed on stage reopens on a funding signal; one passed on
     * disclosure reopens when new evidence arrives.
     */
    revisitTrigger: z.array(signalTypeSchema).default([]),
    /** A date after which the pass should be reconsidered regardless of signals. */
    revisitAfter: isoDateSchema.nullable().default(null),

    passedBy: z.string().min(1).nullable().default(null),
  })
  .refine((p) => p.passReason !== "other" || p.passNote !== null, {
    message: 'A pass reason of "other" requires a note explaining it.',
    path: ["passNote"],
  });

export type PassRecord = z.infer<typeof passRecordSchema>;
