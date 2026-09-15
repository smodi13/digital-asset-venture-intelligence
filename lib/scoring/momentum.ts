import {
  MOMENTUM_FAMILY_WEIGHTS,
  IMPACT_ANCHOR,
  DIMINISHING_WEIGHTS,
  DEFAULT_MOMENTUM_HALF_LIFE_DAYS,
  type MomentumFamily,
  type ImpactAnchor,
} from "./config";

/**
 * Temporal Momentum.
 *
 * Positive and negative momentum stay separately visible; only a net value is
 * never all that is exposed. Funding alone contributes zero automatic positive
 * momentum: an ambiguous direction is 0, an uncompleted or non-primary
 * financing carries no completed-capital benefit, and a repeated identical
 * event cannot spam momentum (deduplicated by underlying-event key).
 */

export type EventDirection = 1 | 0 | -1;

export interface MomentumEvent {
  /** Underlying-event dedup key. Repeats collapse to their strongest instance. */
  eventKey: string;
  family: MomentumFamily;
  direction: EventDirection;
  impact: ImpactAnchor;
  evidenceConfidence: number;
  ageDays: number;
  halfLifeDays?: number;
}

export interface MomentumResult {
  positiveMomentum: number;
  negativeMomentum: number;
  netMomentum: number;
  familyScores: Record<MomentumFamily, number>;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function eventContribution(event: MomentumEvent): number {
  const halfLife = event.halfLifeDays ?? DEFAULT_MOMENTUM_HALF_LIFE_DAYS;
  const decay = Math.pow(2, -event.ageDays / halfLife);
  return event.direction * IMPACT_ANCHOR[event.impact] * event.evidenceConfidence * decay;
}

function familyScore(events: readonly MomentumEvent[]): number {
  // Collapse repeated underlying events to their strongest surviving instance.
  const byKey = new Map<string, number>();
  for (const event of events) {
    const c = eventContribution(event);
    const existing = byKey.get(event.eventKey);
    if (existing === undefined || Math.abs(c) > Math.abs(existing)) {
      byKey.set(event.eventKey, c);
    }
  }

  const ranked = [...byKey.values()].sort((a, b) => Math.abs(b) - Math.abs(a));
  let score = 0;
  for (let i = 0; i < DIMINISHING_WEIGHTS.length && i < ranked.length; i += 1) {
    score += DIMINISHING_WEIGHTS[i]! * ranked[i]!;
  }
  return clamp(score, -1, 1);
}

export function scoreMomentum(events: readonly MomentumEvent[]): MomentumResult {
  const families = Object.keys(MOMENTUM_FAMILY_WEIGHTS) as MomentumFamily[];
  const familyScores = {} as Record<MomentumFamily, number>;

  let positiveMomentum = 0;
  let negativeMomentum = 0;

  for (const family of families) {
    const score = familyScore(events.filter((e) => e.family === family));
    familyScores[family] = score;
    const weight = MOMENTUM_FAMILY_WEIGHTS[family];
    positiveMomentum += 100 * weight * Math.max(score, 0);
    negativeMomentum += 100 * weight * Math.max(-score, 0);
  }

  return {
    positiveMomentum,
    negativeMomentum,
    netMomentum: positiveMomentum - negativeMomentum,
    familyScores,
  };
}
