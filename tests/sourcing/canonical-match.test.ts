import { describe, expect, it } from "vitest";
import { loadCanonicalCompanies, __resetCanonicalCache } from "@/lib/sourcing/canonical";
import { runHeadlineEngine } from "@/lib/sourcing/engine";
import type { FeedConfig } from "@/lib/sourcing/feeds";

const feed: FeedConfig = {
  id: "t",
  name: "T",
  publisher: "T",
  url: "https://t.example.com/rss",
  engineId: "headline-radar",
};

describe("canonical corpus matching", () => {
  it("loads exactly the 39 committed companies and does not mutate them", () => {
    __resetCanonicalCache();
    const companies = loadCanonicalCompanies();
    expect(companies).toHaveLength(39);
    for (const c of companies) {
      expect(c.id).toMatch(/^co-/);
      expect(typeof c.name).toBe("string");
    }
  });

  it("recognises a news event about an existing company as already researched, not a new company", () => {
    const companies = loadCanonicalCompanies();
    const known = companies.find((c) => c.domain)!;
    const xml = `<rss><channel><item>
      <title>${known.name} raises a new round</title>
      <link>https://t.example.com/story/</link>
      <pubDate>Wed, 03 Sep 2026 10:00:00 +0000</pubDate>
      <guid>t-1</guid>
      <description>Coverage mentions ${known.domain}.</description>
    </item></channel></rss>`;

    const result = runHeadlineEngine([{ feed, ok: true, xml }], {
      canonicalCompanies: companies,
      now: "2026-09-08T00:00:00.000Z",
    });
    const candidate = result.candidates[0]!;
    expect(candidate.existing.companyId).toBe(known.id);
  });
});
