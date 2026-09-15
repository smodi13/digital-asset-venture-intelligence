/**
 * Server-side feed fetching for the sourcing engine.
 *
 * Uses the existing polite ResearchFetcher (per-host pacing, hard timeout, size
 * cap, no credential in URL, no retry loop) with RSS/Atom content types added.
 *
 * The only URLs ever fetched are the configured feed URLs in feeds.ts. A URL is
 * never accepted from a request. ALLOWED_FEED_URLS is re-checked here as a
 * second gate so a future caller cannot pass an arbitrary endpoint through.
 */

import { ResearchFetcher, DEFAULT_FETCH_POLICY } from "@/lib/research/fetch";
import { ALLOWED_FEED_URLS, feedsForEngine, type FeedConfig } from "./feeds";
import type { FeedFetchOutcome } from "./engine";

const FEED_CONTENT_TYPES = [
  "application/rss+xml",
  "application/atom+xml",
  "application/xml",
  "text/xml",
  "application/rdf+xml",
  "text/html", // some feeds are served with a generic type
];

function classifyError(reason: string): string {
  switch (reason) {
    case "timeout":
      return "timeout";
    case "http_error":
      return "upstream_http_error";
    case "content_type_refused":
      return "unexpected_content_type";
    case "too_large":
      return "response_too_large";
    case "network_error":
      return "network_unreachable";
    default:
      return "fetch_failed";
  }
}

export async function fetchEngineFeeds(engineId: string): Promise<FeedFetchOutcome[]> {
  const feeds = feedsForEngine(engineId);
  const fetcher = new ResearchFetcher({
    allowedContentTypes: [...DEFAULT_FETCH_POLICY.allowedContentTypes, ...FEED_CONTENT_TYPES],
    timeoutMs: 12_000,
    minIntervalMs: 300,
    maxRequestsPerRun: feeds.length + 2,
  });

  const outcomes: FeedFetchOutcome[] = [];
  for (const feed of feeds) {
    outcomes.push(await fetchOne(fetcher, feed));
  }
  return outcomes;
}

async function fetchOne(fetcher: ResearchFetcher, feed: FeedConfig): Promise<FeedFetchOutcome> {
  if (!ALLOWED_FEED_URLS.has(feed.url)) {
    return { feed, ok: false, error: "feed_not_allowlisted" };
  }
  try {
    const result = await fetcher.fetch(feed.url);
    if (!result.ok) return { feed, ok: false, error: classifyError(result.reason) };
    return { feed, ok: true, xml: result.body };
  } catch {
    return { feed, ok: false, error: "fetch_failed" };
  }
}
