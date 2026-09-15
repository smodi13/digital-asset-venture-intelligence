import { describe, expect, it } from "vitest";
import { loadCanonicalCompanies, __resetCanonicalCache } from "@/lib/sourcing/canonical";
import { runHeadlineEngine } from "@/lib/sourcing/engine";
import type { FeedConfig } from "@/lib/sourcing/feeds";
import { listCompanies, __resetDigitalAssetProductCache } from "@/lib/digital-asset-product";

const feed: FeedConfig = {
  id: "t",
  name: "T",
  publisher: "T",
  url: "https://t.example.com/rss",
  engineId: "headline-radar",
};

describe("canonical corpus matching", () => {
  it("loads the same company count as the authoritative production product universe (44)", () => {
    __resetCanonicalCache();
    __resetDigitalAssetProductCache();
    const companies = loadCanonicalCompanies();
    const productCompanies = listCompanies();
    expect(productCompanies).toHaveLength(44);
    expect(companies).toHaveLength(productCompanies.length);
    for (const c of companies) {
      expect(typeof c.id).toBe("string");
      expect(c.id.length).toBeGreaterThan(0);
      expect(typeof c.name).toBe("string");
    }
  });

  it("exposes the product slug as the id, so an already-researched link resolves on /companies/[id]", () => {
    const companies = loadCanonicalCompanies();
    const productBySlug = new Map(listCompanies().map((c) => [c.slug, c]));
    for (const c of companies) {
      expect(productBySlug.has(c.id)).toBe(true);
    }
  });

  it("recognises a news event about an existing company as already researched, not a new company", () => {
    const companies = loadCanonicalCompanies();
    const known = companies.find((c) => c.domain)!;
    const xml = `<rss><channel><item>
      <title>${known.name} raises a new seed round for its blockchain protocol</title>
      <link>https://t.example.com/story/</link>
      <pubDate>Wed, 03 Sep 2026 10:00:00 +0000</pubDate>
      <guid>t-1</guid>
      <description>Coverage mentions ${known.domain} and its onchain infrastructure.</description>
    </item></channel></rss>`;

    const result = runHeadlineEngine([{ feed, ok: true, xml }], {
      canonicalCompanies: companies,
      now: "2026-09-08T00:00:00.000Z",
    });
    const candidate = result.candidates[0]!;
    expect(candidate.existing.companyId).toBe(known.id);

    // The default "New Candidates" view excludes anything with an existing
    // canonical match (SourcingView.tsx fMatch === "new").
    const newCandidates = result.candidates.filter((c) => !c.existing.companyId);
    expect(newCandidates.some((c) => c.id === candidate.id)).toBe(false);
  });
});
