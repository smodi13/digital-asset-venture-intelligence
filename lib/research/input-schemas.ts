import { z } from "zod";
import { availabilityEvidenceSchema } from "@/lib/schemas/availability";
import { confidenceLevelSchema, modelEligibilitySchema, provenanceKindSchema, sourceSubtypeSchema } from "@/lib/provenance/classification";
import { sourceTypeSchema, sourceSupportRoleSchema } from "@/lib/schemas/source-record";
import { evidenceStatusSchema } from "@/lib/schemas/evidence-claim";
import { eventStatusSchema } from "@/lib/schemas/signal-event";
import { stageSchema } from "@/lib/schemas/company";
import {
  signalTypeSchema,
  signalCategorySchema,
  signalDirectionSchema,
  interpretationBasisSchema,
  humanVerificationSchema,
} from "@/lib/schemas/signal-event";
import { isoDateSchema, isoDateTimeSchema, urlSchema, verbatimExcerptSchema } from "@/lib/schemas/common";

/**
 * Research input schemas.
 *
 * These describe what a HUMAN writes in research/input/*.yaml. They are
 * deliberately not the canonical schemas: a researcher should write a company
 * name and a URL, not a Datum discriminated union or a precomputed hash.
 *
 * The separation is the point. research/input is hand authored, reviewed, and
 * diffed in Git. data/generated is produced from it by npm run research and is
 * never edited by hand. Mixing the two would make it impossible to tell which
 * numbers a human wrote and which the pipeline derived, which is exactly the
 * distinction the provenance system exists to preserve.
 *
 * Everything here is validated. A malformed research file fails the run rather
 * than producing a corpus that is quietly missing rows.
 */

/* -------------------------------------------------------------------------- */
/* Company input                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Where a company sits in the RESEARCH workflow.
 *
 * Distinct from PipelineRecord.stage, which is the investment workflow. This
 * field answers "has a human checked this record", not "are we interested".
 * Only approved companies enter the corpus.
 */
export const researchStatusSchema = z.enum([
  "seeded",
  "in_research",
  "reviewed",
  "approved",
  "excluded",
]);
export type ResearchStatus = z.infer<typeof researchStatusSchema>;

/** Statuses whose companies are written into the generated corpus. */
export const CORPUS_RESEARCH_STATUSES: readonly ResearchStatus[] = ["approved"];

export const companyInputSchema = z.object({
  name: z.string().min(1),
  /** The registrable domain. The strongest identity a private company has. */
  domain: z.string().min(1).nullable().default(null),
  aliases: z.array(z.string().min(1)).default([]),

  sector: z.string().min(1),
  subsector: z.string().min(1).nullable().default(null),
  stage: stageSchema.default("unknown"),
  headquarters: z.string().min(1).nullable().default(null),
  /** Null when not publicly disclosed. Never guessed. */
  foundingYear: z.number().int().min(1800).max(2100).nullable().default(null),
  /**
   * The year the founders began operating, where that predates the current
   * legal entity. Set only when a source establishes both dates and they
   * differ (Wispr Flow: 2021 project origin, 2023 Delaware entity).
   */
  operatingOriginYear: z.number().int().min(1800).max(2100).nullable().default(null),

  founders: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.string().min(1).nullable().default(null),
        priorCompanies: z.array(z.string().min(1)).default([]),
        github: z.string().min(1).nullable().default(null),
        linkedin: z.string().min(1).nullable().default(null),
      }),
    )
    .default([]),

  knownInvestors: z.array(z.string().min(1)).default([]),

  description: z.string().min(1),
  /** Why this company entered the research universe at all. */
  reasonSourced: z.string().min(1),

  researchStatus: researchStatusSchema.default("seeded"),
  /** Every URL a researcher used. Becomes SourceRecords. */
  sourceUrls: z.array(urlSchema).default([]),
  /** Set false only when a company is known to have listed or been acquired. */
  isPrivate: z.boolean().default(true),
  /** When this company first entered the research universe. */
  firstObservedAt: isoDateSchema,
  notes: z.string().min(1).nullable().default(null),
});
export type CompanyInput = z.infer<typeof companyInputSchema>;

export const companiesFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  companies: z.array(companyInputSchema),
});

/* -------------------------------------------------------------------------- */
/* Source input                                                               */
/* -------------------------------------------------------------------------- */

export const sourceInputSchema = z.object({
  url: urlSchema,
  publisher: z.string().min(1),
  title: z.string().min(1),
  sourceType: sourceTypeSchema,
  publishedAt: isoDateSchema.nullable().default(null),
  /** True when this reproduces a company announcement rather than reporting. */
  isPressReleaseReproduction: z.boolean().default(false),
  /**
   * The URL of the source this one derives from, where known.
   *
   * Set on a wire copy pointing at the original release. Two records that
   * resolve to the same origin are one voice, and the independence check
   * follows this chain.
   */
  originatesFromUrl: urlSchema.nullable().default(null),
  /**
   * What role this source plays for its company: corroborating an existing
   * fact, adding only context, customer or vendor operating evidence, a
   * structured-secondary estimate, deal structure, or historical context.
   * Distinct from sourceType. Null for sources predating the Phase 3D pass.
   */
  supportRole: sourceSupportRoleSchema.nullable().default(null),
  termsNote: z.string().min(1).nullable().default(null),
});
export type SourceInput = z.infer<typeof sourceInputSchema>;

export const sourcesFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  sources: z.array(sourceInputSchema),
});

/* -------------------------------------------------------------------------- */
/* Evidence input                                                             */
/* -------------------------------------------------------------------------- */

