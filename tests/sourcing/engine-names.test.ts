import { describe, expect, it } from "vitest";
import { canonicalEngineId, displayEngineName } from "@/lib/sourcing/engine-names";
import { buildResearchIntake } from "@/lib/sourcing/handoff";
import type { Candidate } from "@/lib/sourcing/types";

describe("engine name backward compatibility", () => {
  it("maps the retired headline-radar id and name forward", () => {
    expect(canonicalEngineId("headline-radar")).toBe("public-feed-discovery");
    expect(displayEngineName("headline-radar")).toBe("Public Feed Discovery");
    expect(displayEngineName("Headline Radar")).toBe("Public Feed Discovery");
    expect(displayEngineName("x-discovery")).toBe("X Discovery");
  });

  it("renders a v1.0.0-shaped queued candidate without the old engine name", () => {
    const legacy: Candidate = {
      id: "cand-legacy",
      name: "Northwind",
      domain: null,
      normalizedDomain: null,
      description: "A logistics startup.",
      identityConfidence: "confirmed",
      discoveredAt: "2026-01-01T00:00:00.000Z",
      provenance: [
        {
          engineId: "headline-radar",
          engineName: "Headline Radar",
          transport: "public_feed",
          feedId: "techcrunch-venture",
          feedName: "TechCrunch, Venture",
          feedUrl: "https://techcrunch.com/category/venture/feed/",
          sourceTitle: "Northwind raises $20M",
          sourceUrl: "https://techcrunch.com/x",
          sourcePublisher: "TechCrunch",
          sourcePublishedAt: "2026-01-01T00:00:00.000Z",
          discoveredAt: "2026-01-01T00:00:00.000Z",
          sourceItemId: "tc-1",
          discoveryReason: "funding announcement",
          matchedTerms: [],
        },
      ],
      existing: { companyId: null, method: "none", detail: "no canonical match" },
      relevance: "strong",
      relevanceTerms: ["crypto"],
      discoveryUtility: "high",
      category: null,
      whySurfaced: "Strong digital-asset relevance (crypto); high discovery utility; funding announcement.",
      funding: null,
    };
    const intake = buildResearchIntake(legacy, "2026-09-09T00:00:00.000Z");
    // The human-readable summary uses the current name...
    expect(intake.company.reasonSourced).toContain("Public Feed Discovery");
    expect(intake.company.reasonSourced).not.toContain("Headline Radar");
    // ...while the raw provenance record is preserved verbatim as a factual trail.
    expect(intake.discoveryProvenance[0]!.engineName).toBe("Headline Radar");
  });
});
