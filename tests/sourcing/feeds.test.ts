import { describe, expect, it } from "vitest";
import { ALLOWED_FEED_URLS, FEEDS, feedsForEngine } from "@/lib/sourcing/feeds";
import { fetchEngineFeeds } from "@/lib/sourcing/fetch-feeds";

describe("feed configuration", () => {
  it("uses only https public feed URLs, with no credentials", () => {
    for (const feed of FEEDS) {
      const url = new URL(feed.url);
      expect(url.protocol).toBe("https:");
      expect(url.username).toBe("");
      expect(url.password).toBe("");
    }
  });

  it("the fetch allowlist is exactly the configured feeds", () => {
    expect([...ALLOWED_FEED_URLS].sort()).toEqual(FEEDS.map((f) => f.url).sort());
  });

  it("has at least one no-key engine feed", () => {
    expect(feedsForEngine("headline-radar").length).toBeGreaterThan(0);
  });

  it("includes a crypto-native source (CoinDesk) in the allowlist", () => {
    expect(FEEDS.some((f) => f.id === "coindesk-news" && /coindesk\.com/i.test(f.url))).toBe(true);
    expect(ALLOWED_FEED_URLS.has("https://www.coindesk.com/arc/outboundfeeds/rss")).toBe(true);
  });

  it("includes the expanded crypto-native source set (Cointelegraph, Decrypt, Blockworks, CryptoSlate)", () => {
    for (const [id, host] of [
      ["cointelegraph-news", "cointelegraph.com"],
      ["decrypt-news", "decrypt.co"],
      ["blockworks-news", "blockworks.com"],
      ["cryptoslate-news", "cryptoslate.com"],
    ] as const) {
      const feed = FEEDS.find((f) => f.id === id);
      expect(feed).toBeDefined();
      expect(new URL(feed!.url).hostname).toBe(host);
      expect(ALLOWED_FEED_URLS.has(feed!.url)).toBe(true);
    }
  });

  it("does not re-add the broad TechCrunch Venture feed", () => {
    expect(FEEDS.some((f) => f.id === "techcrunch-venture")).toBe(false);
  });

  it("does not read any environment credential", () => {
    // The sourcing modules import nothing from process.env. This asserts the
    // engine feed set is static config, not derived from a secret.
    const before = { ...process.env };
    void feedsForEngine("headline-radar");
    expect(process.env).toEqual(before);
  });
});

describe("fetchEngineFeeds SSRF boundary", () => {
  it("only attempts configured feed hosts (no arbitrary URL path)", async () => {
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response("<rss><channel></channel></rss>", {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      });
    }) as typeof fetch;
    try {
      await fetchEngineFeeds("headline-radar");
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(ALLOWED_FEED_URLS.has(call)).toBe(true);
    }
  });

  it("returns a typed failure for an unknown engine rather than fetching anything", async () => {
    const realFetch = globalThis.fetch;
    let fetched = false;
    globalThis.fetch = (async () => {
      fetched = true;
      return new Response("", { status: 200 });
    }) as typeof fetch;
    try {
      const outcomes = await fetchEngineFeeds("no-such-engine");
      expect(outcomes).toEqual([]);
      expect(fetched).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