export const evidenceInputSchema = z
  .object({
    /** Company name, domain, or canonical id. The resolver works it out. */
    company: z.string().min(1),
    claim: z.string().min(1),
    /** The value as the source states it. Null where the claim is qualitative. */
    value: z.string().min(1).nullable().default(null),
    numericValue: z.number().finite().nullable().default(null),
    unit: z.string().min(1).nullable().default(null),

    /**
     * The source URL. Must appear in sources.yaml when set.
     *
     * Null only for a pure analyst claim (assumption / estimated_range /
     * unknown) with no source relationship. Never null for a sourced or
     * derived claim.
     */
    source: urlSchema.nullable().default(null),
    /** Further source URLs supporting the same claim. All must appear in sources.yaml. */
    supportingSources: z.array(urlSchema).default([]),
    publicationDate: isoDateSchema.nullable().default(null),
    metricAsOfDate: isoDateSchema.nullable().default(null),
    lastVerified: isoDateSchema.nullable().default(null),

    provenance: provenanceKindSchema.default("sourced"),
    sourceSubtype: sourceSubtypeSchema.nullable().default(null),
    confidence: confidenceLevelSchema,
    modelEligibility: modelEligibilitySchema.default("context_only"),

    topic: z.string().min(1),
    notes: z.string().min(1).nullable().default(null),
    /** Only where the exact wording is the point. Capped at 280 characters. */
    excerpt: verbatimExcerptSchema.nullable().default(null),
    /** Claims this one contradicts, by claim text of the other record. */
    contradictsClaims: z.array(z.string().min(1)).default([]),
    /** How well supported the research considered this claim. */
    evidenceStatus: evidenceStatusSchema.nullable().default(null),
    /** Analyst reading. Kept separate from the sourced fact, never merged into it. */
    analystInterpretation: z.string().min(1).nullable().default(null),
    /** What must be established before this can support underwriting. */
    diligenceQuestion: z.string().min(1).nullable().default(null),
    /** The originating research assessment, for traceability. */
    researchAssessmentId: z.string().min(1).nullable().default(null),
    /** Deterministic reference to the Phase 3D hardening directive, where one applies. */
    hardeningRef: z.string().min(1).nullable().default(null),
  })
  .refine((e) => e.provenance !== "sourced" || e.sourceSubtype !== null, {
    message: "A sourced claim must say who is vouching for it: sourceSubtype is required.",
    path: ["sourceSubtype"],
  })
  .refine(
    (e) => (e.provenance !== "sourced" && e.provenance !== "derived") || e.source !== null,
    { message: "A sourced or derived claim needs a source URL.", path: ["source"] },
  )
  .refine((e) => e.source !== null || e.supportingSources.length === 0, {
    message: "A source-less claim cannot carry supporting sources.",
    path: ["supportingSources"],
  });
export type EvidenceInput = z.infer<typeof evidenceInputSchema>;

export const evidenceFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  evidence: z.array(evidenceInputSchema),
});

/* -------------------------------------------------------------------------- */
/* Event input                                                                */
/* -------------------------------------------------------------------------- */

export const eventInputSchema = z.object({
  company: z.string().min(1),
  signalType: signalTypeSchema,
  category: signalCategorySchema,
  direction: signalDirectionSchema,

  publicationDate: isoDateSchema.nullable(),
  /** Null when historical availability could not be established. */
  availabilityDate: isoDateSchema.nullable(),
  /** How that date was established. Required, even when the date is null. */
  availabilityEvidence: availabilityEvidenceSchema,
  eventDate: isoDateSchema.nullable().default(null),

  source: urlSchema,
  evidenceSummary: z.string().min(1),
  confidence: confidenceLevelSchema,
  humanVerified: humanVerificationSchema.default("unverified"),
  verifiedBy: z.string().min(1).nullable().default(null),
  verifiedAt: isoDateTimeSchema.nullable().default(null),

  interpretation: z.string().min(1).nullable().default(null),
  interpretationBasis: interpretationBasisSchema.default("unknown"),
  /** Strength override. Defaults to the signal definition's baseStrength. */
  rawStrength: z.number().min(0).max(1).nullable().default(null),
  /** Whether the event occurred, or was only reported as possible. */
  eventStatus: eventStatusSchema.default("completed"),
  /** Required when unconfirmed: what specifically is not settled. */
  unconfirmedNote: z.string().min(1).nullable().default(null),
  /** Stable id from the originating research packet, for traceability. */
  researchEventId: z.string().min(1).nullable().default(null),
});
export type EventInput = z.infer<typeof eventInputSchema>;

export const eventsFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  events: z.array(eventInputSchema),
});

/* -------------------------------------------------------------------------- */
/* Headline input                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Headline Radar input.
 *
 * Deliberately thinner than eventInput: a researcher records the headline and
 * the source, and the deterministic matcher proposes the signal type. A
 * proposal below the acceptance threshold goes to the review queue rather than
 * into the corpus.
 */
export const headlineInputSchema = z.object({
  headline: z.string().min(1),
  publisher: z.string().min(1),
  url: urlSchema,
  publicationDate: isoDateSchema.nullable(),
  availabilityDate: isoDateSchema.nullable(),
  availabilityEvidence: availabilityEvidenceSchema,
  /** Company name, domain, or id. A hint, not an assertion. */
  companyHint: z.string().min(1).nullable().default(null),
  /** A paraphrased factual summary. Never the article body. */
  summary: z.string().min(1),
  sourceType: sourceTypeSchema.default("independent_journalism"),
  confidence: confidenceLevelSchema.default("medium"),
});
export type HeadlineInput = z.infer<typeof headlineInputSchema>;

export const headlinesFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  headlines: z.array(headlineInputSchema),
});
