import { z } from "zod";
import { idSchema, isoDateTimeSchema, schemaVersionSchema } from "./common";

/**
 * OutreachDraft: a prepared message, never a sent one.
 *
 * There is deliberately no "sent" status and no send channel implementation.
 * Digital Asset Venture Intelligence prepares outreach and hands it to a person. It is not an
 * outbound sending system, and the type makes that a structural fact rather
 * than a policy someone could quietly change.
 *
 * citedEvidenceIds is required to be non-empty for anything past draft status,
 * because an outreach claim with no citation is exactly the kind of confident
 * unsupported assertion this project exists to avoid.
 */

export const outreachChannelSchema = z.enum([
  "email",
  "linkedin",
  "x",
  "warm_introduction",
  "conference",
  "other",
]);
export type OutreachChannel = z.infer<typeof outreachChannelSchema>;

/** No "sent" member. This system does not send. */
export const outreachStatusSchema = z.enum(["draft", "reviewed", "not_sent"]);
export type OutreachStatus = z.infer<typeof outreachStatusSchema>;

export const outreachDraftSchema = z
  .object({
    id: idSchema,
    schemaVersion: schemaVersionSchema,

    companyId: idSchema,
    personId: idSchema.nullable().default(null),

    draftedAt: isoDateTimeSchema,
    channel: outreachChannelSchema,
    subject: z.string().min(1).nullable().default(null),
    body: z.string().min(1),

    /** Every factual claim in the body traces to one of these. */
    citedEvidenceIds: z.array(idSchema).default([]),

    status: outreachStatusSchema.default("draft"),
    reviewedBy: z.string().min(1).nullable().default(null),
  })
  .refine((d) => d.status === "draft" || d.citedEvidenceIds.length > 0, {
    message:
      "A reviewed draft must cite at least one piece of evidence. An uncited claim in outreach is a credibility failure.",
    path: ["citedEvidenceIds"],
  })
  .refine((d) => d.status !== "reviewed" || d.reviewedBy !== null, {
    message: "A reviewed draft must record who reviewed it.",
    path: ["reviewedBy"],
  });

export type OutreachDraft = z.infer<typeof outreachDraftSchema>;
