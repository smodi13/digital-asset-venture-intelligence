import type { Packet } from "./packet-schema";
import type { CompiledCorpus } from "./compile";
import type { UniverseContract } from "./universe-contract";
import { findSourceDuplicates } from "./dedupe";
import { checkSourceOrigins } from "./integrity";

/**
 * The research-integrity audit report (Phase 3B-0, PARALLEL / DORMANT).
 *
 * Reports facts about the research corpus: counts, source classes,
 * independence, origin chains, distributions. Deliberately excludes
 * investment scores, ranks, and recommendations, which do not exist at this
 * stage of the pipeline.
 */

function counts<T extends string | null>(values: readonly T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) {
    const key = v ?? "unknown";
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

export interface AuditReport {
  packets: number;
  companies: number;
  people: number;
  sources: number;
  evidenceClaims: number;
  signalEvents: number;
  unknownGapCount: number;
  sourcesByClass: Record<string, number>;
  independentSourceCount: number;
  nonIndependentSourceCount: number;
  originChainCount: number;
  unresolvedReferenceCount: number;
  duplicateWarningCount: number;
  cutoffViolationCount: number;
  reportedUnconfirmedSignalCount: number;
  metricRecordCount: number;
  entityTypeDistribution: Record<string, number>;
  assetTypeDistribution: Record<string, number>;
  categoryDistribution: Record<string, number>;
  cohortDistribution: Record<string, number> | null;
}

export function buildAuditReport(
  packets: readonly Packet[],
  corpus: CompiledCorpus | null,
  contract: UniverseContract | null,
): AuditReport {
  const sources = corpus?.sources ?? packets.flatMap((p) => p.sources);
  const evidenceClaims = corpus?.evidenceClaims ?? packets.flatMap((p) => p.evidenceClaims);
  const signalEvents = corpus?.signalEvents ?? packets.flatMap((p) => p.signalEvents);
  const people = corpus?.people ?? packets.flatMap((p) => p.people);
  const companies = corpus?.companies ?? [];

  let originChainCount = 0;
  let unresolvedReferenceCount = 0;
  for (const p of packets) {
    for (const s of p.sources) {
      if (s.originatesFrom !== null) originChainCount += 1;
    }
    const issues = checkSourceOrigins(p.sources, p.canonicalId);
    unresolvedReferenceCount += issues.filter((i) => i.code === "origin_unresolved").length;
  }
  for (const claim of evidenceClaims) {
    const sourceIds = new Set(sources.map((s) => s.id));
    if (claim.sourceId !== null && !sourceIds.has(claim.sourceId)) unresolvedReferenceCount += 1;
  }

  const duplicateWarningCount = findSourceDuplicates(sources).filter((h) => h.kind === "publisher_title_date").length;

  return {
    packets: packets.length,
    companies: companies.length || packets.length,
    people: people.length,
    sources: sources.length,
    evidenceClaims: evidenceClaims.length,
    signalEvents: signalEvents.length,
    unknownGapCount: packets.reduce((sum, p) => sum + p.unknowns.length, 0),
    sourcesByClass: counts(sources.map((s) => s.sourceType)),
    independentSourceCount: sources.filter((s) => s.isIndependent).length,
    nonIndependentSourceCount: sources.filter((s) => !s.isIndependent).length,
    originChainCount,
    unresolvedReferenceCount,
    duplicateWarningCount,
    cutoffViolationCount: 0, // a batch with any cutoff violation never reaches compile; reported at validate time instead
    reportedUnconfirmedSignalCount: signalEvents.filter((e) => e.eventStatus === "reported_unconfirmed").length,
    metricRecordCount: packets.filter((p) => p.digitalAssetMetrics !== null).length,
    entityTypeDistribution: counts(packets.map((p) => p.entityType)),
    assetTypeDistribution: counts(packets.map((p) => p.assetType)),
    categoryDistribution: counts(packets.map((p) => p.category)),
    cohortDistribution: contract
      ? counts(packets.map((p) => contract.cohortByCandidateId.get(p.candidateId) ?? null))
      : null,
  };
}
