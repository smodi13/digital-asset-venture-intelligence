import { describe, expect, it } from "vitest";
import { buildResearchIntake } from "@/lib/sourcing/handoff";
import type { Candidate } from "@/lib/sourcing/types";

const candidate: Candidate = {
  id: "cand-abc",
  name: "Northwind",
  domain: "northwind.io",
  normalizedDomain: "northwind.io",
  description: "Northwind closed a Series A.",
  identityConfidence: "confirmed",
  discoveredAt: "2026-09-08T00:00:00.000Z",
  provenance: [
    {
      engineId: "headline-radar",
      engineName: "Headline Radar",
      transport: "public_feed",
      feedId: "feed-a",
      feedName: "Feed A",
      feedUrl: "https://feed-a.example.com/rss",
      sourceTitle: "Northwind raises $20M",
      sourceUrl: "https://a.example.com/northwind/",
      sourcePublisher: "Publisher A",
      sourcePublishedAt: "2026-09-03T10:00:00.000Z",
      discoveredAt: "2026-09-08T00:00:00.000Z",
      sourceItemId: "a-1",
      discoveryReason: "funding announcement",
      matchedTerms: ["Venture"],
    },
    {
      engineId: "headline-radar",
      engineName: "Headline Radar",
      transport: "public_feed",
      feedId: "feed-b",
      feedName: "Feed B",
      feedUrl: "https://feed-b.example.com/rss",
      sourceTitle: "Northwind lands $20M",
      sourceUrl: "https://b.example.com/northwind/",
      sourcePublisher: "Publisher B",
      sourcePublishedAt: "2026-09-03T14:00:00.000Z",
      discoveredAt: "2026-09-08T00:00:00.000Z",
      sourceItemId: "b-1",
      discoveryReason: "funding announcement",
      matchedTerms: [],
    },
  ],
  existing: { companyId: null, method: "none", detail: "no canonical match" },
};

describe("buildResearchIntake", () => {
  const payload = buildResearchIntake(candidate, "2026-09-08T12:00:00.000Z");

  it("carries the candidate identity, domain, and every discovery provenance record", () => {
    expect(payload.company.name).toBe("Northwind");
    expect(payload.company.domain).toBe("northwind.io");
    expect(payload.discoveryProvenance).toHaveLength(2);
    expect(payload.company.sourceUrls).toEqual([
      "https://a.example.com/northwind/",
      "https://b.example.com/northwind/",
    ]);
    expect(payload.company.firstObservedAt).toBe("2026-09-03");
  });

  it("produces source stubs for each distinct discovery source", () => {
    expect(payload.sources).toHaveLength(2);
    expect(payload.sources[0]!.title).toBe("Northwind raises $20M");
    expect(payload.sources[0]!.publishedAt).toBe("2026-09-03");
  });

  it("does not fabricate research fields", () => {
    expect(payload.company.researchStatus).toBe("seeded");
    expect(payload.company.founders).toEqual([]);
    expect(payload.company.knownInvestors).toEqual([]);
    expect(payload.company.foundingYear).toBeNull();
    expect(payload.company.sector).toBeNull();
    expect(payload.company.stage).toBe("unknown");
    const json = JSON.stringify(payload).toLowerCase();
    for (const term of ["evidenceclaim", "signalevent", "screening", "score", "fit"]) {
      expect(json).not.toContain(term);
    }
  });

  it("flags an unconfirmed identity in notes", () => {
    const unsure = buildResearchIntake(
      { ...candidate, identityConfidence: "needs_review" },
      "2026-09-08T12:00:00.000Z",
    );
    expect(unsure.company.notes.toLowerCase()).toContain("not established");
  });
});
