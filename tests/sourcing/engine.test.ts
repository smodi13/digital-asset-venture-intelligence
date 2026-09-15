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
    <title>Northwind raises $20M to automate logistics</title>
    <link>https://a.example.com/northwind/</link>
    <pubDate>Wed, 03 Sep 2026 10:00:00 +0000</pubDate>
    <guid>a-northwind-1</guid>
    <description><![CDATA[<script>alert(1)</script>Northwind closed a Series A.]]></description>
    <category>Venture</category>
  </item>
  <item>
    <title>Acme raises $100M Series C</title>
    <link>https://a.example.com/acme/</link>
    <pubDate>Tue, 02 Sep 2026 10:00:00 +0000</pubDate>
    <guid>a-acme-1</guid>
    <description>Acme, at acme.com, announced new funding.</description>
  </item>
  <item>
    <title>The 10 biggest funding rounds this week</title>
    <link>https://a.example.com/roundup/</link>
    <pubDate>Mon, 01 Sep 2026 10:00:00 +0000</pubDate>
    <guid>a-roundup-1</guid>
    <description>A weekly summary.</description>
  </item>
</channel></rss>`;

const RSS_B = `<rss><channel>
  <item>
    <title>Northwind lands $20M in fresh capital</title>
    <link>https://b.example.com/northwind/</link>
    <pubDate>Wed, 03 Sep 2026 14:00:00 +0000</pubDate>
    <guid>b-northwind-1</guid>
    <description>Coverage of the Northwind round.</description>
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
    expect(result.feeds[0]!.itemsInspected).toBe(3);
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

  it("marks an unresolvable headline as needs_review rather than guessing", () => {
    const result = run([{ feed: feedA, ok: true, xml: RSS_A }]);
    const roundup = result.candidates.find((c) => c.identityConfidence === "needs_review");
    expect(roundup).toBeDefined();
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
});
