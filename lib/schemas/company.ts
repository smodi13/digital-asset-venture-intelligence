import { z } from "zod";
import { datumSchema } from "@/lib/provenance/datum";
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  propertiesSchema,
  schemaVersionSchema,
} from "./common";

/**
 * Company: the subject of everything else.
 *
 * Every quantitative field that may be unavailable in public sources is a
 * Datum rather than a bare number, so a gap is null and visible instead of
 * zero and invisible. Name, sector, and stage stay plain because a company
 * with no known sector is not in the universe.
 *
 * The properties bag is the extensibility mechanism. A private equity thesis
 * can attach fields a venture thesis has no use for without either a schema
 * change or an unconstrained any type.
 */

export const stageSchema = z.enum([
  "pre_seed",
  "seed",
  "series_a",
  "series_b",
  "series_c",
  "series_d_plus",
  "growth",
  "bootstrapped",
  "unknown",
]);
export type Stage = z.infer<typeof stageSchema>;

export const roundSchema = z.object({
  stage: stageSchema,
  amountUsd: z.number().finite().nonnegative().nullable(),
  announcedDate: isoDateSchema.nullable(),
  leadInvestorIds: z.array(idSchema).default([]),
});
export type Round = z.infer<typeof roundSchema>;

export const companySchema = z.object({
  id: idSchema,
  schemaVersion: schemaVersionSchema,

  name: z.string().min(1),
  /** Alternate names and former names. Used by entity resolution, never for display. */
  aliases: z.array(z.string().min(1)).default([]),
  /** Registrable domain, lowercase, no scheme, no www. The strongest identity key. */
  domain: z.string().min(1).nullable(),

  foundedYear: datumSchema(z.number().int().min(1800).max(2100)),
  /**
   * The year the founders began operating the project, when that predates the
   * current legal entity's incorporation. Wispr Flow is the case this exists
   * for: the founders started Wispr AI in 2021 and incorporated the current
   * Delaware entity in 2023, and neither date should overwrite the other.
   * Null for every company where the two coincide or the distinction is not
   * established. The supporting evidence lives in EvidenceClaims and notes;
   * this field only keeps the earlier date from being lost.
   */
  operatingOriginYear: z.number().int().min(1800).max(2100).nullable().default(null),
  hqLocation: z.string().min(1).nullable(),
  sector: z.string().min(1),
  subsector: z.string().min(1).nullable().default(null),
  stage: stageSchema,

  employeeCount: datumSchema(z.number().int().nonnegative()),
  totalRaised: datumSchema(z.number().finite().nonnegative()),
  lastRound: datumSchema(roundSchema),

  investorIds: z.array(idSchema).default([]),
  founderIds: z.array(idSchema).default([]),

  description: z.string().min(1),
  sourceIds: z.array(idSchema).default([]),

  /**
   * Reviewer-facing research notes. Diligence flags a researcher raised about
   * this record: a metric to reconcile, a business-model boundary, a stale
   * estimate. Carried verbatim from research/input so it survives into the
   * generated corpus a reviewer reads. Never a scoring input.
   */
  notes: z.string().min(1).nullable().default(null),

  /** When this project first observed the company. Feeds the cutoff rule. */
  firstObservedAt: isoDateSchema,
  lastUpdatedAt: isoDateTimeSchema,

  /**
   * Whether the company is currently private.
   *
   * Held as a field rather than assumed, because private status has to be
   * re-verified: a company acquired since it entered the universe is no longer
   * a sourcing candidate and the record must be able to say so.
   */
  isPrivate: z.boolean(),

  /** Thesis-specific fields. Validated, never an unconstrained any. */
  properties: propertiesSchema.default({}),
});

export type Company = z.infer<typeof companySchema>;
