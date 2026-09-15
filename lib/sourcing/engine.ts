/**
 * The discovery engine core.
 *
 * Source-neutral. It is handed already-parsed items from one or more discovery
 * channels (public RSS feeds, or the X recent-search API) and returns an
 * EngineRunResult: per-channel health, the deduplicated candidates with full
 * discovery provenance, and any warnings.
 *
 * It does not score, rank, or prioritise anything, and it cannot: EngineRunResult
 * has no field for a score. Fetching and parsing are the caller's job, which is
 * what keeps this pure and testable against fixtures.
 *
 * Two engines are built on this core:
 *   - Public Feed Discovery (public-feed-discovery): no credential, RSS feeds.
 *   - X Discovery (x-discovery): optional user-supplied X API bearer token.
 */

import { buildResolver, type EntityResolver } from "@/lib/research/entity/resolve";
import type { ResolvableCompany } from "@/lib/research/entity/resolve";
import { domainKey, normalizeCompanyName, normalizeDomain } from "@/lib/research/entity/normalize";
import { sha256Hex } from "@/lib/hash/canonical";
import { parseFeed } from "./parse";
import { extractCandidate } from "./extract";
import type { FeedItem } from "./parse";
import type { FeedConfig } from "./feeds";
import {
  PUBLIC_FEED_ENGINE_ID,
  PUBLIC_FEED_ENGINE_NAME,
  X_DISCOVERY_ENGINE_ID,
  X_DISCOVERY_ENGINE_NAME,
  canonicalEngineId,
  displayEngineName,
} from "./engine-names";
import {
  DEFAULT_LOOKBACK_DAYS,
  categorize,
  classifyDiscoveryUtility,
  classifyRelevance,
  isNoiseHeadline,
  withinLookback,
  type DiscoveryUtility,
  type RelevanceStrength,
} from "./relevance";
import type {
  Candidate,
  DiscoveryProvenance,
  DiscoveryTransport,
  EngineRunResult,
  EngineRunStatus,
  ExistingCompanyMatch,
  FeedHealth,
  FilteredBuckets,
  ReviewSignal,
} from "./types";

/** A discovery engine descriptor. */
export interface EngineDescriptor {
  id: string;
  name: string;
}

export const PUBLIC_FEED_ENGINE = {
  id: PUBLIC_FEED_ENGINE_ID,
  name: PUBLIC_FEED_ENGINE_NAME,
  description:
    "Scans configured public venture and funding news feeds and surfaces the companies named in " +
    "them. No account or API key. Discovery only, never a quality judgement.",
  requiresNetwork: true,
} as const;

export const X_DISCOVERY_ENGINE = {
  id: X_DISCOVERY_ENGINE_ID,
  name: X_DISCOVERY_ENGINE_NAME,
  description:
    "Searches X (recent posts, roughly the last 7 days) for private-market company and founder " +
    "mentions, using an X API bearer token you supply. Optional and lower precision than the " +
    "structured feeds: most candidates need an analyst to confirm the company identity. " +
    "Discovery only, never a quality judgement.",
  requiresNetwork: true,
} as const;

export { canonicalEngineId, displayEngineName };

/** Kept for backward compatibility with earlier imports. */
export const HEADLINE_ENGINE = PUBLIC_FEED_ENGINE;

/* -------------------------------------------------------------------------- */

/** A discovery channel: one feed, or one X search preset. */
export interface DiscoveryChannel {
  id: string;
  name: string;
  publisher: string;
  url: string;
  transport: DiscoveryTransport;
}

/** Per-channel outcome handed to the engine core: parsed items, or a typed failure. */
export type ChannelItems =
  | { channel: DiscoveryChannel; ok: true; items: FeedItem[] }
  | { channel: DiscoveryChannel; ok: false; error: string };

/** What the public-feed caller supplies per configured feed. */
export type FeedFetchOutcome =
  | { feed: FeedConfig; ok: true; xml: string }
  | { feed: FeedConfig; ok: false; error: string };

export interface RunOptions {
  /** The canonical companies to match against. */
  canonicalCompanies: readonly ResolvableCompany[];
  /** Run timestamp. Injected so a run is reproducible in tests. */
  now?: string;
  /** Items published before this many days ago are filtered from results. Default 30. */
  lookbackDays?: number;
}

