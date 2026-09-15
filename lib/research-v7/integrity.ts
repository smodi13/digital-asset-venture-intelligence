import type { Packet } from "./packet-schema";
import type { EvidenceClaim } from "@/lib/schemas/evidence-claim";
import type { SourceRecordV7 } from "@/lib/schemas/v7/source-record";
import type { SignalEventV7 } from "@/lib/schemas/v7/signal-event";
import { checkCutoff, isValidPeriod } from "./dates";
import { firstDuplicate, allDuplicates, slugify } from "./ids";
import { findSourceDuplicates } from "./dedupe";
import type { UniverseContract } from "./universe-contract";
import { issue, type Issue } from "./validate";

/**
 * Cross-packet integrity checks (Phase 3B-0, PARALLEL / DORMANT).
 *
 * Runs after every packet has individually passed schema validation. Operates
 * on the assembled corpus (all packets in the batch), because origin chains,
 * duplicate ids, and universe-contract matching are cross-record questions by
 * nature.
 */

/**
 * Follow originatesFrom to detect a cycle, without silently truncating one.
 * Unlike lib/research/independence.ts's originOf (which must never hang a
 * production build on hand-authored v6 data), this reports the cycle as an
 * ERROR: a v7 packet author sets originatesFrom explicitly and a cycle here
 * is always an authoring mistake worth surfacing, not swallowing.
 */
function detectOriginCycle(sourceId: string, byId: Map<string, SourceRecordV7>): string[] | null {
  const path: string[] = [];
  const onPath = new Set<string>();
  let current: string | null = sourceId;
  while (current !== null) {
    if (onPath.has(current)) {
      const cycleStart = path.indexOf(current);
      return path.slice(cycleStart).concat(current);
    }
    onPath.add(current);
    path.push(current);
    const source = byId.get(current);
    current = source?.originatesFrom ?? null;
  }
  return null;
}

export function checkSourceOrigins(sources: readonly SourceRecordV7[], packetId: string): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map(sources.map((s) => [s.id, s]));

  for (const source of sources) {
    if (source.originatesFrom === null) continue;
    if (!byId.has(source.originatesFrom)) {
      issues.push(
        issue(
          "ERROR",
          "origin_unresolved",
          `Source "${source.id}" originatesFrom "${source.originatesFrom}", which does not resolve to any known source.`,
          { packetId, path: `sources.${source.id}.originatesFrom` },
        ),
      );
      continue;
    }
    const cycle = detectOriginCycle(source.id, byId);
    if (cycle) {
      issues.push(
        issue(
          "ERROR",
          "origin_cycle",
          `Source origin cycle detected: ${cycle.join(" -> ")}.`,
          { packetId, path: `sources.${source.id}.originatesFrom` },
        ),
      );
    }
  }

  return issues;
}

export function checkSourceDedupe(sources: readonly SourceRecordV7[], packetId: string): Issue[] {
  const hits = findSourceDuplicates(sources);
  return hits.map((hit) =>
    issue(
      hit.kind === "exact_url" ? "ERROR" : "WARNING",
      hit.kind === "exact_url" ? "duplicate_source_url" : "likely_duplicate_source",
      hit.detail,
      { packetId, path: `sources[${hit.sourceIds.join(",")}]` },
    ),
  );
}

/**
 * Cutoff eligibility applies only to evidence-bearing sources: sources
 * actually cited by an admitted EvidenceClaim, SignalEvent, or digital-asset
 * metric. A source kept only as a research lead or gap (not yet cited by
 * anything) may lack availabilityDate without failing the batch; it simply
 * cannot support a claim, event, or metric until one is established. This is
 * the "may remain a research lead or gap" carve-out; it is not a broad
 * bypass, because the moment a source IS cited, this check applies to it.
 */
export function checkSourceCutoff(
  sources: readonly SourceRecordV7[],
  evidenceBearingSourceIds: ReadonlySet<string>,
  packetId: string,
): Issue[] {
  const issues: Issue[] = [];
  for (const s of sources) {
    if (!evidenceBearingSourceIds.has(s.id)) continue;
    const result = checkCutoff({ publicationDate: s.publishedAt, availabilityDate: s.availabilityDate });
    if (!result.ok) {
      issues.push(
        issue(
          "ERROR",
          "cutoff_leakage",
          `Source "${s.id}" is cited by admitted evidence but fails the research cutoff (${result.reason}).`,
          { packetId, path: `sources.${s.id}` },
        ),
      );
    }
  }
  return issues;
}

