import {
  CONVERGENCE_FAMILIES,
  CONVERGENCE_ACTIVE_THRESHOLD,
  CONVERGENCE_BREADTH_TARGET,
  DIMINISHING_WEIGHTS,
  type ConvergenceFamily,
} from "./config";

/**
 * Signal Convergence.
 *
 * Evidence is deduplicated by underlying origin before it counts, so three
 * publications repeating one origin are not three independent families.
 * Positive and negative convergence stay separately visible. One family cannot
 * produce high convergence; breadth is capped by count / target.
 */

export interface OriginContribution {
  originKey: string;
  /** Signed strength in [-1, 1] from this origin for this family. */
  value: number;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Collapse origins, take the strongest distinct contributions with the
 * deterministic diminishing weights, clamp to [-1, 1].
 */
export function convergenceFamilyStrength(contributions: readonly OriginContribution[]): number {
  const byOrigin = new Map<string, number>();
  for (const c of contributions) {
    const existing = byOrigin.get(c.originKey);
    if (existing === undefined || Math.abs(c.value) > Math.abs(existing)) {
      byOrigin.set(c.originKey, c.value);
    }
  }
  const ranked = [...byOrigin.values()].sort((a, b) => Math.abs(b) - Math.abs(a));
  let strength = 0;
  for (let i = 0; i < DIMINISHING_WEIGHTS.length && i < ranked.length; i += 1) {
    strength += DIMINISHING_WEIGHTS[i]! * ranked[i]!;
  }
  return clamp(strength, -1, 1);
}

/**
 * One atomic proposition (a single distinct fact) and the family it belongs
 * to. Breadth must reflect distinct propositions, not relabeling: the same
 * `propositionKey` submitted under two families does not activate two.
 */
export interface AtomicProposition {
  /** Stable id of the distinct fact. Repeats across families collapse to one. */
  propositionKey: string;
  /** Underlying origin, deduplicated within a family. */
  originKey: string;
  primaryFamily: ConvergenceFamily;
  /** Signed strength in [-1, 1]. */
  value: number;
}

/**
 * Raised when one propositionKey is supplied with conflicting primaryFamily
 * values. The analyst/evidence mapping is ambiguous and must be fixed upstream;
 * convergence is never computed from a guessed family.
 */
export class ConvergenceFamilyConflictError extends Error {
  constructor(
    readonly propositionKey: string,
    readonly families: readonly ConvergenceFamily[],
  ) {
    super(
      `propositionKey "${propositionKey}" mapped to conflicting convergence families: ${families.join(", ")}`,
    );
    this.name = "ConvergenceFamilyConflictError";
  }
}

/**
 * Assign each atomic proposition to exactly one primary family, then reduce to
 * per-family strengths. Two distinct propositions from the same publication may
 * legitimately land in two families; one proposition may not. Duplicate records
 * for one propositionKey must agree on primaryFamily and are deduplicated; a
 * conflicting mapping throws ConvergenceFamilyConflictError, deterministically
 * regardless of input order, before any convergence is calculated.
 */
export function familyStrengthsFromPropositions(
  propositions: readonly AtomicProposition[],
): Partial<Record<ConvergenceFamily, number>> {
  const primaryByProp = new Map<string, ConvergenceFamily>();
  for (const p of propositions) {
    const current = primaryByProp.get(p.propositionKey);
    if (current === undefined) {
      primaryByProp.set(p.propositionKey, p.primaryFamily);
    } else if (current !== p.primaryFamily) {
      const families = [current, p.primaryFamily].sort();
      throw new ConvergenceFamilyConflictError(p.propositionKey, families);
    }
  }

  // Within a family, collapse to one contribution per distinct proposition
  // (its strongest instance), so three publications of one fact stay one fact.
  const byFamily = new Map<ConvergenceFamily, Map<string, number>>();
  for (const p of propositions) {
    if (primaryByProp.get(p.propositionKey) !== p.primaryFamily) continue; // relabel, ignore
    const props = byFamily.get(p.primaryFamily) ?? new Map<string, number>();
    const existing = props.get(p.propositionKey);
    if (existing === undefined || Math.abs(p.value) > Math.abs(existing)) {
      props.set(p.propositionKey, p.value);
    }
    byFamily.set(p.primaryFamily, props);
  }

  const out: Partial<Record<ConvergenceFamily, number>> = {};
  for (const [family, props] of byFamily) {
    const contributions = [...props.entries()].map(([propositionKey, value]) => ({
      originKey: propositionKey,
      value,
    }));
    out[family] = convergenceFamilyStrength(contributions);
  }
  return out;
}

export interface ConvergenceResult {
  positiveConvergence: number;
  negativeConvergence: number;
  netConvergence: number;
  positiveActiveFamilies: ConvergenceFamily[];
  negativeActiveFamilies: ConvergenceFamily[];
}

export function scoreConvergence(
  familyStrengths: Partial<Record<ConvergenceFamily, number>>,
): ConvergenceResult {
  const positive: number[] = [];
  const negative: number[] = [];
  const positiveActiveFamilies: ConvergenceFamily[] = [];
  const negativeActiveFamilies: ConvergenceFamily[] = [];

  for (const family of CONVERGENCE_FAMILIES) {
    const strength = familyStrengths[family] ?? 0;
    if (Math.abs(strength) < CONVERGENCE_ACTIVE_THRESHOLD) continue;
    if (strength > 0) {
      positive.push(strength);
      positiveActiveFamilies.push(family);
    } else {
      negative.push(Math.abs(strength));
      negativeActiveFamilies.push(family);
    }
  }

  const converge = (active: number[]): number => {
    if (active.length === 0) return 0;
    const mean = active.reduce((a, b) => a + b, 0) / active.length;
    return 100 * mean * Math.min(1, active.length / CONVERGENCE_BREADTH_TARGET);
  };

  const positiveConvergence = converge(positive);
  const negativeConvergence = converge(negative);

  return {
    positiveConvergence,
    negativeConvergence,
    netConvergence: positiveConvergence - negativeConvergence,
    positiveActiveFamilies,
    negativeActiveFamilies,
  };
}
