import { describe, expect, it } from "vitest";
import { parseFeed } from "@/lib/sourcing/parse";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Example Feed</title>
  <item>
    <title>Northwind raises $20M to automate logistics</title>
    <link>https://news.example.com/northwind-raises-20m/</link>
    <pubDate>Wed, 03 Sep 2026 04:01:00 +0000</pubDate>
    <guid isPermaLink="false">https://news.example.com/?p=1</guid>
    <description><![CDATA[<p>Northwind, a <b>supply chain</b> startup, closed a Series A. See northwind.io for more.</p>]]></description>
    <category><![CDATA[Venture]]></category>
    <category><![CDATA[Logistics]]></category>
  </item>
  <item>
    <title>Weekly roundup: the 10 biggest rounds</title>
    <link>https://news.example.com/roundup/</link>
    <pubDate>not a date</pubDate>
    <description>A summary of the week.</description>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Example</title>
  <entry>
    <title>Beacon Labs launches its inference platform</title>
    <link rel="alternate" href="https://atom.example.com/beacon-labs/"/>
    <id>tag:atom.example.com,2026:1</id>
    <published>2026-09-01T12:00:00Z</published>
    <summary>Beacon Labs came out of stealth today.</summary>
    <category term="AI"/>
  </entry>
</feed>`;

describe("parseFeed", () => {
  it("parses RSS items, decodes entities, strips HTML, and normalises dates", () => {
    const { items } = parseFeed(RSS);
    expect(items).toHaveLength(2);
    const first = items[0]!;
    expect(first.title).toBe("Northwind raises $20M to automate logistics");
    expect(first.link).toBe("https://news.example.com/northwind-raises-20m/");
    expect(first.publishedAt).toBe("2026-09-03T04:01:00.000Z");
    expect(first.id).toBe("https://news.example.com/?p=1");
    expect(first.summary).not.toContain("<");
    expect(first.summary).toContain("northwind.io");
    expect(first.categories).toEqual(["Venture", "Logistics"]);
  });

  it("keeps an item whose date is unparseable, with a null date", () => {
    const { items } = parseFeed(RSS);
    expect(items[1]!.publishedAt).toBeNull();
    expect(items[1]!.id).toBe("https://news.example.com/roundup/");
  });

  it("parses Atom entries with href links and term categories", () => {
    const { items } = parseFeed(ATOM);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Beacon Labs launches its inference platform");
    expect(items[0]!.link).toBe("https://atom.example.com/beacon-labs/");
    expect(items[0]!.publishedAt).toBe("2026-09-01T12:00:00.000Z");
    expect(items[0]!.categories).toEqual(["AI"]);
  });

  it("returns no items for malformed or empty input rather than throwing", () => {
    expect(parseFeed("").items).toEqual([]);
    expect(parseFeed("<rss><channel><item><title>").items).toEqual([]);
    expect(parseFeed("<html><body>not a feed</body></html>").items).toEqual([]);
  });

  it("never emits raw HTML in any text field", () => {
    const { items } = parseFeed(RSS);
    for (const item of items) {
      expect(item.title).not.toMatch(/<[a-z]/i);
      expect(item.summary ?? "").not.toMatch(/<[a-z]/i);
    }
  });
});
