import { z } from "zod";
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  schemaVersionSchema,
  urlSchema,
} from "./common";

/**
 * SourceRecord: the registry entry for a place evidence came from.
 *
 * The purpose of this object is to make independence decidable. Two
 * publications carrying the same company announcement are not two sources.
 * The fields that settle that question are sourceType, originatesFrom, and
 * isPressReleaseReproduction, and a later corroboration check reads all three
 * rather than counting URLs.
 */

/**
 * Source classes, ordered from most to least independent of the subject.
 *
 * analyst_inference is included so that a conclusion drawn inside this project
 * can be cited like anything else. It is not evidence: its reliability prior is
 * the floor and a later scoring engine must not treat it as corroboration.
 */
export const sourceTypeSchema = z.enum([
  "regulatory",
  "official_company",
  "founder_or_executive",
  "independent_journalism",
  "specialist_industry",
  "investor_industry",
  "structured_secondary",
  "customer_vendor",
  "identified_social",
  "community",
  "analyst_inference",
]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

/**
 * What role a source plays for the company it is cited against.
 *
 * Distinct from sourceType, which is the source class. The same class of
 * publication can corroborate a financing on one company and only provide
 * background colour on another, and Phase 3D research needs that distinction
 * recorded rather than inferred. Publisher independence is not claim
 * independence: a corroborating role means the source adds weight to a fact,
 * not that repetition has multiplied a company-origin metric into several.
 *
 *   primary_fact               a verifiable fact of record from this source
 *   direct_company_disclosure  the company or a named executive stating it
 *   legal_entity_disclosure    an official legal-entity fact (incorporation)
 *   corroborating              independent reporting that adds weight to a fact
 *   contextual                 background, interview colour; verifies no metric
 *   customer_vendor            a customer or vendor attesting to operating use
 *   third_party_estimate       an outside estimate (vendor or reporter)
 *   transaction_detail         independent detail on deal structure
 *   historical_context         establishes an earlier-period fact
 *   repeated_announcement      a re-run of a company announcement; no new weight
 */
export const sourceSupportRoleSchema = z.enum([
  "primary_fact",
  "direct_company_disclosure",
  "legal_entity_disclosure",
  "corroborating",
  "contextual",
  "customer_vendor",
  "third_party_estimate",
  "transaction_detail",
  "historical_context",
  "repeated_announcement",
]);
export type SourceSupportRole = z.infer<typeof sourceSupportRoleSchema>;

export const SOURCE_SUPPORT_ROLE_LABEL: Record<SourceSupportRole, string> = {
  primary_fact: "Primary fact",
  direct_company_disclosure: "Direct company disclosure",
  legal_entity_disclosure: "Legal-entity disclosure",
  corroborating: "Corroborating",
  contextual: "Contextual",
  customer_vendor: "Customer or vendor evidence",
  third_party_estimate: "Third-party estimate",
  transaction_detail: "Transaction detail",
  historical_context: "Historical context",
  repeated_announcement: "Repeated announcement",
};

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  regulatory: "Regulatory or government record",
  official_company: "Official company source",
  founder_or_executive: "Founder or executive statement",
  independent_journalism: "Independent journalism",
  specialist_industry: "Specialist industry publication",
  investor_industry: "Investor or fund publication",
  structured_secondary: "Structured secondary database",
  customer_vendor: "Customer or vendor case study",
  identified_social: "Identified social account",
  community: "Community or forum",
  analyst_inference: "Analyst inference",
};

/** Broad quality tier. Drives the reliability prior in sources.yaml. */
export const sourceTierSchema = z.enum(["a", "b", "c", "d"]);
export type SourceTier = z.infer<typeof sourceTierSchema>;

export const sourceRecordSchema = z.object({
  id: idSchema,
  schemaVersion: schemaVersionSchema,

  publisher: z.string().min(1),
  title: z.string().min(1),
  url: urlSchema.nullable(),

  sourceType: sourceTypeSchema,
  tier: sourceTierSchema,
  /** Reliability prior, 0 to 1. Seeded from sources.yaml by source class. */
  reliability: z.number().min(0).max(1),

  /** When this project last retrieved the source. */
  accessedAt: isoDateTimeSchema,
  /** When the source itself was published. Null where the source is undated. */
  publishedAt: isoDateSchema.nullable(),

  /**
   * True when this record reproduces a company announcement rather than
   * reporting independently. A reproduction never upgrades a claim to
   * independently verified, however many outlets carry it.
   */
  isPressReleaseReproduction: z.boolean().default(false),

  /**
   * The id of the source this one derives from, where known.
   *
   * Set on a wire copy pointing at the original release, or on an aggregator
   * pointing at the underlying report. Two records that resolve to the same
   * origin are one voice, and the corroboration check follows this chain.
   */
  originatesFrom: idSchema.nullable().default(null),

  /**
   * What role this source plays for the company it supports. Null for sources
   * carried over from before Phase 3D, where only the source class was
   * recorded. Set on every source added by the Phase 3D hardening pass.
   */
  supportRole: sourceSupportRoleSchema.nullable().default(null),

  /**
   * Access and reuse notes for this source, recorded per source rather than
   * assumed globally. Populated by a later phase.
   */
  termsNote: z.string().nullable().default(null),
});

export type SourceRecord = z.infer<typeof sourceRecordSchema>;
