import { z } from "zod";
import {
  confidenceLevelSchema,
  modelEligibilitySchema,
  sourceSubtypeSchema,
} from "./classification";

/**
 * Datum: the canonical container for a single researched value.
 *
 * Two properties are load bearing and both are enforced by the type system
 * rather than by convention.
 *
 * First, a value that is not established is null. It is never 0, never the
 * empty string, never "N/A", and never a sentinel phrase such as
 * "Not disclosed". Rendering may show the reader "Unknown" or "Not disclosed",
 * but the domain object stays null so no arithmetic can silently treat a gap
 * as a zero. Because this is a discriminated union under TypeScript strict
 * mode, reading .value on an arbitrary Datum yields T | null and the compiler
 * forces the caller to handle the null branch.
 *
 * Second, an estimated range has no scalar value at all. Its .value is the
 * literal null, and its bounds live in low and high. A midpoint may be carried
 * for display, but because it is not in the value position it can never be
 * picked up by code that reads .value and quietly become a fact. Converting a
 * range into a point estimate has to be a deliberate, visible act.
 */

const baseFields = {
  /** Confidence in this value, independent of its kind. */
  confidence: confidenceLevelSchema,
  /** Whether this value may drive a calculation. Defaults to context only. */
  modelEligibility: modelEligibilitySchema.default("context_only"),
  /** ISO date the underlying metric describes, not when it was published. */
  asOf: z.string().date().nullable().default(null),
  /** EvidenceClaim ids supporting this value. */
  evidenceIds: z.array(z.string().min(1)).default([]),
  /** Analyst note: scope, caveat, or why the value is unknown. */
  note: z.string().min(1).optional(),
};

/**
 * Build a Datum schema for a given value schema.
 *
 * The discriminant is `provenance`. Each arm carries exactly the extra fields
 * its kind requires, so an assumption without a basis, or a range without
 * bounds, fails validation rather than rendering as an unexplained number.
 */
export function datumSchema<TValue extends z.ZodType>(value: TValue) {
  return z.discriminatedUnion("provenance", [
    z.object({
      provenance: z.literal("sourced"),
      value: value,
      /** Who is vouching for it. Required: a sourced value has an author. */
      sourceSubtype: sourceSubtypeSchema,
      ...baseFields,
    }),
    z.object({
      provenance: z.literal("derived"),
      value: value,
      /**
       * Ids of the inputs this was computed from. Required and non-empty: a
       * derived value with no inputs is an assumption wearing a better name.
       */
      inputIds: z.array(z.string().min(1)).min(1),
      /** The named calculation that produced it, for example "arr / headcount". */
      derivationBasis: z.string().min(1),
      ...baseFields,
    }),
    z.object({
      provenance: z.literal("assumption"),
      value: value,
      /** Mandatory. An assumption without a stated reason is a fabrication. */
      assumptionBasis: z.string().min(1),
      /**
       * Whether the underwriting model must sensitivity test this input.
       * Defaults to true: opting out has to be deliberate and visible.
       */
      sensitivityRequired: z.boolean().default(true),
      ...baseFields,
    }),
    z.object({
      provenance: z.literal("estimated_range"),
      /**
       * Always null. The bounds are the value. Keeping the value position null
       * is what stops a midpoint being read as an established figure.
       */
      value: z.null(),
      low: value,
      high: value,
      /** Optional, for display only. Never an input to a calculation. */
      midpoint: value.optional(),
      /** Mandatory. How the bounds were arrived at. */
      basis: z.string().min(1),
      ...baseFields,
    }),
    z.object({
      provenance: z.literal("unknown"),
      /** Always null. Never backfilled, never defaulted, never coerced. */
      value: z.null(),
      ...baseFields,
    }),
  ]);
}

/** The Datum type for a value of type T, inferred from the schema factory. */
export type Datum<T> = z.infer<ReturnType<typeof datumSchema<z.ZodType<T>>>>;

/** A Datum whose value position holds an established, usable value. */
export type EstablishedDatum<T> = Extract<
  Datum<T>,
  { provenance: "sourced" | "derived" | "assumption" }
>;

/**
 * Whether this datum carries a usable scalar.
 *
 * False for unknown and for estimated_range. A range is deliberately not
 * "established": callers that want its bounds must ask for them by name.
 */
export function isEstablished<T>(
  datum: Datum<T> | null | undefined,
): datum is EstablishedDatum<T> {
  if (!datum) return false;
  return (
    datum.provenance === "sourced" ||
    datum.provenance === "derived" ||
    datum.provenance === "assumption"
  );
}

/**
 * The scalar value, or null.
 *
 * There is deliberately no numeric fallback parameter. A caller that wants a
 * default has to write it at the call site where a reader can see it, rather
 * than passing 0 into a helper and burying the substitution.
 */
export function datumValue<T>(datum: Datum<T> | null | undefined): T | null {
  if (!isEstablished(datum)) return null;
  return datum.value;
}

/** The bounds of an estimated range, or null for every other kind. */
export function datumRange<T>(
  datum: Datum<T> | null | undefined,
): { low: T; high: T; midpoint?: T } | null {
  if (!datum || datum.provenance !== "estimated_range") return null;
  const range = datum as Extract<Datum<T>, { provenance: "estimated_range" }>;
  return range.midpoint === undefined
    ? { low: range.low, high: range.high }
    : { low: range.low, high: range.high, midpoint: range.midpoint };
}

/**
 * The scalar value, or throw.
 *
 * For calculation paths that have already checked eligibility and want a loud
 * failure rather than a silent null propagating into a model output.
 */
export function requireDatumValue<T>(datum: Datum<T>, where: string): T {
  if (!isEstablished(datum)) {
    throw new Error(
      `${where}: value is not established (provenance "${datum.provenance}"). ` +
        "Unknown and estimated_range values must be handled explicitly, never coerced.",
    );
  }
  return datum.value;
}

/** Whether this datum is allowed to drive a model calculation. */
export function isModelInput<T>(datum: Datum<T> | null | undefined): boolean {
  return isEstablished(datum) && datum.modelEligibility === "model_input";
}
