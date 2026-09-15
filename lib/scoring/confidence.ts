import {
  RELIABILITY_CLASS,
  DERIVED_CONFIDENCE_FACTOR,
  CONTRADICTION_FACTOR,
  DEFAULT_FRESHNESS_BANDS,
  type ReliabilityClass,
  type ContradictionSeverity,
  type FreshnessBand,
} from "./config";

/**
 * Confidence: trust in the relevant factual evidence.
 *
 * Publication count never creates confidence. Evidence sharing one underlying
 * origin is collapsed before aggregation, so a company KPI repeated by five
 * outlets stays one company-origin KPI.
 */

export interface EvidenceItem {
  /** Stable key for the underlying origin. Repeats collapse to one group. */
  originKey: string;
  reliabilityClass: ReliabilityClass;
  /** Optional per-item quality; defaults to the class base. */
  quality?: number;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** The strongest reliability cap present across a set of evidence classes. */
function combinedCap(classes: readonly ReliabilityClass[]): number {
  return classes.reduce((max, c) => Math.max(max, RELIABILITY_CLASS[c].cap), 0);
}

/**
 * Collapse evidence to one quality per underlying origin, then combine the
 * genuinely independent origin groups with 1 - product(1 - qi), then apply the
 * strongest reliability-class cap present.
 */
export function aggregateConfidence(evidence: readonly EvidenceItem[]): number {
  if (evidence.length === 0) return 0;

  const byOrigin = new Map<string, number>();
  for (const item of evidence) {
    const q = clamp01(item.quality ?? RELIABILITY_CLASS[item.reliabilityClass].base);
    // One origin contributes its single strongest quality, never a sum.
    byOrigin.set(item.originKey, Math.max(byOrigin.get(item.originKey) ?? 0, q));
  }

  const qualities = [...byOrigin.values()];
  const combined = 1 - qualities.reduce((p, q) => p * (1 - q), 1);
  const cap = combinedCap(evidence.map((e) => e.reliabilityClass));
  return Math.min(combined, cap);
}

/**
 * A deterministic derived claim is never more confident than its weakest
 * input, and is discounted below it.
 */
export function derivedConfidence(inputConfidences: readonly number[]): number {
  if (inputConfidences.length === 0) return 0;
  return DERIVED_CONFIDENCE_FACTOR * Math.min(...inputConfidences);
}

/** Apply the unresolved factual-contradiction factor. */
export function applyContradiction(confidence: number, severity: ContradictionSeverity): number {
  return confidence * CONTRADICTION_FACTOR[severity];
}

/**
 * Freshness factor for time-sensitive current-state evidence only. Enduring
 * facts do not decay and must not be passed through this.
 */
export function freshnessFactor(
  ageDays: number,
  bands: readonly FreshnessBand[] = DEFAULT_FRESHNESS_BANDS,
): number {
  for (const band of bands) {
    if (ageDays <= band.maxAgeDays) return band.factor;
  }
  return bands[bands.length - 1]?.factor ?? 1;
}

/* -------------------------------------------------------------------------- */
/* Confidence source of truth                                                 */
/*                                                                            */
/* An analyst may choose a rubric anchor. An analyst may NOT choose evidence  */
/* confidence. The scalar that scaling math consumes is derived here, only    */
/* from cited evidence: reliability class base/cap, underlying-origin dedup,   */
/* derived-claim ceiling, contradiction severity, and freshness when          */
/* currentness matters. There is no free confidence input on any public       */
/* scoring API: a caller can only describe evidence, never assert a number.    */
/* -------------------------------------------------------------------------- */

export interface CitedEvidence {
  /** Canonical EvidenceClaim id, for provenance. */
  claimId: string;
  /** Stable key for the underlying origin. Repeats collapse to one group. */
  originKey: string;
  reliabilityClass: ReliabilityClass;
  /** Optional per-item quality; defaults to the class base, clamped to class cap. */
  quality?: number;
  /** Set when this claim is a deterministic derivation over other cited claims. */
  derivedFromConfidences?: readonly number[];
  /** Age of the observation; only used when currentnessMatters. */
  ageDays?: number;
}

export interface ConfidenceResolutionInput {
  evidence: readonly CitedEvidence[];
  /** Unresolved factual contradiction across the cited evidence. */
  contradiction?: ContradictionSeverity;
  /** True when the criterion depends on current state, so staleness lowers trust. */
  currentnessMatters?: boolean;
  freshnessBands?: readonly FreshnessBand[];
}

export interface ComputedCriterionEvidence {
  confidence: number;
  claimIds: string[];
  reliabilityCap: number;
  originGroupCount: number;
  contradictionFactor: number;
  freshnessFactor: number;
}

/**
 * Deterministically resolve the confidence scalar and its provenance from the
 * cited evidence. This is the only sanctioned producer of scoring confidence.
 */
export function resolveConfidence(input: ConfidenceResolutionInput): ComputedCriterionEvidence {
  const severity: ContradictionSeverity = input.contradiction ?? "none";
  const contradiction = CONTRADICTION_FACTOR[severity];

  const items: EvidenceItem[] = input.evidence.map((e) => {
    const base = e.quality ?? RELIABILITY_CLASS[e.reliabilityClass].base;
    const ceilinged =
      e.derivedFromConfidences && e.derivedFromConfidences.length > 0
        ? Math.min(base, derivedConfidence(e.derivedFromConfidences))
        : base;
    return { originKey: e.originKey, reliabilityClass: e.reliabilityClass, quality: ceilinged };
  });

  const originGroupCount = new Set(items.map((i) => i.originKey)).size;

  let freshness = 1;
  if (input.currentnessMatters) {
    const ages = input.evidence.map((e) => e.ageDays).filter((a): a is number => a !== undefined);
    // The stalest cited observation governs; freshness can only lower confidence.
    for (const age of ages) freshness = Math.min(freshness, freshnessFactor(age, input.freshnessBands));
  }

  const aggregate = aggregateConfidence(items);
  const confidence = clamp01(aggregate * contradiction * freshness);

  return {
    confidence,
    claimIds: input.evidence.map((e) => e.claimId),
    reliabilityCap: combinedCap(items.map((i) => i.reliabilityClass)),
    originGroupCount,
    contradictionFactor: contradiction,
    freshnessFactor: freshness,
  };
}
