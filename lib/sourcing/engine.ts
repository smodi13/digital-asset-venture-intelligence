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
import type {
  Candidate,
  DiscoveryProvenance,
  DiscoveryTransport,
  EngineRunResult,
  EngineRunStatus,
  ExistingCompanyMatch,
  FeedHealth,
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
  const resolver = buildResolver(options.canonicalCompanies);
  const feeds: FeedHealth[] = [];
  const warnings: string[] = [];

  // candidateId -> assembled candidate (provenance accumulates)
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
        error: null,
      });
      continue;
    }

    const acceptedIds = new Set<string>();
    for (const item of outcome.items) {
      const extraction = extractCandidate(item);
      if (!extraction) continue;

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

      const existing = byId.get(id);
      if (existing) {
        if (!existing.provenance.some((p) => p.sourceItemId === provenance.sourceItemId)) {
          existing.provenance.push(provenance);
        }
        if (
          existing.identityConfidence === "needs_review" &&
          extraction.identityConfidence !== "needs_review"
        ) {
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
      error: null,
    });
  }

  const candidates = [...byId.values()].sort((a, b) => {
    const ap = latestSourceDate(a);
    const bp = latestSourceDate(b);
    if (ap !== bp) return bp.localeCompare(ap); // newest source story first
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

  return {
    engineId: engine.id,
    engineName: engine.name,
    runAt,
    status,
    feeds,
    candidates,
    warnings,
  };
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
