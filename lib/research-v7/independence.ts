import type { SourceRecordV7 } from "@/lib/schemas/v7/source-record";

/**
 * v7 source independence and same-origin corroboration (Phase 3B-0, PARALLEL
 * / DORMANT).
 *
 * Simpler than lib/research/independence.ts because a v7 SourceRecord already
 * carries its own canCorroborate boolean (set by the packet author from the
 * DIGITAL_ASSET_SOURCE_PROFILES / v6 source-class priors), so no external
 * SourcesConfig lookup is needed here.
 *
 * TWO RECORDS ARE ONE VOICE WHEN they are the same record, share an
 * originatesFrom origin, or are both press-release reproductions. Number of
 * URLs is never confidence: two block explorers exposing one ledger fact, or
 * N dashboards sharing one upstream provider, collapse to one origin the
 * moment originatesFrom records that relationship.
 */

/** Follow originatesFrom to its ultimate origin. Cycle-safe: returns the last id reached rather than looping. */
export function originOf(sourceId: string, byId: ReadonlyMap<string, SourceRecordV7>): string {
  const seen = new Set<string>();
  let current = sourceId;
  for (;;) {
    if (seen.has(current)) return current;
    seen.add(current);
    const parent = byId.get(current)?.originatesFrom ?? null;
    if (!parent || parent === current) return current;
    current = parent;
  }
}

export interface IndependencePair {
  independent: boolean;
  reason: "same_source" | "shared_origin" | "both_reproductions" | "source_cannot_corroborate" | null;
}

export function areSourcesIndependent(
  aId: string,
  bId: string,
  byId: ReadonlyMap<string, SourceRecordV7>,
): IndependencePair {
  if (aId === bId) return { independent: false, reason: "same_source" };
  const a = byId.get(aId);
  const b = byId.get(bId);
  if (!a || !b) return { independent: false, reason: "source_cannot_corroborate" };
  if (!a.canCorroborate || !b.canCorroborate) return { independent: false, reason: "source_cannot_corroborate" };
  if (originOf(aId, byId) === originOf(bId, byId)) return { independent: false, reason: "shared_origin" };
  if (a.isPressReleaseReproduction && b.isPressReleaseReproduction) {
    return { independent: false, reason: "both_reproductions" };
  }
  return { independent: true, reason: null };
}

export interface IndependenceSummary {
  independentSourceCount: number;
  rawSourceCount: number;
  origins: string[];
}

/** The honest independent-voice count for a set of source ids: never the raw array length. */
export function countIndependentSources(
  sourceIds: readonly string[],
  byId: ReadonlyMap<string, SourceRecordV7>,
): IndependenceSummary {
  const origins = new Set<string>();
  const reproductionOrigins = new Set<string>();
  for (const id of [...new Set(sourceIds)].sort()) {
    const source = byId.get(id);
    if (!source || !source.canCorroborate) continue;
    const origin = originOf(id, byId);
    if (source.isPressReleaseReproduction) {
      if (reproductionOrigins.size > 0 && !reproductionOrigins.has(origin)) continue;
      reproductionOrigins.add(origin);
    }
    origins.add(origin);
  }
  return { independentSourceCount: origins.size, rawSourceCount: new Set(sourceIds).size, origins: [...origins].sort() };
}
