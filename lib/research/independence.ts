import type { SourceRecord } from "@/lib/schemas/source-record";
import type { EvidenceClaim } from "@/lib/schemas/evidence-claim";
import type { SourcesConfig } from "@/lib/config/schemas";

/**
 * Source independence.
 *
 * The question this answers: do two pieces of evidence constitute two
 * confirmations, or one confirmation counted twice?
 *
 * It matters because almost every scoring rule downstream will want to reward
 * corroboration, and the cheapest way to fake corroboration is a press release
 * carried by twenty outlets. Counting those as twenty sources rewards public
 * relations spend and calls it evidence. The negative specification in
 * config/scoring.yaml names this explicitly, and this module is where the rule
 * is actually enforced.
 *
 * TWO RECORDS ARE THE SAME VOICE WHEN
 *
 *   they are the same source record, or
 *   one derives from the other via originatesFrom, or
 *   they share an origin via originatesFrom, or
 *   both are reproductions of a company announcement about that company, or
 *   the source class cannot corroborate at all, per config/sources.yaml.
 *
 * The last of those is worth stating: a company's own site establishes what
 * the company says, which is often exactly what is wanted, and it never
 * independently confirms its own claim however many pages repeat it.
 */

export interface IndependenceContext {
  sourcesById: Map<string, SourceRecord>;
  config: SourcesConfig;
}

export function buildIndependenceContext(
  sources: readonly SourceRecord[],
  config: SourcesConfig,
): IndependenceContext {
  return {
    sourcesById: new Map(sources.map((source) => [source.id, source])),
    config,
  };
}

/** Whether a source class is permitted to corroborate at all. */
export function canCorroborate(
  source: SourceRecord,
  context: IndependenceContext,
): boolean {
  const cls = context.config.sourceClasses.find((c) => c.id === source.sourceType);
  return cls?.canCorroborate === true;
}

/**
 * Follow originatesFrom to the ultimate origin.
 *
 * Cycle safe: a malformed chain returns the last id reached rather than
 * looping. Research data is hand authored, so a cycle is a realistic mistake
 * and must not hang the build.
 */
export function originOf(sourceId: string, context: IndependenceContext): string {
  const seen = new Set<string>();
  let current = sourceId;
  for (;;) {
    if (seen.has(current)) return current;
    seen.add(current);
    const source = context.sourcesById.get(current);
    const parent = source?.originatesFrom ?? null;
    if (!parent || parent === current) return current;
    current = parent;
  }
}

export interface IndependencePair {
  independent: boolean;
  /** Why not, when not. Null when the two are genuinely independent. */
  reason:
    | "same_source"
    | "shared_origin"
    | "both_company_reproductions"
    | "source_cannot_corroborate"
    | null;
}

/** Whether two source records are independent voices. */
export function areSourcesIndependent(
  aId: string,
  bId: string,
  context: IndependenceContext,
): IndependencePair {
  if (aId === bId) return { independent: false, reason: "same_source" };

  const a = context.sourcesById.get(aId);
  const b = context.sourcesById.get(bId);
  if (!a || !b) {
    // An unknown source cannot be shown to be independent, so it is not
    // treated as such. Failing toward "not independent" understates
    // corroboration, which is the safe direction.
    return { independent: false, reason: "source_cannot_corroborate" };
  }

  if (!canCorroborate(a, context) || !canCorroborate(b, context)) {
    return { independent: false, reason: "source_cannot_corroborate" };
  }

  if (originOf(aId, context) === originOf(bId, context)) {
    return { independent: false, reason: "shared_origin" };
  }

  if (a.isPressReleaseReproduction && b.isPressReleaseReproduction) {
    // Two outlets both reprinting an announcement are one voice, even when the
    // originatesFrom chain was not recorded on either.
    return { independent: false, reason: "both_company_reproductions" };
  }

  return { independent: true, reason: null };
}

export interface IndependenceSummary {
  /** Distinct origins among corroborating sources. The honest source count. */
  independentSourceCount: number;
  /** How many source records were supplied, before collapsing. */
  rawSourceCount: number;
  /** The distinct origin ids, sorted. */
  origins: string[];
  /** Source ids excluded from the count, with the reason. */
  excluded: Array<{ sourceId: string; reason: string }>;
}

/**
 * Count independent voices across a set of source ids.
 *
 * This is the number a corroboration rule should use, not the array length.
 */
export function countIndependentSources(
  sourceIds: readonly string[],
  context: IndependenceContext,
): IndependenceSummary {
  const origins = new Set<string>();
  const excluded: Array<{ sourceId: string; reason: string }> = [];
  const reproductionOrigins = new Set<string>();

  for (const sourceId of [...new Set(sourceIds)].sort()) {
    const source = context.sourcesById.get(sourceId);
    if (!source) {
      excluded.push({ sourceId, reason: "unknown source record" });
      continue;
    }
    if (!canCorroborate(source, context)) {
      excluded.push({
        sourceId,
        reason: `source class "${source.sourceType}" cannot corroborate`,
      });
      continue;
    }
    const origin = originOf(sourceId, context);
    if (source.isPressReleaseReproduction) {
      // Every reproduction collapses into a single shared bucket, so ten
      // outlets carrying one announcement contribute one voice, not ten.
      if (reproductionOrigins.size > 0 && !reproductionOrigins.has(origin)) {
        excluded.push({ sourceId, reason: "press release reproduction" });
        continue;
      }
      reproductionOrigins.add(origin);
    }
    origins.add(origin);
  }

  return {
    independentSourceCount: origins.size,
    rawSourceCount: new Set(sourceIds).size,
    origins: [...origins].sort(),
    excluded,
  };
}

/** Whether two claims independently confirm each other. */
export function areClaimsIndependent(
  a: Pick<EvidenceClaim, "sourceId">,
  b: Pick<EvidenceClaim, "sourceId">,
  context: IndependenceContext,
): IndependencePair {
  // A source-less claim (a pure analyst assumption) cannot corroborate anything.
  if (a.sourceId === null || b.sourceId === null) {
    return { independent: false, reason: "source_cannot_corroborate" };
  }
  return areSourcesIndependent(a.sourceId, b.sourceId, context);
}

/** Independent source count for one company's claims. */
export function independentSourcesForClaims(
  claims: readonly Pick<EvidenceClaim, "sourceId">[],
  context: IndependenceContext,
): IndependenceSummary {
  return countIndependentSources(
    claims
      .map((claim) => claim.sourceId)
      .filter((id): id is string => id !== null),
    context,
  );
}
