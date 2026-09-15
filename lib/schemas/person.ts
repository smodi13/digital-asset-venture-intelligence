import { z } from "zod";
import { idSchema, isoDateSchema, schemaVersionSchema } from "./common";

/**
 * Person: a founder, executive, or other individual attached to a company.
 *
 * Tenures carry dates because the questions this object exists to answer are
 * temporal: who founded this, who joined last quarter, who left, and who
 * worked alongside whom. A tenure with no start date cannot answer any of them,
 * so the dates are nullable but never silently defaulted.
 *
 * This object holds professional identity drawn from public professional
 * sources. It is not a place for personal information, and the source policy
 * excludes raw social archives from the repository entirely.
 */

export const tenureSchema = z.object({
  companyId: idSchema.nullable(),
  /** Company name as stated, kept for tenures at companies outside the universe. */
  companyName: z.string().min(1),
  role: z.string().min(1),
  startDate: isoDateSchema.nullable(),
  /** Null means current, as far as the record knows. */
  endDate: isoDateSchema.nullable().default(null),
  isFounder: z.boolean().default(false),
  sourceIds: z.array(idSchema).default([]),
});
export type Tenure = z.infer<typeof tenureSchema>;

export const educationSchema = z.object({
  institution: z.string().min(1),
  field: z.string().min(1).nullable().default(null),
  completedYear: z.number().int().min(1800).max(2100).nullable().default(null),
});
export type Education = z.infer<typeof educationSchema>;

/** Public professional handles. Used for attribution, never for contact. */
export const publicHandlesSchema = z.object({
  github: z.string().min(1).nullable().default(null),
  x: z.string().min(1).nullable().default(null),
  linkedin: z.string().min(1).nullable().default(null),
  website: z.string().min(1).nullable().default(null),
});
export type PublicHandles = z.infer<typeof publicHandlesSchema>;

export const personSchema = z.object({
  id: idSchema,
  schemaVersion: schemaVersionSchema,

  name: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),

  currentRole: z.string().min(1).nullable(),
  /** Dated tenures. The basis for departure and hire signals, and for the graph. */
  companyTenures: z.array(tenureSchema).default([]),
  /** Employers outside the universe, kept as names for graph edges. */
  priorCompanies: z.array(z.string().min(1)).default([]),
  education: z.array(educationSchema).default([]),

  publicHandles: publicHandlesSchema,

  signalEventIds: z.array(idSchema).default([]),
  sourceIds: z.array(idSchema).default([]),
});

export type Person = z.infer<typeof personSchema>;
