import { z } from "zod";
import {
  confidenceLevelSchema,
  modelEligibilitySchema,
  provenanceKindSchema,
  sourceSubtypeSchema,
} from "@/lib/provenance/classification";
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  schemaVersionSchema,
  urlSchema,
  verbatimExcerptSchema,
} from "./common";

/**
 * EvidenceClaim: one checkable statement about one company, with its source.
 *
 * Evidence is structured, not a text blob. The claim, the value it asserts, the
 * parsed number where there is one, the unit, the date the metric describes,
 * and the date this analyst last confirmed it are separate fields, because
 * every one of them is separately queryable and separately falsifiable.
 *
 * Contradiction is first class. Two claims that disagree are both kept, both
 * linked, and both shown, because deleting the losing one destroys the record
 * of the disagreement.
 */

/**
 * How well supported a claim is, as the research assessed it.
 *
 * An evidence assessment, never a score. Explicitly permitted vocabulary:
 * research is allowed to say supported, mixed, or insufficient, and those
 * words are not converted into numbers anywhere.
 */
export const evidenceStatusSchema = z.enum(["supported", "mixed", "insufficient"]);
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;

export const evidenceClaimSchema = z.object({
  id: idSchema,
  schemaVersion: schemaVersionSchema,
  companyId: idSchema,

  /** The claim in plain language. */
  claim: z.string().min(1),
  /** The value as the source states it, in the source's own words. */
  statedValue: z.string().min(1).nullable().default(null),
  /** The parsed number, where the source gives one. */
  numericValue: z.number().finite().nullable().default(null),
  /** Unit for numericValue, for example "usd_millions" or "employees". */
  unit: z.string().min(1).nullable().default(null),

  /**
   * The primary source record, or null.
   *
   * Null only for a pure analyst claim (provenance assumption, estimated_range,
   * or unknown) where the research packet supplied no source relationship. An
   * arbitrary anchor picked to satisfy a NOT NULL would assert evidentiary
   * support that does not exist, which is exactly the confusion the provenance
   * system prevents. A sourced or derived claim always carries one; a null one
   * relies on analystInterpretation, diligenceQuestion, notes, and
   * researchAssessmentId instead. Enforced below.
   */
  sourceId: idSchema.nullable(),
  /**
   * Further sources supporting the same claim.
   *
   * Real research routinely establishes one claim from several places: 89 of
   * the first 133 real assessments cited more than one source. A single
   * sourceId would have silently discarded the rest, understating
   * corroboration and making the independence count wrong in the direction
   * that flatters the corpus.
   *
   * sourceId remains the primary citation. Independence counting reads both.
   */
  supportingSourceIds: z.array(idSchema).default([]),
  sourceUrl: urlSchema.nullable(),

  /** When the source published. */
  publicationDate: isoDateSchema.nullable(),
  /** The date the metric itself describes, which is often earlier. */
  metricAsOfDate: isoDateSchema.nullable().default(null),
  /** When this analyst last confirmed the claim still reads this way. */
  lastVerified: isoDateTimeSchema.nullable().default(null),

  /** How this claim came to exist. Uses the single project vocabulary. */
  provenance: provenanceKindSchema,
  /** Who is vouching, where the claim is sourced. */
  sourceSubtype: sourceSubtypeSchema.nullable().default(null),
  confidence: confidenceLevelSchema,
  modelEligibility: modelEligibilitySchema.default("context_only"),

  /** Research topic, free form so the corpus keeps its own vocabulary. */
  topic: z.string().min(1),
  notes: z.string().min(1).nullable().default(null),

  /**
   * How well the research considered this claim supported.
   *
   * An evidence assessment, not a score. "insufficient" is a finding in its
   * own right: it records that the public record does not settle the question,
   * which is different from the question not having been asked.
   */
  evidenceStatus: evidenceStatusSchema.nullable().default(null),

  /**
   * The analyst reading of what the sourced fact means.
   *
   * Deliberately a separate field from `claim`. Merging the two would present
   * judgement as evidence, which is the single most common way a research
   * corpus becomes untrustworthy. Nothing here is sourced, and a later scoring
   * engine must not treat it as corroboration.
   */
  analystInterpretation: z.string().min(1).nullable().default(null),

  /** What must be established before this claim can support underwriting. */
  diligenceQuestion: z.string().min(1).nullable().default(null),

  /**
   * The research assessment this claim was derived from.
   *
   * One assessment may yield several atomic claims. This preserves the link
   * back, so a reader can see the original research unit.
   */
  researchAssessmentId: z.string().min(1).nullable().default(null),

  /**
   * A deterministic reference to the Phase 3D hardening directive that produced
   * this claim, where one did. Format: "p3d-split-<company>-<assessment>" for an
   * atomic-split proposition, "p3d-derive-<company>-<subject>" for a derived
   * capital figure, "p3d-issue-<company>-<subject>" for a claim added to resolve
   * one of the 15 research issues. Null for every claim untouched by the
   * hardening pass. Sits alongside researchAssessmentId, which still points at
   * the original research unit where there was one.
   */
  hardeningRef: z.string().min(1).nullable().default(null),

  /**
   * A short verbatim quotation, only where the exact wording is the point.
   * Capped by schema. Prefer the paraphrased claim field above.
   */
  verbatimExcerpt: verbatimExcerptSchema.nullable().default(null),

  /** Ids of claims this one contradicts. Symmetry is asserted by test. */
  contradicts: z.array(idSchema).default([]),
  contradictedBy: z.array(idSchema).default([]),
  /** Why the contradiction exists, where the analyst has determined it. */
  contradictionNote: z.string().min(1).nullable().default(null),
})
  .refine(
    (c) => c.provenance !== "sourced" || c.sourceSubtype !== null,
    { message: "A sourced claim must state who is vouching for it.", path: ["sourceSubtype"] },
  )
  .refine(
    (c) => (c.provenance !== "sourced" && c.provenance !== "derived") || c.sourceId !== null,
    { message: "A sourced or derived claim must cite a source.", path: ["sourceId"] },
  )
  .refine(
    (c) => c.sourceId !== null || (c.supportingSourceIds.length === 0 && c.sourceUrl === null),
    {
      message:
        "A source-less claim cannot carry supporting sources or a sourceUrl. Its basis is the analyst interpretation, not evidence.",
      path: ["supportingSourceIds"],
    },
  );

export type EvidenceClaim = z.infer<typeof evidenceClaimSchema>;
