import { z } from "zod";

/**
 * The single provenance vocabulary for Digital Asset Venture Intelligence.
 *
 * Reconnaissance found three incompatible vocabularies across prior work: a
 * six-member ProvenanceClass, a six-member Provenance union, and a
 * NOT_DISCLOSED sentinel string. This module replaces all three. There is one
 * vocabulary and every material value in the system uses it.
 *
 * The top-level question a classification answers is "what kind of claim is
 * this", not "who said it". Attribution is a second, narrower question that
 * only applies once a value is known to be sourced, so it lives in
 * SourceSubtype rather than being mixed into the top level.
 */

/** What kind of claim a value is. The primary classification. */
export const provenanceKindSchema = z.enum([
  /** Taken from a source. Carries a SourceSubtype and at least one evidence id. */
  "sourced",
  /** Computed from other values by a named calculation. Never entered by hand. */
  "derived",
  /** Chosen by the analyst. Requires a stated basis and sensitivity testing. */
  "assumption",
  /** Bounded but not pinned. Carries low, high, and the basis for the bounds. */
  "estimated_range",
  /** Not established. The value stays null and is never backfilled. */
  "unknown",
]);
export type ProvenanceKind = z.infer<typeof provenanceKindSchema>;

/**
 * Who is vouching for a sourced value.
 *
 * A wire reproduction of a company announcement is the same voice repeated, so
 * it stays company_reported no matter how many outlets carry it. Independence
 * is a property of the source record, not of the repetition count.
 */
export const sourceSubtypeSchema = z.enum([
  /** A verifiable event of record: a filing, a registry entry, an announced round. */
  "reported_fact",
  /** Asserted by the company itself. Possibly accurate, and unaudited. */
  "company_reported",
  /** Estimated by a data vendor, journalist, or researcher outside the company. */
  "third_party_estimate",
]);
export type SourceSubtype = z.infer<typeof sourceSubtypeSchema>;

/**
 * Confidence in a value, independent of its kind.
 *
 * medium_high exists because real research grades at that level and collapsing
 * it into medium would discard a distinction the analyst actually made.
 */
export const confidenceLevelSchema = z.enum([
  "high",
  "medium_high",
  "medium",
  "low",
  "unknown",
]);
export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;

/** Whether a value may drive a calculation in the underwriting model. */
export const modelEligibilitySchema = z.enum([
  /** Eligible to drive a calculation. */
  "model_input",
  /** Informs judgement. Never a model input. */
  "context_only",
  /** A limitation that qualifies other values. */
  "caveat",
]);
export type ModelEligibility = z.infer<typeof modelEligibilitySchema>;

export const PROVENANCE_KIND_LABEL: Record<ProvenanceKind, string> = {
  sourced: "Sourced",
  derived: "Derived",
  assumption: "Assumption",
  estimated_range: "Estimated range",
  unknown: "Unknown",
};

/** Compact badge text. Rendered next to a value where space is tight. */
export const PROVENANCE_KIND_SHORT: Record<ProvenanceKind, string> = {
  sourced: "SRC",
  derived: "DRV",
  assumption: "ASM",
  estimated_range: "RNG",
  unknown: "UNK",
};

export const SOURCE_SUBTYPE_LABEL: Record<SourceSubtype, string> = {
  reported_fact: "Reported fact",
  company_reported: "Company reported",
  third_party_estimate: "Third party estimate",
};

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: "High",
  medium_high: "Medium-high",
  medium: "Medium",
  low: "Low",
  unknown: "Unknown",
};

export const MODEL_ELIGIBILITY_LABEL: Record<ModelEligibility, string> = {
  model_input: "Model input",
  context_only: "Context only",
  caveat: "Critical caveat",
};

/**
 * Kinds that may support a positive contribution to an investment score.
 *
 * An unknown value cannot raise a score, and an estimated range cannot either,
 * because a range is a statement that the value is not pinned. Both may still
 * lower a score or be displayed. Scoring engines in later phases must call
 * canSupportPositiveScore rather than testing the kind inline, so this rule
 * has one definition.
 */
const POSITIVE_SCORE_KINDS: readonly ProvenanceKind[] = [
  "sourced",
  "derived",
  "assumption",
];

export function canSupportPositiveScore(kind: ProvenanceKind): boolean {
  return POSITIVE_SCORE_KINDS.includes(kind);
}
