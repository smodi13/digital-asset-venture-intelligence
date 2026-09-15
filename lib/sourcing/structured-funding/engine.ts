/**
 * Structured Funding Discovery engine core.
 *
 * Source-neutral over RawFundingRecord[] (see normalize.ts for Datapile).
 * Builds Candidates directly from the source's own company/round/amount/
 * investor fields - never through the headline-regex extractor - and runs
 * them through the SAME canonical matching and cross-source dedup key
 * (candidateId / matchExisting, exported from ../engine) that Public Feed and
 * X Discovery use, so a company seen in both a news feed and Datapile merges
 * into one candidate with combined provenance (see SourcingView.mergeResults).
 *
 * Funnel order mirrors the shared engine (recency, then relevance, then
 * quality/eligibility, then name sanity), and reuses the exact same
 * RunSummary/FilteredBuckets shape so the UI needs no structured-specific
 * rendering:
 *   - withinRecency:            has a trustworthy funding date inside the
 *                               lookback window (an unknown date is NOT
 *                               "within recency" here - section 6 - unlike
 *                               news items, where an unknown date passes)
 *   - digitalAssetRelevant:     crypto/digital-asset relevance (reuses
 *                               lib/sourcing/relevance.ts's vocabulary, since
 *                               the source feed is global, not crypto-only)
 *   - candidateWorthinessPassed: early-stage eligible and no quality
 *                               disqualifier (lowDiscoveryUtility bucket)
 *   - entitiesResolved:         passed company-name sanity (unresolvedEntity
 *                               bucket otherwise)
 */

import { candidateId, matchExisting, type DiscoveryChannel, type EngineDescriptor, type RunOptions } from "../engine";
import { buildResolver } from "@/lib/research/entity/resolve";
import { classifyRelevance, categorize, DEFAULT_LOOKBACK_DAYS } from "../relevance";
import { classifyStageEligibility, findDisqualifier, looksLikeCompanyName, parseDatapileCryptoPage, type RawFundingRecord } from "./normalize";
import { fetchDatapileFunding, DATAPILE_SOURCE_ID, DATAPILE_SOURCE_NAME, DATAPILE_CRYPTO_URL } from "./datapile";
import type {
  Candidate,
  DiscoveryProvenance,
  EngineRunResult,
  EngineRunStatus,
  FeedHealth,
  FilteredBuckets,
} from "../types";

export const STRUCTURED_FUNDING_ENGINE_ID = "structured-funding-discovery";
export const STRUCTURED_FUNDING_ENGINE_NAME = "Structured Funding Discovery";

export const STRUCTURED_FUNDING_ENGINE: EngineDescriptor & { description: string; requiresNetwork: boolean } = {
  id: STRUCTURED_FUNDING_ENGINE_ID,
  name: STRUCTURED_FUNDING_ENGINE_NAME,
  description:
    "Scans configured structured private-market funding-record sources and surfaces early-stage " +
    "digital-asset financings directly from the source's own company/round/amount fields, without " +
    "depending on a news headline. No account or API key. Discovery only, never a quality judgement.",
  requiresNetwork: true,
};

/** One structured funding source's outcome for one run. */
export type SourceRecordsOutcome =
  | { channel: DiscoveryChannel; ok: true; records: RawFundingRecord[] }
  | { channel: DiscoveryChannel; ok: false; error: string };

/** Section 6: unknown dates never silently pass as current, unlike news' withinLookback. */
function withinStructuredLookback(announcementDate: string | null, now: string, lookbackDays: number): boolean {
  if (!announcementDate) return false;
  const published = Date.parse(announcementDate);
  const nowMs = Date.parse(now);
  if (Number.isNaN(published) || Number.isNaN(nowMs)) return false;
  const ageMs = nowMs - published;
  return ageMs >= 0 && ageMs <= lookbackDays * 24 * 60 * 60 * 1000;
}