/** Every source id cited by an admitted EvidenceClaim, SignalEvent, or digital-asset metric across a packet. */
export function collectEvidenceBearingSourceIds(packet: Packet): Set<string> {
  const ids = new Set<string>();
  for (const claim of packet.evidenceClaims) {
    if (claim.sourceId !== null) ids.add(claim.sourceId);
    for (const sid of claim.supportingSourceIds) ids.add(sid);
  }
  for (const event of packet.signalEvents) {
    ids.add(event.sourceId);
  }
  const metrics = packet.digitalAssetMetrics;
  if (metrics) {
    for (const group of [metrics.network, metrics.tokenMarket]) {
      if (!group) continue;
      for (const value of Object.values(group)) {
        if (value && typeof value === "object" && "provenance" in value) {
          for (const sid of (value as { provenance: { sourceIds: string[] } }).provenance.sourceIds) ids.add(sid);
        } else if (value && typeof value === "object" && "circulating" in value) {
          // tokenSupply: a nested object of point-in-time metrics, not a metric itself.
          for (const supplyMetric of Object.values(value as Record<string, unknown>)) {
            if (supplyMetric && typeof supplyMetric === "object" && "provenance" in supplyMetric) {
              for (const sid of (supplyMetric as { provenance: { sourceIds: string[] } }).provenance.sourceIds) ids.add(sid);
            }
          }
        }
      }
    }
  }
  return ids;
}

export function checkEvidenceClaims(
  claims: readonly EvidenceClaim[],
  sourceIds: ReadonlySet<string>,
  packetId: string,
): Issue[] {
  const issues: Issue[] = [];
  const dup = firstDuplicate(claims.map((c) => c.id));
  if (dup) {
    issues.push(issue("ERROR", "duplicate_claim_id", `EvidenceClaim id "${dup}" is used more than once.`, { packetId }));
  }
  const claimIds = new Set(claims.map((c) => c.id));

  for (const claim of claims) {
    if (claim.sourceId !== null && !sourceIds.has(claim.sourceId)) {
      issues.push(
        issue("ERROR", "evidence_source_unresolved", `EvidenceClaim "${claim.id}" cites unresolved sourceId "${claim.sourceId}".`, {
          packetId,
          path: `evidenceClaims.${claim.id}.sourceId`,
        }),
      );
    }
    for (const sid of claim.supportingSourceIds) {
      if (!sourceIds.has(sid)) {
        issues.push(
          issue(
            "ERROR",
            "evidence_source_unresolved",
            `EvidenceClaim "${claim.id}" cites unresolved supportingSourceIds "${sid}".`,
            { packetId, path: `evidenceClaims.${claim.id}.supportingSourceIds` },
          ),
        );
      }
    }
    if (claim.contradicts.includes(claim.id)) {
      issues.push(issue("ERROR", "self_contradiction", `EvidenceClaim "${claim.id}" contradicts itself.`, { packetId }));
    }
    for (const cid of [...claim.contradicts, ...claim.contradictedBy]) {
      if (!claimIds.has(cid)) {
        issues.push(
          issue("ERROR", "contradiction_unresolved", `EvidenceClaim "${claim.id}" references unresolved contradiction "${cid}".`, {
            packetId,
            path: `evidenceClaims.${claim.id}`,
          }),
        );
      }
    }
  }
  return issues;
}

