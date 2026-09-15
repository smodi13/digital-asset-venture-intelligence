import { describe, expect, it } from "vitest";
import { runHeadlineEngine, type FeedFetchOutcome } from "@/lib/sourcing/engine";
import type { FeedConfig } from "@/lib/sourcing/feeds";
import type { ResolvableCompany } from "@/lib/research/entity/resolve";

const CANONICAL: ResolvableCompany[] = [
  { id: "co-acme-com", name: "Acme", domain: "acme.com", aliases: ["Acme Labs"] },
  { id: "co-globex-io", name: "Globex", domain: "globex.io", aliases: [] },
];

const feedA: FeedConfig = {
  id: "feed-a",
  name: "Feed A",
  publisher: "Publisher A",
  url: "https://feed-a.example.com/rss",
  engineId: "public-feed-discovery",
};
const feedB: FeedConfig = {
  id: "feed-b",
  name: "Feed B",
  publisher: "Publisher B",
  url: "https://feed-b.example.com/rss",
  engineId: "public-feed-discovery",
};
const feedC: FeedConfig = {
  id: "feed-c",
  name: "Feed C",
  publisher: "Publisher C",
  url: "https://feed-c.example.com/rss",
  engineId: "public-feed-discovery",
};

const RSS_A = `<rss><channel>
  <item>
    <title>Northwind raises $20M to build stablecoin infrastructure</title>
    <link>https://a.example.com/northwind/</link>
    <pubDate>Wed, 03 Sep 2026 10:00:00 +0000</pubDate>
    <guid>a-northwind-1</guid>
    <description><![CDATA[<script>alert(1)</script>Northwind closed a Series A for its crypto payments rail.]]></description>
    <category>Venture</category>
  </item>
  <item>
    <title>Acme raises $100M Series A for its custody protocol</title>
    <link>https://a.example.com/acme/</link>
    <pubDate>Tue, 02 Sep 2026 10:00:00 +0000</pubDate>
    <guid>a-acme-1</guid>
    <description>Acme, at acme.com, announced new funding for its crypto custody platform.</description>
  </item>
  <item>
    <title>The 10 biggest funding rounds this week</title>
    <link>https://a.example.com/roundup/</link>
    <pubDate>Mon, 01 Sep 2026 10:00:00 +0000</pubDate>
    <guid>a-roundup-1</guid>
    <description>A weekly summary of crypto funding rounds.</description>
  </item>
  <item>
    <title>Mistral AI raises $500M at a $6B valuation</title>
    <link>https://a.example.com/mistral/</link>
    <pubDate>Sun, 31 Aug 2026 10:00:00 +0000</pubDate>
    <guid>a-mistral-1</guid>
    <description>A large general AI lab raised new funding.</description>
  </item>
  <item>
    <title>The market shifts as stablecoin regulation tightens across the industry</title>
    <link>https://a.example.com/analysis/</link>
    <pubDate>Sat, 30 Aug 2026 10:00:00 +0000</pubDate>
    <guid>a-analysis-1</guid>
    <description>Broad commentary on stablecoin policy, no company named.</description>
  </item>
</channel></rss>`;

const RSS_B = `<rss><channel>
  <item>
    <title>Northwind lands $20M seed round for its stablecoin rail</title>
    <link>https://b.example.com/northwind/</link>
    <pubDate>Wed, 03 Sep 2026 14:00:00 +0000</pubDate>
    <guid>b-northwind-1</guid>
    <description>Coverage of the Northwind stablecoin infrastructure seed round.</description>
  </item>
  <item>
    <title>A new stablecoin protocol quietly emerges from stealth with $10M seed</title>
    <link>https://b.example.com/review-item/</link>
    <pubDate>Thu, 04 Sep 2026 09:00:00 +0000</pubDate>
    <guid>b-review-1</guid>
    <description>No company name given, but the round and stealth exit are described in detail.</description>
  </item>
</channel></rss>`;

const RSS_C = `<rss><channel>
  <item>
    <title>A new stablecoin protocol quietly emerges from stealth with $10M seed</title>
    <link>https://c.example.com/review-item/</link>
    <pubDate>Thu, 04 Sep 2026 10:00:00 +0000</pubDate>
    <guid>c-review-1</guid>
    <description>A second publication covering the same stealth exit.</description>
  </item>
</channel></rss>`;

function run(outcomes: FeedFetchOutcome[]) {
  return runHeadlineEngine(outcomes, {
    canonicalCompanies: CANONICAL,
    now: "2026-09-08T00:00:00.000Z",
  });
}