export function runStructuredFundingEngine(
  engine: EngineDescriptor,
  outcomes: readonly SourceRecordsOutcome[],
  options: RunOptions,
): EngineRunResult {
  const runAt = options.now ?? new Date().toISOString();
  const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const resolver = buildResolver(options.canonicalCompanies);
  const feeds: FeedHealth[] = [];
  const warnings: string[] = [];

  const filteredBuckets: FilteredBuckets = {
    nonDigitalAsset: 0,
    editorialEventPromotional: 0,
    outsideRecencyWindow: 0,
    lowDiscoveryUtility: 0,
    mediumDiscoveryUtility: 0,
    unresolvedEntity: 0,
  };
  let itemsInspected = 0;
  let withinRecency = 0;
  let digitalAssetRelevant = 0;
  let candidateWorthinessPassed = 0;
  let entitiesResolved = 0;

  const byId = new Map<string, Candidate>();

  for (const outcome of outcomes) {
    const { channel } = outcome;
    if (!outcome.ok) {
      feeds.push({
        feedId: channel.id,
        feedName: channel.name,
        feedUrl: channel.url,
        ok: false,
        itemsInspected: 0,
        itemsAccepted: 0,
        itemsNeedingReview: 0,
        error: outcome.error,
      });
      continue;
    }

    const acceptedIds = new Set<string>();
    for (const record of outcome.records) {
      itemsInspected += 1;

      if (!withinStructuredLookback(record.announcementDate, runAt, lookbackDays)) {
        filteredBuckets.outsideRecencyWindow += 1;
        continue;
      }
      withinRecency += 1;

      const relevanceInput = {
        title: record.companyName,
        summary: record.description,
        categories: [...record.sectors, record.stage ?? "", record.country ?? ""],
      };
      const relevance = classifyRelevance(relevanceInput);
      if (relevance.strength === "not_relevant" || relevance.strength === "weak") {
        filteredBuckets.nonDigitalAsset += 1;
        continue;
      }
      digitalAssetRelevant += 1;

      const disqualifier = findDisqualifier(record);
      const stageVerdict = classifyStageEligibility(record, disqualifier !== null, relevance.strength === "strong");
      if (disqualifier || !stageVerdict.eligible) {
        filteredBuckets.lowDiscoveryUtility += 1;
        continue;
      }
      candidateWorthinessPassed += 1;

      if (!looksLikeCompanyName(record.companyName)) {
        filteredBuckets.unresolvedEntity += 1;
        continue;
      }
      entitiesResolved += 1;

      const normalizedDomain = null; // Datapile RSS never states a domain (section 7: no invented fields).
      const id = candidateId(record.companyName, normalizedDomain);

      const provenance: DiscoveryProvenance = {
        engineId: engine.id,
        engineName: engine.name,
        transport: channel.transport,
        feedId: channel.id,
        feedName: channel.name,
        feedUrl: channel.url,
        sourceTitle: record.title,
        sourceUrl: record.sourceUrl ?? channel.url,
        sourcePublisher: channel.publisher,
        sourcePublishedAt: record.announcementDate,
        discoveredAt: runAt,
        sourceItemId: record.sourceItemId,
        discoveryReason: stageVerdict.reason,
        matchedTerms: relevance.matchedTerms.slice(0, 8),
      };

      const category = categorize(relevanceInput);
      const funding = {
        round: record.stage,
        amountDisplay: record.amountDisplay,
        amountUsd: record.amountUsd,
        currency: record.amountDisplay ? "USD" : null,
        valuationDisplay: record.valuationDisplay,
        leadInvestors: record.leadInvestors,
        otherInvestors: record.otherInvestors,
        announcementDate: record.announcementDate,
        sourceName: channel.publisher,
      };

      const existing = byId.get(id);
      if (existing) {
        if (!existing.provenance.some((p) => p.sourceItemId === provenance.sourceItemId)) {
          existing.provenance.push(provenance);
        }
        if (!existing.funding) existing.funding = funding;
        if (!existing.description && record.description) existing.description = record.description;
        if (!existing.category && category) existing.category = category;
        acceptedIds.add(id);
        continue;
      }

      byId.set(id, {
        id,
        name: record.companyName,
        domain: null,
        normalizedDomain,
        description: record.description,
        identityConfidence: "confirmed", // The source names the company directly; never a regex guess.
        discoveredAt: runAt,
        provenance: [provenance],
        existing: matchExisting(resolver, record.companyName, null),
        relevance: relevance.strength === "strong" ? "strong" : "moderate",
        relevanceTerms: relevance.matchedTerms,
        discoveryUtility: "high", // Every record reaching here already cleared early-stage eligibility.
        category,
        whySurfaced: `Source-reported ${record.stage ?? "funding"} round (${channel.publisher}); ${stageVerdict.reason}.`,
        funding,
      });
      acceptedIds.add(id);
    }

    feeds.push({
      feedId: channel.id,
      feedName: channel.name,
      feedUrl: channel.url,
      ok: true,
      itemsInspected: outcome.records.length,
      itemsAccepted: acceptedIds.size,
      itemsNeedingReview: 0,
      error: null,
    });
  }

  const candidates = [...byId.values()].sort((a, b) => {
    const ap = a.funding?.announcementDate ?? a.discoveredAt;
    const bp = b.funding?.announcementDate ?? b.discoveredAt;
    return bp.localeCompare(ap) || a.name.localeCompare(b.name);
  });

  const anyOk = feeds.some((f) => f.ok);
  const anyFail = feeds.some((f) => !f.ok);
  const status: EngineRunStatus = !anyOk ? "failed" : anyFail ? "partial_failure" : "completed";
  if (anyFail && anyOk) {
    warnings.push(
      `${feeds.filter((f) => !f.ok).length} of ${feeds.length} structured funding sources failed; results below are from the sources that responded.`,
    );
  }

  const newCandidates = candidates.filter((c) => !c.existing.companyId).length;
  const alreadyTracked = candidates.length - newCandidates;
  const filteredCount =
    filteredBuckets.nonDigitalAsset +
    filteredBuckets.editorialEventPromotional +
    filteredBuckets.outsideRecencyWindow +
    filteredBuckets.lowDiscoveryUtility +
    filteredBuckets.mediumDiscoveryUtility +
    filteredBuckets.unresolvedEntity;

  return {
    engineId: engine.id,
    engineName: engine.name,
    runAt,
    status,
    feeds,
    candidates,
    reviewSignals: [],
    warnings,
    summary: {
      sourcesFetched: feeds.filter((f) => f.ok).length,
      itemsInspected,
      withinRecency,
      digitalAssetRelevant,
      candidateWorthinessPassed,
      entitiesResolved,
      newCandidates,
      alreadyTracked,
      needsIdentityReview: 0,
      filteredCount,
      filteredBuckets,
      lookbackDays,
    },
  };
}

/** Fetches and runs Datapile end to end. The only structured funding source wired up today. */
export async function runDatapileStructuredFunding(options: RunOptions): Promise<EngineRunResult> {
  const channel: DiscoveryChannel = {
    id: DATAPILE_SOURCE_ID,
    name: DATAPILE_SOURCE_NAME,
    publisher: DATAPILE_SOURCE_NAME,
    url: DATAPILE_CRYPTO_URL,
    transport: "structured_funding",
  };

  const fetched = await fetchDatapileFunding();
  let outcome: SourceRecordsOutcome;
  if (!fetched.ok) {
    outcome = { channel, ok: false, error: fetched.error };
  } else {
    const records = parseDatapileCryptoPage(fetched.html);
    // Fail closed: a page that fetched fine but no longer carries the
    // expected data shape is a Source Health failure, never a silent
    // "zero records" result.
    outcome = records === null ? { channel, ok: false, error: "unexpected_page_structure" } : { channel, ok: true, records };
  }

  return runStructuredFundingEngine(STRUCTURED_FUNDING_ENGINE, [outcome], options);
}