export function checkSignalEvents(
  events: readonly SignalEventV7[],
  sourceIds: ReadonlySet<string>,
  evidenceIds: ReadonlySet<string>,
  subjectIds: ReadonlySet<string>,
  packetId: string,
): Issue[] {
  const issues: Issue[] = [];
  const dup = firstDuplicate(events.map((e) => e.id));
  if (dup) issues.push(issue("ERROR", "duplicate_signal_id", `SignalEvent id "${dup}" is used more than once.`, { packetId }));

  for (const e of events) {
    if (!sourceIds.has(e.sourceId)) {
      issues.push(
        issue("ERROR", "signal_source_unresolved", `SignalEvent "${e.id}" cites unresolved sourceId "${e.sourceId}".`, {
          packetId,
          path: `signalEvents.${e.id}.sourceId`,
        }),
      );
    }
    for (const eid of e.evidenceIds) {
      if (!evidenceIds.has(eid)) {
        issues.push(
          issue("ERROR", "signal_evidence_unresolved", `SignalEvent "${e.id}" cites unresolved evidenceId "${eid}".`, {
            packetId,
            path: `signalEvents.${e.id}.evidenceIds`,
          }),
        );
      }
    }
    if (e.subjectId !== null && !subjectIds.has(e.subjectId)) {
      issues.push(
        issue("ERROR", "signal_subject_unresolved", `SignalEvent "${e.id}" cites unresolved subjectId "${e.subjectId}".`, {
          packetId,
          path: `signalEvents.${e.id}.subjectId`,
        }),
      );
    }
    const cutoff = checkCutoff({ publicationDate: e.publicationDate, availabilityDate: e.availabilityDate });
    if (!cutoff.ok) {
      issues.push(
        issue("ERROR", "cutoff_leakage", `SignalEvent "${e.id}" fails the research cutoff (${cutoff.reason}).`, {
          packetId,
          path: `signalEvents.${e.id}`,
        }),
      );
    }
  }
  return issues;
}

export function checkMetricDates(packet: Packet): Issue[] {
  const issues: Issue[] = [];
  const metrics = packet.digitalAssetMetrics;
  if (!metrics) return issues;

  function checkPointInTime(name: string, m: { value: number | null; asOf: string | null } | null | undefined) {
    if (!m || m.value === null) return;
    if (m.asOf !== null && !checkCutoff({ publicationDate: null, availabilityDate: m.asOf }).ok) {
      issues.push(issue("ERROR", "metric_cutoff_leakage", `${name}.asOf is after the research cutoff.`, { packetId: packet.canonicalId }));
    }
  }
  function checkPeriod(name: string, m: { value: number | null; periodStart: string | null; periodEnd: string | null } | null | undefined) {
    if (!m || m.value === null) return;
    if (!isValidPeriod(m.periodStart, m.periodEnd)) {
      issues.push(issue("ERROR", "invalid_metric_period", `${name}: periodEnd falls before periodStart.`, { packetId: packet.canonicalId }));
    }
    if (m.periodEnd !== null && !checkCutoff({ publicationDate: null, availabilityDate: m.periodEnd }).ok) {
      issues.push(issue("ERROR", "metric_cutoff_leakage", `${name}.periodEnd is after the research cutoff.`, { packetId: packet.canonicalId }));
    }
  }

  const network = metrics.network;
  if (network) {
    checkPointInTime("network.tvlUsd", network.tvlUsd);
    checkPeriod("network.protocolFeesUsd", network.protocolFeesUsd);
    checkPeriod("network.protocolRevenueUsd", network.protocolRevenueUsd);
    checkPeriod("network.activeAddresses", network.activeAddresses);
    checkPeriod("network.transactionCount", network.transactionCount);
    checkPeriod("network.transactionVolumeUsd", network.transactionVolumeUsd);
    checkPointInTime("network.operatorCount", network.operatorCount);
    checkPeriod("network.contributorCount", network.contributorCount);
    checkPointInTime("network.treasuryAssetsUsd", network.treasuryAssetsUsd);
    checkPeriod("network.incentiveSpendUsd", network.incentiveSpendUsd);
  }
  const tokenMarket = metrics.tokenMarket;
  if (tokenMarket) {
    checkPointInTime("tokenMarket.circulatingMarketCapUsd", tokenMarket.circulatingMarketCapUsd);
    checkPointInTime("tokenMarket.fdvUsd", tokenMarket.fdvUsd);
    if (tokenMarket.tokenSupply) {
      checkPointInTime("tokenMarket.tokenSupply.circulating", tokenMarket.tokenSupply.circulating);
      checkPointInTime("tokenMarket.tokenSupply.total", tokenMarket.tokenSupply.total);
      checkPointInTime("tokenMarket.tokenSupply.max", tokenMarket.tokenSupply.max);
    }
  }
  return issues;
}

