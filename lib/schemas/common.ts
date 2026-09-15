import { z } from "zod";

/**
 * Shared schema primitives.
 *
 * Every canonical object is built from these, so a rule such as the verbatim
 * excerpt cap has exactly one definition and cannot drift between objects.
 */

/**
 * The schema version every canonical record carries.
 *
 * Bumping it is how a later phase migrates committed generated data without
 * guessing at a record's shape. It is a plain integer rather than semver
 * because the only question a reader ever asks of it is "which shape is this".
 *
 * History:
 *   1  Initial shape. SignalEvent carried publicationDate and observationDate.
 *   2  SignalEvent replaced observationDate with availabilityDate (when the
 *      information is demonstrated to have been publicly available) and
 *      ingestedAt (audit metadata that never affects historical eligibility).
 *   3  SignalEvent gained availabilityEvidence, recording HOW the availability
 *      date was established. A historical date with no stated basis is no
 *      longer representable.
 *   4  First real research corpus exposed distinctions the schema could not
 *      hold. EvidenceClaim gained supportingSourceIds (89 of 133 real
 *      assessments cite more than one source), evidenceStatus,
 *      analystInterpretation and diligenceQuestion (so analyst judgement stays
 *      separate from sourced fact), and researchAssessmentId. SignalEvent
 *      gained eventStatus, so a reported but uncompleted financing cannot be
 *      recorded as a completed one. SourceType gained investor_industry.
 *      Company gained notes, so a researcher's diligence flag on a record
 *      (a metric to reconcile, a business-model boundary) survives into the
 *      generated corpus instead of being dropped at the pipeline boundary.
 *   5  Phase 3D evidence hardening exposed two more distinctions the schema
 *      could not hold. SourceRecord gained supportRole, recording what role a
 *      source plays for the company it supports (corroborating, contextual,
 *      customer or vendor evidence, a structured-secondary estimate, deal
 *      structure, historical context) as distinct from its source class, and
 *      SourceType gained customer_vendor for external customer and vendor case
 *      studies that corroborate operating reality without independently
 *      verifying a financial metric. Company gained operatingOriginYear, so a
 *      company whose current legal entity was incorporated after the founders
 *      began operating (Wispr Flow: 2021 project origin, 2023 Delaware entity)
 *      keeps both dates instead of one overwriting the other. EvidenceClaim
 *      gained hardeningRef, a deterministic pointer to the Phase 3D directive
 *      that split a compound assessment into atomic claims or derived a
 *      rounded capital figure, kept alongside researchAssessmentId.
 *   6  Batch 2 ingestion. SignalType gained security_incident, so a confirmed
 *      breach or disclosed vulnerability is representable as a negative event
 *      instead of being forced onto an unrelated signal. EvidenceClaim.sourceId
 *      became nullable: a pure analyst assumption with no source relationship
 *      supplied by the research packet now carries no source at all, rather than
 *      an arbitrary anchor picked to satisfy a NOT NULL. A sourced or derived
 *      claim still requires a source; a source-less claim may carry no
 *      supporting sources and no sourceUrl. A v5 consumer would reject both a
 *      security_incident event and a source-less claim, so the contract changed.
 */
export const SCHEMA_VERSION = 6;

export const schemaVersionSchema = z
  .number()
  .int()
  .positive()
  .describe("Canonical record shape version.");

/**
 * A stable identifier.
 *
 * Identity is never an index position. A record's id must survive reordering,
 * regeneration, and filtering, because ScoreSnapshot and the backtest both
 * refer to records by id across runs.
 */
export const idSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
    "An id must start alphanumeric and contain only letters, digits, dot, underscore, colon, or hyphen.",
  );

/** A calendar date with no time component, for example 2026-03-14. */
export const isoDateSchema = z.string().date();

/** A full timestamp, for example 2026-03-14T09:30:00.000Z. */
export const isoDateTimeSchema = z.iso.datetime();

/** An http or https URL. Other schemes are not citable evidence. */
export const urlSchema = z
  .url()
  .refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
    message: "A source URL must use http or https.",
  });

/**
 * The maximum length of any verbatim excerpt stored anywhere in the project.
 *
 * Source content is copyrighted by its publisher. This project stores a title,
 * a publisher, a date, a link, and a paraphrased factual summary. Where a short
 * verbatim quotation genuinely adds something a paraphrase cannot, it is capped
 * here. The cap is a schema rule, not a guideline, so an over-length excerpt
 * fails validation at build time rather than being noticed in review.
 *
 * Prefer the paraphrased summary. Use the excerpt field only when the exact
 * wording is the point.
 */
export const MAX_VERBATIM_EXCERPT_CHARS = 280;

export const verbatimExcerptSchema = z
  .string()
  .min(1)
  .max(
    MAX_VERBATIM_EXCERPT_CHARS,
    `A verbatim excerpt may not exceed ${MAX_VERBATIM_EXCERPT_CHARS} characters. Use a paraphrased factual summary instead.`,
  );

/**
 * A validated flexible property value.
 *
 * This is the extensibility mechanism that lets a private equity thesis carry
 * fields a venture thesis does not, without an unconstrained any type. The
 * union is deliberately narrow: scalars, dates, and string lists cover every
 * observed need, and anything richer should become a first-class field rather
 * than hiding inside a property bag.
 */
export const propertyValueSchema = z.union([
  z.object({ type: z.literal("string"), value: z.string() }),
  z.object({ type: z.literal("number"), value: z.number().finite() }),
  z.object({ type: z.literal("boolean"), value: z.boolean() }),
  z.object({ type: z.literal("date"), value: isoDateSchema }),
  z.object({ type: z.literal("string_list"), value: z.array(z.string()) }),
]);
export type PropertyValue = z.infer<typeof propertyValueSchema>;

/** A named bag of validated custom properties. */
export const propertiesSchema = z.record(idSchema, propertyValueSchema);
export type Properties = z.infer<typeof propertiesSchema>;