describe("runHeadlineEngine", () => {
  it("runs against fixture feeds with no network and no credentials", () => {
    const result = run([{ feed: feedA, ok: true, xml: RSS_A }]);
    expect(result.status).toBe("completed");
    expect(result.engineId).toBe("public-feed-discovery");
    expect(result.feeds[0]!.itemsInspected).toBe(5);
  });

  it("preserves discovery provenance for every candidate", () => {
    const result = run([{ feed: feedA, ok: true, xml: RSS_A }]);
    for (const c of result.candidates) {
      expect(c.provenance.length).toBeGreaterThan(0);
      for (const p of c.provenance) {
        expect(p.engineId).toBe("public-feed-discovery");
        expect(p.feedUrl).toBe(feedA.url);
        expect(p.sourceUrl).toMatch(/^https?:\/\//);
        expect(p.discoveredAt).toBe("2026-09-08T00:00:00.000Z");
        expect(p.sourceItemId).toBeTruthy();
      }
    }
  });

  it("deduplicates the same company across feeds and keeps both provenance records", () => {
    const result = run([
      { feed: feedA, ok: true, xml: RSS_A },
      { feed: feedB, ok: true, xml: RSS_B },
    ]);
    const northwind = result.candidates.filter((c) => c.name === "Northwind");
    expect(northwind).toHaveLength(1);
    expect(northwind[0]!.provenance).toHaveLength(2);
    expect(new Set(northwind[0]!.provenance.map((p) => p.feedId))).toEqual(
      new Set(["feed-a", "feed-b"]),
    );
  });

  it("matches an existing canonical company and exposes its id for linking", () => {
    const result = run([{ feed: feedA, ok: true, xml: RSS_A }]);
    const acme = result.candidates.find((c) => c.name === "Acme")!;
    expect(acme.existing.companyId).toBe("co-acme-com");
    expect(acme.existing.method).toBe("domain");
  });

  it("keeps a genuinely new candidate separate from the canonical corpus", () => {
    const result = run([{ feed: feedA, ok: true, xml: RSS_A }]);
    const northwind = result.candidates.find((c) => c.name === "Northwind")!;
    expect(northwind.existing.companyId).toBeNull();
    expect(northwind.existing.method).toBe("none");
  });

  it("assigns no Screening, score, rank, or Priority field to any candidate", () => {
    const result = run([{ feed: feedA, ok: true, xml: RSS_A }]);
    const json = JSON.stringify(result);
    for (const term of ["score", "priority", "rank", "fit", "recommendation", "conviction"]) {
      expect(json.toLowerCase()).not.toContain(term);
    }
  });

  it("strips unsafe feed HTML before it reaches a candidate", () => {
    const result = run([{ feed: feedA, ok: true, xml: RSS_A }]);
    const northwind = result.candidates.find((c) => c.name === "Northwind")!;
    expect(northwind.description ?? "").not.toContain("<script>");
    expect(northwind.description ?? "").toContain("Northwind closed a Series A");
  });

  it("filters a headline with no named company and no early-stage signal, never as a candidate", () => {
    const result = run([{ feed: feedA, ok: true, xml: RSS_A }]);
    expect(result.candidates.some((c) => c.identityConfidence === "needs_review")).toBe(false);
    expect(result.candidates.some((c) => c.name.startsWith("The market shifts"))).toBe(false);
    // Medium-utility items are filtered before entity extraction is even
    // attempted, so this lands in mediumDiscoveryUtility, not unresolvedEntity.
    expect(result.summary.filteredBuckets.mediumDiscoveryUtility).toBeGreaterThan(0);
  });

  it("rejects a funding roundup as noise rather than as a candidate", () => {
    const result = run([{ feed: feedA, ok: true, xml: RSS_A }]);
    expect(result.candidates.some((c) => c.name.includes("biggest funding rounds"))).toBe(false);
    expect(result.summary.filteredBuckets.editorialEventPromotional).toBeGreaterThan(0);
  });

  it("rejects a generic AI company with no digital-asset relevance", () => {
    const result = run([{ feed: feedA, ok: true, xml: RSS_A }]);
    expect(result.candidates.some((c) => c.name === "Mistral AI")).toBe(false);
    expect(result.summary.filteredBuckets.nonDigitalAsset).toBeGreaterThan(0);
  });

  it("exposes live-run summary counts", () => {
    const result = run([{ feed: feedA, ok: true, xml: RSS_A }]);
    expect(result.summary.sourcesFetched).toBe(1);
    expect(result.summary.itemsInspected).toBe(5);
    expect(result.summary.withinRecency).toBe(5);
    expect(result.summary.digitalAssetRelevant).toBeGreaterThan(0);
    expect(result.summary.candidateWorthinessPassed).toBeGreaterThan(0);
    expect(result.summary.entitiesResolved).toBeGreaterThan(0);
    expect(result.summary.lookbackDays).toBe(30);
  });

  it("does not count a headline as non-digital-asset merely because entity extraction failed (funnel order)", () => {
    // "The market shifts as stablecoin regulation tightens..." is digital-asset
    // relevant (matches "stablecoin") but names no company - it must land in
    // unresolvedEntity, never in nonDigitalAsset.
    const result = run([{ feed: feedA, ok: true, xml: RSS_A }]);
    expect(result.summary.digitalAssetRelevant).toBeGreaterThanOrEqual(2);
  });

  it("isolates a failed feed without losing results from the others", () => {
    const result = run([
      { feed: feedA, ok: true, xml: RSS_A },
      { feed: feedC, ok: false, error: "timeout" },
    ]);
    expect(result.status).toBe("partial_failure");
    expect(result.candidates.length).toBeGreaterThan(0);
    const failed = result.feeds.find((f) => f.feedId === "feed-c")!;
    expect(failed.ok).toBe(false);
    expect(failed.error).toBe("timeout");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("reports a fully failed run as failed", () => {
    const result = run([{ feed: feedC, ok: false, error: "network_unreachable" }]);
    expect(result.status).toBe("failed");
    expect(result.candidates).toEqual([]);
  });

  it("handles an empty feed without error", () => {
    const result = run([{ feed: feedA, ok: true, xml: "<rss><channel></channel></rss>" }]);
    expect(result.status).toBe("completed");
    expect(result.feeds[0]!.itemsInspected).toBe(0);
    expect(result.candidates).toEqual([]);
  });

  it("preserves a high-utility, digital-asset-relevant unresolved headline as a Needs Identity Review signal, not a candidate", () => {
    const result = run([{ feed: feedB, ok: true, xml: RSS_B }]);
    expect(result.candidates.some((c) => c.name.startsWith("A new stablecoin protocol"))).toBe(false);
    expect(result.summary.needsIdentityReview).toBe(1);
    const signal = result.reviewSignals[0]!;
    expect(signal.headline).toContain("stablecoin protocol");
    expect(signal.identityIssue).toBeTruthy();
    // Never a Screening or score field on a review signal.
    const json = JSON.stringify(signal).toLowerCase();
    for (const term of ["score", "priority", "rank", "fit", "recommendation", "conviction"]) {
      expect(json).not.toContain(term);
    }
  });

  it("deduplicates the same review signal seen from two different sources into one row", () => {
    const result = run([
      { feed: feedB, ok: true, xml: RSS_B },
      { feed: feedC, ok: true, xml: RSS_C },
    ]);
    const matches = result.reviewSignals.filter((r) => r.headline.startsWith("A new stablecoin protocol"));
    expect(matches).toHaveLength(1);
  });

  it("does not put a routine policy/market headline with no launch or funding signal into review", () => {
    const result = run([{ feed: feedA, ok: true, xml: RSS_A }]);
    expect(result.reviewSignals.some((r) => r.headline.startsWith("The market shifts"))).toBe(false);
  });
});

/**
 * New Candidate admission requires HIGH discovery utility (v1.0.1 correction):
 * a resolved, digital-asset-relevant entity with only MEDIUM utility (a
 * routine product launch, partnership, integration, or expansion by an
 * already-operating company) is filtered rather than surfaced, regardless of
 * relevance strength. Synthetic entities only - never a real company name -
 * so the rule is proven generic, not a blocklist for one company.
 */
const feedSingle: FeedConfig = {
  id: "single",
  name: "Single",
  publisher: "Single",
  url: "https://single.example.com/rss",
  engineId: "public-feed-discovery",
};

function runOne(title: string, summary: string) {
  const xml = `<rss><channel><item>
    <title>${title}</title>
    <link>https://single.example.com/story/</link>
    <pubDate>Wed, 03 Sep 2026 10:00:00 +0000</pubDate>
    <guid>single-1</guid>
    <description>${summary}</description>
  </item></channel></rss>`;
  return runHeadlineEngine([{ feed: feedSingle, ok: true, xml }], {
    canonicalCompanies: CANONICAL,
    now: "2026-09-08T00:00:00.000Z",
  });
}

describe("New Candidate admission requires HIGH discovery utility", () => {
  it("admits an early-stage stablecoin startup raising a seed round", () => {
    const result = runOne(
      "Meridian raises $8M seed round for stablecoin infrastructure",
      "The seed round backs a new stablecoin payments rail.",
    );
    expect(result.candidates.some((c) => c.name === "Meridian")).toBe(true);
  });

  it("admits a crypto custody company raising a Series A", () => {
    const result = runOne(
      "Vaultis raises $25M Series A for institutional crypto custody",
      "The Series A funds expansion of its crypto custody platform.",
    );
    expect(result.candidates.some((c) => c.name === "Vaultis")).toBe(true);
  });

  it("admits a new protocol launching mainnet", () => {
    const result = runOne(
      "Ferrite Protocol launches mainnet for its DeFi lending market",
      "The new protocol went live on mainnet this week.",
    );
    expect(result.candidates.some((c) => c.name === "Ferrite Protocol")).toBe(true);
  });

  it("admits an emerging ZK project emerging from stealth", () => {
    const result = runOne(
      "Proofline emerges from stealth with zero knowledge developer tooling",
      "The project spent a year building in stealth before today's reveal.",
    );
    expect(result.candidates.some((c) => c.name === "Proofline")).toBe(true);
  });

  it("does not admit an established exchange launching a routine tokenized-equities product", () => {
    const result = runOne(
      "Emberlight Exchange launches a tokenized equities trading product",
      "The exchange, which has operated for years, added tokenized stock trading to its existing platform.",
    );
    expect(result.candidates.some((c) => c.name === "Emberlight Exchange")).toBe(false);
    expect(result.summary.filteredBuckets.mediumDiscoveryUtility).toBeGreaterThan(0);
  });

  it("does not admit a digital-asset company announcing a partnership", () => {
    const result = runOne(
      "Emberlight Exchange partners with Beta Bank on stablecoin settlement",
      "The partnership integrates Beta Bank's rails with Emberlight's stablecoin desk.",
    );
    expect(result.candidates.some((c) => c.name === "Emberlight Exchange")).toBe(false);
    expect(result.summary.filteredBuckets.mediumDiscoveryUtility).toBeGreaterThan(0);
  });

  it("does not admit a digital-asset company expanding into another market", () => {
    const result = runOne(
      "Emberlight Exchange expands its crypto custody service into new markets",
      "The already-operating exchange is extending its existing custody service to more regions.",
    );
    expect(result.candidates.some((c) => c.name === "Emberlight Exchange")).toBe(false);
    expect(result.summary.filteredBuckets.mediumDiscoveryUtility).toBeGreaterThan(0);
  });

  it("admits a token price article as filtered, never a candidate", () => {
    const result = runOne(
      "Bitcoin climbs to $78,000 as crypto sits out the AI selloff",
      "Price action commentary with no company named.",
    );
    expect(result.candidates).toHaveLength(0);
  });

  it("rejects a regulatory story with no named company", () => {
    const result = runOne(
      "SEC proposes new crypto custody rule ahead of Senate hearing",
      "The rule would affect the broader industry, no company is named.",
    );
    expect(result.candidates).toHaveLength(0);
  });

  it("rejects generic AI funding with no digital-asset relevance", () => {
    const result = runOne(
      "Mistral AI raises $500M at a $6B valuation",
      "A large general AI lab raised new funding.",
    );
    expect(result.candidates).toHaveLength(0);
  });
});

/**
 * v1.0.2 recall correction: investor-first (object-target) financing
 * constructions and the two additional evidenced HIGH-utility categories
 * (strategic investment, unspecified venture financing). Synthetic entities
 * only, per section 13, so the mechanism is proven generic.
 */
describe("v1.0.2 recall correction: investor-first and additional HIGH-utility events", () => {
  it("admits the investee when an investor backs an emerging startup", () => {
    const result = runOne(
      "Acme Capital backs Ledgerforge as seed round reaches $6M",
      "The seed round funds Ledgerforge's onchain settlement network.",
    );
    expect(result.candidates.some((c) => c.name === "Ledgerforge")).toBe(true);
    expect(result.candidates.some((c) => c.name === "Acme Capital")).toBe(false);
  });

  it("admits the investee when an investor leads a round in a protocol", () => {
    const result = runOne(
      "Acme Capital leads investment in Protoflow, a new onchain analytics protocol",
      "The round backs Protoflow's launch.",
    );
    expect(result.candidates.some((c) => c.name === "Protoflow")).toBe(true);
  });

  it("admits a startup receiving a strategic investment", () => {
    const result = runOne(
      "Chainforge receives a strategic investment for its DeFi settlement layer",
      "The strategic investment backs Chainforge's growth.",
    );
    expect(result.candidates.some((c) => c.name === "Chainforge")).toBe(true);
  });

  it("admits a startup raising unspecified venture financing for a digital-asset business", () => {
    const result = runOne(
      "Ledgerforge raises a new venture financing round for its stablecoin infrastructure",
      "The venture round backs Ledgerforge's stablecoin rail.",
    );
    expect(result.candidates.some((c) => c.name === "Ledgerforge")).toBe(true);
  });
});