export function checkUniverseContract(packet: Packet, contract: UniverseContract): Issue[] {
  const issues: Issue[] = [];
  const entry = contract.byCandidateId.get(packet.candidateId);
  if (!entry) {
    issues.push(
      issue("ERROR", "candidate_not_in_universe", `candidateId "${packet.candidateId}" does not exist in the supplied final universe.`, {
        packetId: packet.canonicalId,
      }),
    );
    return issues;
  }

  if (entry.canonicalName !== packet.canonicalName && packet.nameAliasNote === null) {
    issues.push(
      issue(
        "ERROR",
        "name_mismatch",
        `canonicalName "${packet.canonicalName}" does not match the frozen universe name "${entry.canonicalName}" and carries no nameAliasNote.`,
        { packetId: packet.canonicalId },
      ),
    );
  }
  if (entry.category !== null && packet.category !== null && entry.category !== packet.category) {
    issues.push(
      issue("ERROR", "category_mismatch", `category "${packet.category}" does not match the frozen universe category "${entry.category}".`, {
        packetId: packet.canonicalId,
      }),
    );
  }
  if (entry.entityType !== packet.entityType && packet.entityTypeCorrectionNote === null) {
    issues.push(
      issue(
        "ERROR",
        "entity_type_mismatch",
        `entityType "${packet.entityType}" does not match the frozen universe entityType "${entry.entityType}" and carries no entityTypeCorrectionNote.`,
        { packetId: packet.canonicalId },
      ),
    );
  }
  if (entry.assetType !== packet.assetType && packet.assetTypeCorrectionNote === null) {
    issues.push(
      issue(
        "ERROR",
        "asset_type_mismatch",
        `assetType "${packet.assetType}" does not match the frozen universe assetType "${entry.assetType}" and carries no assetTypeCorrectionNote.`,
        { packetId: packet.canonicalId },
      ),
    );
  }

  const expectedCohort = contract.cohortByCandidateId.get(packet.candidateId) ?? null;
  if (expectedCohort !== null && packet.cohort !== null && packet.cohort !== expectedCohort) {
    issues.push(
      issue(
        "ERROR",
        "cohort_mismatch",
        `cohort "${packet.cohort}" does not match the frozen cohort assignment "${expectedCohort}". Cohort reassignment is never author-controlled.`,
        { packetId: packet.canonicalId },
      ),
    );
  }

  if (packet.researchCutoff !== "2026-09-10") {
    issues.push(
      issue("ERROR", "cutoff_mismatch", `researchCutoff "${packet.researchCutoff}" does not match the frozen cutoff 2026-09-10.`, {
        packetId: packet.canonicalId,
      }),
    );
  }

  return issues;
}

export function checkEntityDedupe(packets: readonly Packet[]): Issue[] {
  const issues: Issue[] = [];
  const dupIds = allDuplicates(packets.map((p) => p.canonicalId));
  for (const id of dupIds) {
    issues.push(issue("ERROR", "duplicate_entity_id", `canonicalId "${id}" is used by more than one packet.`));
  }

  const dupCandidateIds = allDuplicates(packets.map((p) => p.candidateId));
  for (const id of dupCandidateIds) {
    issues.push(issue("ERROR", "duplicate_candidate_id", `candidateId "${id}" is used by more than one packet.`));
  }
  return issues;
}

export function checkPersonDedupe(allPeople: readonly { id: string; name: string; packetId: string }[]): Issue[] {
  const issues: Issue[] = [];
  const dupIds = allDuplicates(allPeople.map((p) => p.id));
  for (const id of dupIds) {
    const owners = allPeople.filter((p) => p.id === id);
    const names = new Set(owners.map((o) => o.name));
    if (names.size > 1) {
      issues.push(issue("ERROR", "duplicate_person_id", `Person id "${id}" is used for conflicting names: ${[...names].join(", ")}.`));
    }
  }

  const byName = new Map<string, { id: string; packetId: string }[]>();
  for (const p of allPeople) {
    const key = slugify(p.name);
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push({ id: p.id, packetId: p.packetId });
    byName.set(key, list);
  }
  for (const [name, entries] of [...byName.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const distinctIds = new Set(entries.map((e) => e.id));
    if (distinctIds.size > 1) {
      issues.push(
        issue(
          "WARNING",
          "duplicate_person_name",
          `Normalized person name "${name}" appears under ${distinctIds.size} different ids: ${[...distinctIds].sort().join(", ")}.`,
        ),
      );
    }
  }
  return issues;
}
