import { z } from "zod";
import { confidenceLevelSchema } from "@/lib/provenance/classification";
import {
  availabilityEvidenceSchema,
  refineAvailability,
} from "./availability";
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  schemaVersionSchema,
  urlSchema,
} from "./common";

/**
 * SignalEvent: the canonical normalization target for every discovery source.
 *
 * Headline Radar, Builder Radar, Company Change Radar, and the X Sourcing
 * Engine all produce this shape and nothing else. Downstream code cannot tell
 * which source a signal came from except by reading sourceId, which is what
 * makes a source failure a missing row rather than a broken page.
 *
 * THE THREE-DATE MODEL
 *
 * Three separate dates answer three separate questions, and conflating any two
 * of them produces a wrong answer somewhere.
 *
 *   publicationDate  When the source says it published.
 *   availabilityDate The earliest point in time at which this exact
 *                    information is DEMONSTRATED to have been publicly
 *                    available. Null when that cannot be established.
 *   ingestedAt       When this pipeline actually read the record. Audit
 *                    metadata. Never participates in historical eligibility.
 *
 * An earlier model had a single observationDate meaning "when the pipeline saw
 * it", and used it in the backtest rule. That was wrong in a specific and
 * costly way: a press release publicly available in June 2024 and retrieved by
 * this pipeline in September 2026 would have been excluded from a December
 * 2024 backtest, even though any investor could have read it at the time. The
 * backtest asks what information was publicly available on a past date, not
 * whether this particular software happened to be running then.
 *
 * availabilityDate is what replaces it. It is evidence about the world, not
 * about us, and it must be demonstrated rather than assumed. Where historical
 * availability cannot be shown, it is null and the event is simply not
 * backtest eligible. It may still be perfectly good current screening data.
 * That is the intended consequence: the current screening set and the
 * backtest-eligible set are different subsets, and the second is smaller.
 *
 * Dates are calendar dates in UTC. A source timestamp with a time component is
 * normalised to its UTC date, because the cutoff comparison is date granular.
 * ingestedAt keeps its full timestamp, since it is an audit record.
 *
 * TWO ABSENT FIELDS
 *
 * There is no cutoffEligible field. Historical eligibility is derived at query
 * time by lib/backtest/cutoff.ts. A stored flag would go stale against a
 * changed cutoff and would reintroduce exactly the leak the rule prevents.
 *
 * There is no adjustedStrength field. Adjusted strength depends on the active
 * thesis configuration and on elapsed time, so it is recomputed rather than
 * stored. Only rawStrength, a property of the signal definition and the
 * observation itself, is persisted.
 */

/** The kind of event observed. Extended in config/signals.yaml. */
export const signalTypeSchema = z.enum([
  "customer_momentum",
  "enterprise_expansion",
  "executive_hire",
  "product_launch",
  "pricing_change",
  "geographic_expansion",
  "partnership",
  "funding",
  "technical_adoption",
  "hiring_acceleration",
  "founder_activity",
  "leadership_departure",
  "regulatory_milestone",
  "site_change",
  "media_coverage",
  /**
   * A confirmed security incident: a breach, unauthorized access, or a
   * disclosed vulnerability with customer exposure. Added in Phase 4B because
   * the Batch 2 corpus carries three of them and no existing signal represents
   * a negative security event honestly. Negative by direction; the resulting
   * enterprise-trust question is diligence, not a score.
   */
  "security_incident",
]);
export type SignalType = z.infer<typeof signalTypeSchema>;

/** What part of the business the signal bears on. */
export const signalCategorySchema = z.enum([
  "demand",
  "supply",
  "team",
  "capital",
  "product",
  "market",
  "risk",
]);
export type SignalCategory = z.infer<typeof signalCategorySchema>;

/** Which way the signal points for an investor. */
export const signalDirectionSchema = z.enum([
  "positive",
  "negative",
  "neutral",
  "ambiguous",
]);
export type SignalDirection = z.infer<typeof signalDirectionSchema>;

/**
 * How a company was matched to this event.
 *
 * The ladder is deterministic and ordered. A name-only match can never exceed
 * medium confidence, and unresolved is a first-class outcome rather than a
 * forced guess. Ported in spirit from the registry matching discipline in the
 * prior sourcing engine: exact or dot-boundary subdomain, never substring.
 */
export const entityMatchMethodSchema = z.enum([
  "exact",
  "domain",
  "alias",
  "handle",
  "fuzzy",
  "manual",
  "unresolved",
]);
export type EntityMatchMethod = z.infer<typeof entityMatchMethodSchema>;

/**
 * How a material conclusion is supported.
 *
 * This is the field that satisfies the auditability requirement. Every
 * investment interpretation carries one of these labels, so no reader has to
 * guess whether a sentence is a fact, a deduction, or a guess.
 */
