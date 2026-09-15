/**
 * Configured discovery feeds.
 *
 * This list is the ENTIRE set of endpoints the sourcing server will fetch. A
 * feed URL is never taken from a request, a query parameter, or user input, so
 * the sourcing feature cannot be turned into an SSRF or open-proxy surface.
 *
 * Every feed here is a public, openly accessible RSS feed that requires no
 * account, no API key, and no credential. No paywall, login wall, anti-bot
 * control, or robots restriction is bypassed. A recruiter opening the deployed
 * product can run the workflow with nothing configured.
 *
 * A feed that is briefly unavailable, rate limited, or malformed degrades to a
 * failed row in source health; it never crashes the run or removes the results
 * from the other feeds.
 */

export interface FeedConfig {
  id: string;
  name: string;
  publisher: string;
  url: string;
  /** Which engine consumes this feed. */
  engineId: string;
}

export const FEEDS: readonly FeedConfig[] = [
  {
    id: "coindesk-news",
    name: "CoinDesk",
    publisher: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss",
    engineId: "public-feed-discovery",
  },
  {
    id: "cointelegraph-news",
    name: "Cointelegraph",
    publisher: "Cointelegraph",
    url: "https://cointelegraph.com/rss",
    engineId: "public-feed-discovery",
  },
  {
    id: "decrypt-news",
    name: "Decrypt",
    publisher: "Decrypt",
    url: "https://decrypt.co/feed",
    engineId: "public-feed-discovery",
  },
  {
    id: "blockworks-news",
    name: "Blockworks",
    publisher: "Blockworks",
    // The .co host 308-redirects here; the resolved host is configured
    // directly so the allowlist never has to trust a cross-domain redirect.
    url: "https://blockworks.com/feed",
    engineId: "public-feed-discovery",
  },
  {
    id: "cryptoslate-news",
    name: "CryptoSlate",
    publisher: "CryptoSlate",
    url: "https://cryptoslate.com/feed/",
    engineId: "public-feed-discovery",
  },
  {
    id: "techcrunch-funding",
    name: "TechCrunch, Funding",
    publisher: "TechCrunch",
    url: "https://techcrunch.com/tag/funding/feed/",
    engineId: "public-feed-discovery",
  },
  {
    id: "crunchbase-news",
    name: "Crunchbase News",
    publisher: "Crunchbase News",
    url: "https://news.crunchbase.com/feed/",
    engineId: "public-feed-discovery",
  },
];

/** The set of hosts the fetcher is allowed to contact. Derived from FEEDS. */
export const ALLOWED_FEED_URLS: ReadonlySet<string> = new Set(FEEDS.map((f) => f.url));

/** Accepts the current id and the retired "headline-radar" id. */
export function feedsForEngine(engineId: string): readonly FeedConfig[] {
  const wanted = engineId === "headline-radar" ? "public-feed-discovery" : engineId;
  return FEEDS.filter((f) => f.engineId === wanted);
}
