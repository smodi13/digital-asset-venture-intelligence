import type { Datum } from "./datum";
import type {
  ConfidenceLevel,
  ModelEligibility,
  SourceSubtype,
} from "./classification";

/**
 * Constructors for each provenance kind.
 *
 * These exist so that building a Datum by hand, and forgetting a mandatory
 * basis or accidentally putting a number in the value position of a range, is
 * awkward rather than easy. Each constructor takes exactly the fields its kind
 * requires and fills the shared defaults.
 */

interface CommonOptions {
  confidence: ConfidenceLevel;
  modelEligibility?: ModelEligibility;
  asOf?: string | null;
  evidenceIds?: string[];
  note?: string;
}

function common(options: CommonOptions) {
  return {
    confidence: options.confidence,
    modelEligibility: options.modelEligibility ?? "context_only",
    asOf: options.asOf ?? null,
    evidenceIds: options.evidenceIds ?? [],
    ...(options.note ? { note: options.note } : {}),
  } as const;
}

/** A value taken from a source. Requires at least one evidence id. */
export function sourced<T>(
  value: T,
  options: CommonOptions & { sourceSubtype: SourceSubtype; evidenceIds: string[] },
): Datum<T> {
  return {
    provenance: "sourced",
    value,
    sourceSubtype: options.sourceSubtype,
    ...common(options),
  } as Datum<T>;
}

/** A value computed from other values by a named calculation. */
export function derived<T>(
  value: T,
  options: CommonOptions & { inputIds: string[]; derivationBasis: string },
): Datum<T> {
  return {
    provenance: "derived",
    value,
    inputIds: options.inputIds,
    derivationBasis: options.derivationBasis,
    ...common(options),
  } as Datum<T>;
}

/** An analyst choice. The basis is mandatory and sensitivity defaults to on. */
export function assumption<T>(
  value: T,
  options: CommonOptions & {
    assumptionBasis: string;
    sensitivityRequired?: boolean;
  },
): Datum<T> {
  return {
    provenance: "assumption",
    value,
    assumptionBasis: options.assumptionBasis,
    sensitivityRequired: options.sensitivityRequired ?? true,
    ...common(options),
  } as Datum<T>;
}

/**
 * A bounded estimate.
 *
 * Note that the value position is null by construction. The midpoint is
 * display only and cannot be reached through datumValue.
 */
export function estimatedRange<T>(
  bounds: { low: T; high: T; midpoint?: T; basis: string },
  options: CommonOptions,
): Datum<T> {
  return {
    provenance: "estimated_range",
    value: null,
    low: bounds.low,
    high: bounds.high,
    ...(bounds.midpoint === undefined ? {} : { midpoint: bounds.midpoint }),
    basis: bounds.basis,
    ...common(options),
  } as Datum<T>;
}

/**
 * A value that has not been established.
 *
 * The default confidence is "unknown" rather than "low", because a low
 * confidence value is one we hold weakly, and this is one we do not hold.
 */
export function unknown<T>(note?: string): Datum<T> {
  return {
    provenance: "unknown",
    value: null,
    confidence: "unknown",
    modelEligibility: "context_only",
    asOf: null,
    evidenceIds: [],
    ...(note ? { note } : {}),
  } as Datum<T>;
}