export const interpretationBasisSchema = z.enum([
  "evidence",
  "inferred",
  "assumed",
  "estimated",
  "unknown",
]);
export type InterpretationBasis = z.infer<typeof interpretationBasisSchema>;

/**
 * Whether the event actually happened, or was only reported as possible.
 *
 * Added because the first real corpus contained a September 2026 report that a
 * company "was discussing a potential $350M financing" with terms explicitly
 * not final. Nothing in the schema could distinguish that from a closed round:
 * signal type, direction, and confidence all describe a completed event that
 * we are more or less sure about, not an event that may never occur.
 *
 * Recording it as completed would have created capital that does not exist.
 * Dropping it would have discarded real market information. The distinction is
 * orthogonal to every other field, so it gets its own, and it defaults to
 * completed so no existing record changes meaning.
 *
 * A later momentum engine must exclude reported_unconfirmed events, or weight
 * them separately. A test asserts the default is never silently applied to an
 * unconfirmed report.
 */
export const eventStatusSchema = z.enum([
  /** The event occurred. The default and the ordinary case. */
  "completed",
  /** Reported as possible or in progress, not confirmed to have occurred. */
  "reported_unconfirmed",
]);
export type EventStatus = z.infer<typeof eventStatusSchema>;

/** Whether a human has checked this event. */
export const humanVerificationSchema = z.enum([
  "unverified",
  "verified",
  "disputed",
  "rejected",
]);
export type HumanVerification = z.infer<typeof humanVerificationSchema>;

/**
 * The field set, before refinements.
 *
 * Exported so the ingestion boundary can derive a draft schema that omits
 * ingestedAt. Refinements cannot be omitted from, so the object and the
 * refined schema are kept as separate values rather than one chained
 * expression. Validate against signalEventSchema, not this.
 */
export const signalEventBaseSchema = z.object({
    id: idSchema,
    schemaVersion: schemaVersionSchema,

    /** Resolved company id, or null when entity resolution did not settle it. */
    companyId: idSchema.nullable(),
    /** The company name exactly as the source wrote it. Never normalized here. */
    companyNameRaw: z.string().min(1),
    entityMatchConfidence: z.number().min(0).max(1),
    entityMatchMethod: entityMatchMethodSchema,

    sourceId: idSchema,
    sourceUrl: urlSchema.nullable(),
    /** The source's own identifier, so re-ingestion is idempotent. */
    sourceRecordId: z.string().min(1).nullable().default(null),
    /** Reliability prior copied from the SourceRecord for scoring convenience. */
    sourceReliability: z.number().min(0).max(1),

    /**
     * The publication date stated by the original source.
     *
     * Nullable, and a null makes the event ineligible for any historical
     * cutoff. It is never defaulted to a date that would make it eligible.
     */
    publicationDate: isoDateSchema.nullable(),
    /**
     * The earliest point in time at which this exact information is
     * DEMONSTRATED to have been publicly available.
     *
     * Acceptable evidence is a timestamp intrinsic to the source: a dated
     * press release, a regulatory filing timestamp, a community post
     * created_at, a repository event timestamp, or an archived snapshot.
     *
     * Null when historical availability cannot be established. Never guessed,
     * and never copied from publicationDate as a convenience: a source that
     * merely asserts a date has not demonstrated one.
     */
    availabilityDate: isoDateSchema.nullable(),
    /**
     * How the availability date was established, and where to check it.
     *
     * A date with no explanation is indistinguishable from a guess. A non-null
     * availabilityDate must carry a defensible method; a null one must carry
     * not_established. Enforced below, so a historical date without provenance
     * cannot be written at all.
     */
    availabilityEvidence: availabilityEvidenceSchema,
    /**
     * When this pipeline actually ingested the record. Audit metadata.
     *
     * This does NOT determine historical eligibility. It exists so that a
     * record can be traced to the run that produced it, and so that a
     * backdating attempt is visible. It is stamped by the ingestion boundary
     * in lib/domain/ingest.ts and is never supplied by a source adapter.
     */
    ingestedAt: isoDateTimeSchema,
    /**
     * What the event itself describes, where that differs from publication.
     *
     * Deliberately NOT part of the cutoff rule. A round closed in January and
     * announced in April was not knowable in February: occurrence and
     * availability are different questions.
     */
    eventDate: isoDateSchema.nullable().default(null),

    signalType: signalTypeSchema,
    signalCategory: signalCategorySchema,
    signalDirection: signalDirectionSchema,
    /** Whether the event occurred, or was only reported as possible. */
    eventStatus: eventStatusSchema.default("completed"),
    /** Mandatory when the event is unconfirmed: what specifically is not settled. */
    unconfirmedNote: z.string().min(1).nullable().default(null),

    /**
     * Strength as the signal definition assigns it, before any adjustment.
     * Thesis relevance, recency decay, and reliability weighting are applied
     * at query time and are never persisted here.
     */
    rawStrength: z.number().min(0).max(1),

    /** A paraphrased factual statement of what was observed. */
    evidenceSummary: z.string().min(1),
    /** EvidenceClaim ids supporting this event. */
    evidenceIds: z.array(idSchema).default([]),
    claimConfidence: confidenceLevelSchema,

    humanVerified: humanVerificationSchema.default("unverified"),
    verifiedBy: z.string().min(1).nullable().default(null),
    verifiedAt: isoDateTimeSchema.nullable().default(null),

    contradicts: z.array(idSchema).default([]),
    contradictedBy: z.array(idSchema).default([]),

    /** The analyst reading of what this means, or null where there is none. */
    investmentInterpretation: z.string().min(1).nullable().default(null),
    interpretationBasis: interpretationBasisSchema.default("unknown"),
});