function candidateId(name: string, domain: string | null): string {
  const key = domain ? `d:${domainKey(domain) ?? domain}` : `n:${normalizeCompanyName(name)}`;
  return `cand-${sha256Hex(key).slice(0, 12)}`;
}

function matchExisting(
  resolver: EntityResolver,
  name: string,
  domain: string | null,
): ExistingCompanyMatch {
  const res = resolver.resolve({ name, domain });
  if (!res.companyId) return { companyId: null, method: "none", detail: "no canonical match" };
  const method =
    res.method === "domain"
      ? "domain"
      : res.method === "alias"
        ? "alias"
        : res.method === "exact"
          ? "exact_name"
          : "name_similarity";
  return { companyId: res.companyId, method, detail: res.detail };
}

/**
 * The engine core. Source-neutral: it never fetches or parses.
 */
export function runDiscoveryEngine(
  engine: EngineDescriptor,
  outcomes: readonly ChannelItems[],
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

  // candidateId -> assembled candidate (provenance accumulates)
  const byId = new Map<string, Candidate>();
  // Review-signal dedup key (normalized headline) -> assembled signal.
  const reviewByKey = new Map<string, ReviewSignal>();

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

    if (outcome.items.length === 0) {
      feeds.push({
        feedId: channel.id,
        feedName: channel.name,
        feedUrl: channel.url,
        ok: true,
        itemsInspected: 0,
        itemsAccepted: 0,
        itemsNeedingReview: 0,
        error: null,
      });
      continue;
    }

    const acceptedIds = new Set<string>();
    let itemsNeedingReview = 0;
    for (const item of outcome.items) {
      itemsInspected += 1;

      // Funnel order: recency, then editorial/noise, then digital-asset
      // relevance, then discovery utility, then entity extraction, then
      // canonical matching. This keeps every bucket truthful - an item is
      // never counted as "non-relevant" or "noise" merely because the
      // deterministic extractor could not name the company (section 3).
      if (!withinLookback(item.publishedAt, runAt, lookbackDays)) {
        filteredBuckets.outsideRecencyWindow += 1;
        continue;
      }
      withinRecency += 1;

      if (isNoiseHeadline(item.title)) {
        filteredBuckets.editorialEventPromotional += 1;
        continue;
      }

      const relevanceInput = { title: item.title, summary: item.summary, categories: item.categories };
      const relevance = classifyRelevance(relevanceInput);
      const utility = classifyDiscoveryUtility(relevanceInput);

      if (relevance.strength === "not_relevant" || relevance.strength === "weak") {
        filteredBuckets.nonDigitalAsset += 1;
        continue;
      }
      digitalAssetRelevant += 1;

      // A resolved entity only becomes a New Candidate on a genuinely
      // early-stage discovery signal (HIGH utility) - a routine product
      // launch, partnership, integration, or expansion by an
      // already-operating entity is real digital-asset news, but not a
      // sourcing lead, regardless of whether relevance is strong or
      // moderate. This is a signal-based utility gate, never a
      // company-name blocklist, so it applies uniformly to every entity.
      if (utility === "low") {
        filteredBuckets.lowDiscoveryUtility += 1;
        continue;
      }
      if (utility === "medium") {
        filteredBuckets.mediumDiscoveryUtility += 1;
        continue;
      }
      candidateWorthinessPassed += 1;

      // isNoiseHeadline already ran above, so extractCandidate's own noise
      // guard cannot fire here; the only remaining failure mode is a
      // headline with no company-shaped subject (needs_review).
      const extraction = extractCandidate(item)!;
      if (extraction.identityConfidence === "needs_review") {
        // Every item reaching here already cleared the HIGH-utility gate
        // above, so a genuine funding/launch/stealth signal exists; it is
        // preserved for analyst review rather than silently dropped
        // (section 7), never filtered outright.
        itemsNeedingReview += 1;
        addReviewSignal(reviewByKey, {
          item,
          channel,
          runAt,
          relevance,
          utility,
          identityIssue: "no company-shaped subject found in the headline",
        });
        continue;
      }
      entitiesResolved += 1;

      const normalizedDomain = extraction.domain ? normalizeDomain(extraction.domain) : null;
      const id = candidateId(extraction.name, normalizedDomain);

      const provenance: DiscoveryProvenance = {
        engineId: engine.id,
        engineName: engine.name,
        transport: channel.transport,
        feedId: channel.id,
        feedName: channel.name,
        feedUrl: channel.url,
        sourceTitle: item.title,
        sourceUrl: item.link ?? channel.url,
        sourcePublisher: item.author ?? channel.publisher,
        sourcePublishedAt: item.publishedAt,
        discoveredAt: runAt,
        sourceItemId: item.id,
        discoveryReason: extraction.discoveryReason,
        matchedTerms: item.categories.slice(0, 8),
      };

      const category = categorize(relevanceInput);
      const utilityLabel = utility === "high" ? "high" : "medium";
      const whySurfaced = buildWhySurfaced(relevance, utility, extraction.discoveryReason);

      const existing = byId.get(id);
      if (existing) {
        if (!existing.provenance.some((p) => p.sourceItemId === provenance.sourceItemId)) {
          existing.provenance.push(provenance);
        }
        if (existing.identityConfidence === "probable" && extraction.identityConfidence === "confirmed") {
          existing.name = extraction.name;
          existing.identityConfidence = extraction.identityConfidence;
        }
        if (!existing.domain && normalizedDomain) {
          existing.domain = extraction.domain;
          existing.normalizedDomain = normalizedDomain;
          existing.existing = matchExisting(resolver, existing.name, extraction.domain);
        }
        if (!existing.description && extraction.description) {
          existing.description = extraction.description;
        }
        if (existing.relevance === "moderate" && relevance.strength === "strong") {
          existing.relevance = "strong";
          existing.relevanceTerms = relevance.matchedTerms;
        }
        if (existing.discoveryUtility === "medium" && utilityLabel === "high") {
          existing.discoveryUtility = "high";
        }
        if (!existing.category && category) existing.category = category;
        acceptedIds.add(id);
        continue;
      }

      byId.set(id, {
        id,
        name: extraction.name,
        domain: extraction.domain,
        normalizedDomain,
        description: extraction.description,
        identityConfidence: extraction.identityConfidence,
        discoveredAt: runAt,
        provenance: [provenance],
        existing: matchExisting(resolver, extraction.name, extraction.domain),
        relevance: relevance.strength === "strong" ? "strong" : "moderate",
        relevanceTerms: relevance.matchedTerms,
        discoveryUtility: utilityLabel,
        category,
        whySurfaced,
      });
      acceptedIds.add(id);
    }

    feeds.push({
      feedId: channel.id,
      feedName: channel.name,
      feedUrl: channel.url,
      ok: true,
      itemsInspected: outcome.items.length,
      itemsAccepted: acceptedIds.size,
      itemsNeedingReview,
      error: null,
    });
  }

  // Default ordering (section 10): relevance strength, then discovery
  // utility, then recency, then identity confidence, then name.
  const RELEVANCE_RANK: Record<Candidate["relevance"], number> = { strong: 2, moderate: 1 };
  const UTILITY_RANK: Record<Candidate["discoveryUtility"], number> = { high: 2, medium: 1 };
  const IDENTITY_RANK: Record<Candidate["identityConfidence"], number> = {
    confirmed: 2,
    probable: 1,
    needs_review: 0,
  };
  const candidates = [...byId.values()].sort((a, b) => {
    if (RELEVANCE_RANK[a.relevance] !== RELEVANCE_RANK[b.relevance]) {
      return RELEVANCE_RANK[b.relevance] - RELEVANCE_RANK[a.relevance];
    }
    if (UTILITY_RANK[a.discoveryUtility] !== UTILITY_RANK[b.discoveryUtility]) {
      return UTILITY_RANK[b.discoveryUtility] - UTILITY_RANK[a.discoveryUtility];
    }
    const ap = latestSourceDate(a);
    const bp = latestSourceDate(b);
    if (ap !== bp) return bp.localeCompare(ap); // newest source story first
    if (IDENTITY_RANK[a.identityConfidence] !== IDENTITY_RANK[b.identityConfidence]) {
      return IDENTITY_RANK[b.identityConfidence] - IDENTITY_RANK[a.identityConfidence];
    }
    return a.name.localeCompare(b.name);
  });

  const anyOk = feeds.some((f) => f.ok);
  const anyFail = feeds.some((f) => !f.ok);
  const status: EngineRunStatus = !anyOk ? "failed" : anyFail ? "partial_failure" : "completed";
  if (anyFail && anyOk) {
    warnings.push(
      `${feeds.filter((f) => !f.ok).length} of ${feeds.length} channels failed; results below are from the channels that responded.`,
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

  const reviewSignals = [...reviewByKey.values()].sort(
    (a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || a.headline.localeCompare(b.headline),
  );

  return {
    engineId: engine.id,
    engineName: engine.name,
    runAt,
    status,
    feeds,
    candidates,
    reviewSignals,
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
      needsIdentityReview: reviewSignals.length,
      filteredCount,
      filteredBuckets,
      lookbackDays,
    },
  };
}

/** Builds (or merges into an existing) Needs Identity Review signal, deduped by normalized headline. */
function addReviewSignal(
  reviewByKey: Map<string, ReviewSignal>,
  args: {
    item: FeedItem;
    channel: DiscoveryChannel;
    runAt: string;
    relevance: { strength: RelevanceStrength; matchedTerms: string[] };
    utility: DiscoveryUtility;
    identityIssue: string;
  },
): void {
  const { item, channel, runAt, relevance, identityIssue } = args;
  const key = item.title.trim().toLowerCase();
  const existing = reviewByKey.get(key);
  if (existing) return; // Same story from another source: keep the first, no duplicate row.

  reviewByKey.set(key, {
    id: `review-${sha256Hex(key).slice(0, 12)}`,
    headline: item.title,
    source: channel.name,
    sourceUrl: item.link ?? channel.url,
    publishedAt: item.publishedAt,
    discoveredAt: runAt,
    whyRelevant: `${relevance.strength === "strong" ? "Strong" : "Moderate"} digital-asset relevance (${relevance.matchedTerms.slice(0, 3).join(", ") || "digital-asset context"})`,
    whyUseful: "High discovery utility signal (funding, launch, or stealth language)",
    identityIssue,
    transport: channel.transport,
  });
}

function buildWhySurfaced(
  relevance: { strength: RelevanceStrength; matchedTerms: string[] },
  utility: DiscoveryUtility,
  discoveryReason: string,
): string {
  const strengthLabel = relevance.strength === "strong" ? "Strong" : "Moderate";
  const utilityLabel = utility === "high" ? "high" : utility === "low" ? "low" : "medium";
  const terms = relevance.matchedTerms.slice(0, 4).join(", ") || "digital-asset context";
  return `${strengthLabel} digital-asset relevance (${terms}); ${utilityLabel} discovery utility; ${discoveryReason}.`;
}

/**
 * Public Feed Discovery: parse the fetched RSS/Atom payloads, then run the core.
 * A malformed feed degrades to a failed channel, never a thrown run.
 */
export function runPublicFeedEngine(
  outcomes: readonly FeedFetchOutcome[],
  options: RunOptions,
): EngineRunResult {
  const channelItems: ChannelItems[] = outcomes.map((outcome) => {
    const channel: DiscoveryChannel = {
      id: outcome.feed.id,
      name: outcome.feed.name,
      publisher: outcome.feed.publisher,
      url: outcome.feed.url,
      transport: "public_feed",
    };
    if (!outcome.ok) return { channel, ok: false, error: outcome.error };
    try {
      return { channel, ok: true, items: parseFeed(outcome.xml).items };
    } catch {
      return { channel, ok: false, error: "malformed_feed" };
    }
  });
  return runDiscoveryEngine(PUBLIC_FEED_ENGINE, channelItems, options);
}

/** Backward-compatible alias for the pre-rename entry point. */
export const runHeadlineEngine = runPublicFeedEngine;

function latestSourceDate(c: Candidate): string {
  let latest = "";
  for (const p of c.provenance) {
    if (p.sourcePublishedAt && p.sourcePublishedAt > latest) latest = p.sourcePublishedAt;
  }
  return latest || c.discoveredAt;
}