export const signalEventSchema = signalEventBaseSchema
  .refine(
    (e) => e.entityMatchMethod !== "unresolved" || e.companyId === null,
    {
      message: "An unresolved event must not carry a companyId.",
      path: ["companyId"],
    },
  )
  .refine(
    (e) => e.entityMatchMethod !== "fuzzy" || e.entityMatchConfidence <= 0.8,
    {
      message:
        "A fuzzy name match may not claim above 0.8 confidence. Use a domain or handle match to go higher.",
      path: ["entityMatchConfidence"],
    },
  )
  .refine(
    (e) =>
      e.investmentInterpretation === null || e.interpretationBasis !== "unknown",
    {
      message:
        "An investment interpretation must state its basis: evidence, inferred, assumed, or estimated.",
      path: ["interpretationBasis"],
    },
  )
  .refine(
    (e) =>
      e.availabilityDate === null ||
      e.ingestedAt.slice(0, 10) >= e.availabilityDate,
    {
      // Ingestion cannot precede public availability: you cannot read
      // something before it exists. A record claiming otherwise is either
      // mis-stamped or an attempt to backdate, and both are worth catching.
      message:
        "ingestedAt must fall on or after availabilityDate. Information cannot be ingested before it was publicly available.",
      path: ["ingestedAt"],
    },
  )
  .refine(
    (e) => e.eventStatus !== "reported_unconfirmed" || e.unconfirmedNote !== null,
    {
      message:
        "A reported_unconfirmed event must state what is not confirmed. An unexplained unconfirmed event is indistinguishable from a completed one.",
      path: ["unconfirmedNote"],
    },
  )
  .superRefine(refineAvailability);

/**
 * Enduring facts and where they belong.
 *
 * FACTS ENDURE. EVENTS DECAY.
 *
 * SignalEvent is an event stream. Every entry records something that happened
 * at a point in time, and every entry therefore loses information value as it
 * ages. An enduring fact is a different kind of thing: a founder's background,
 * a granted regulatory approval, a company's product category, and the
 * identity of a sitting executive are as true now as when first recorded.
 *
 * Putting an enduring fact into the event stream forces a choice between two
 * wrong answers: decay it, and the most durable evidence in the corpus fades
 * for no reason; exempt it from decay, and the event stream quietly becomes a
 * mixed store whose ageing rules vary per row.
 *
 * The resolution is that enduring facts are not signals. They live on the
 * objects they describe and feed Thesis Fit directly, while the corresponding
 * EVENT lives here and feeds momentum. The table below is the mapping, and
 * tests/config.test.ts asserts that no enduring fact appears as a signal id.
 */
export const ENDURING_FACT_HOMES = [
  {
    fact: "founder_background",
    description: "Founder domain history, prior companies, prior building record.",
    home: "Person.companyTenures, Person.priorCompanies, Person.education",
    correspondingEvent: "founder_activity",
  },
  {
    fact: "regulatory_approval_status",
    description: "A clearance, certification, or licence the company currently holds.",
    home: "EvidenceClaim with topic 'regulatory'",
    correspondingEvent: "regulatory_milestone",
  },
  {
    fact: "product_category",
    description: "What the company sells and which market it sells into.",
    home: "Company.sector, Company.subsector",
    correspondingEvent: "product_launch",
  },
  {
    fact: "executive_identity",
    description: "Who currently holds a role at the company.",
    home: "Person.currentRole, Person.companyTenures",
    correspondingEvent: "executive_hire",
  },
] as const;

/** Fact keys that must never be used as a signal id. */
export const ENDURING_FACT_KEYS: readonly string[] = ENDURING_FACT_HOMES.map(
  (entry) => entry.fact,
);

export type SignalEvent = z.infer<typeof signalEventSchema>;
