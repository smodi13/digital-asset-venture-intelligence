import { describe, expect, it } from "vitest";
import {
  classifyDiscoveryUtility,
  classifyRelevance,
  isNoiseHeadline,
  withinLookback,
} from "@/lib/sourcing/relevance";

function of(title: string, summary: string | null = null) {
  return { title, summary, categories: [] as string[] };
}

describe("classifyRelevance", () => {
  it("rejects a generic AI company as not relevant", () => {
    expect(classifyRelevance(of("Mistral AI raises $500M at a $6B valuation")).strength).toBe(
      "not_relevant",
    );
  });

  it("rejects an AI healthcare startup raising a Series B", () => {
    expect(
      classifyRelevance(of("Cadence Health, an AI healthcare startup, raises $40M Series B")).strength,
    ).toBe("not_relevant");
  });

  it("rejects a robotics company funding story", () => {
    expect(classifyRelevance(of("Atlas Robotics raises $60M to build warehouse robots")).strength).toBe(
      "not_relevant",
    );
  });

  it("accepts a seed-stage stablecoin infrastructure startup as strong", () => {
    expect(classifyRelevance(of("Meridian raises $8M seed to build stablecoin infrastructure")).strength).toBe(
      "strong",
    );
  });

  it("accepts a Series A crypto custody company as strong", () => {
    expect(classifyRelevance(of("Vaultis raises $25M Series A for institutional crypto custody")).strength).toBe(
      "strong",
    );
  });

  it("accepts a new DeFi protocol mainnet launch as strong", () => {
    expect(classifyRelevance(of("Ferrite Protocol launches mainnet for its DeFi lending market")).strength).toBe(
      "strong",
    );
  });

  it("accepts a tokenized-RWA infrastructure startup as strong", () => {
    expect(classifyRelevance(of("Landbridge launches a tokenized real-world asset platform")).strength).toBe(
      "strong",
    );
  });

  it("accepts a ZK developer tooling company as strong", () => {
    expect(classifyRelevance(of("Proofline launches zero knowledge developer tooling")).strength).toBe(
      "strong",
    );
  });

  it("accepts a DePIN compute network funding round as strong", () => {
    expect(classifyRelevance(of("Latticework raises $15M for its DePIN compute network")).strength).toBe(
      "strong",
    );
  });

  it("accepts an onchain analytics startup as strong", () => {
    expect(classifyRelevance(of("Ledgerview launches onchain analytics for institutions")).strength).toBe(
      "strong",
    );
  });

  it("treats a bare crypto-adjacent context word as weak, not strong or moderate", () => {
    expect(classifyRelevance(of("Company X raises funding for a new payments network")).strength).toBe(
      "weak",
    );
    expect(classifyRelevance(of("Company X raises funding")).strength).toBe("not_relevant");
  });

  it("does not promote two unrelated generic words to strong or moderate", () => {
    expect(classifyRelevance(of("HTTP protocol security startup raises Series A")).strength).not.toBe(
      "strong",
    );
    expect(classifyRelevance(of("HTTP protocol security startup raises Series A")).strength).not.toBe(
      "moderate",
    );
  });

  it("rejects a healthcare payments company with no crypto vocabulary", () => {
    expect(classifyRelevance(of("Healthcare payments company raises seed round")).strength).toBe("weak");
  });

  it("rejects generic AI infrastructure with no crypto vocabulary", () => {
    expect(
      classifyRelevance(of("AI infrastructure company launches developer tooling")).strength,
    ).not.toBe("strong");
    expect(
      classifyRelevance(of("AI infrastructure company launches developer tooling")).strength,
    ).not.toBe("moderate");
  });

  it("rejects a generic network security company", () => {
    expect(classifyRelevance(of("Network security company raises Series B")).strength).not.toBe("strong");
    expect(classifyRelevance(of("Network security company raises Series B")).strength).not.toBe(
      "moderate",
    );
  });

  it("rejects a generic cloud compute startup", () => {
    expect(classifyRelevance(of("Cloud compute startup raises funding")).strength).toBe("weak");
  });

  it("establishes moderate relevance for validator + network without a standalone crypto term", () => {
    expect(
      classifyRelevance(of("Latticework raises funding for its validator network")).strength,
    ).toBe("moderate");
  });

  it("establishes moderate relevance for wallet + custody without a standalone crypto term", () => {
    expect(classifyRelevance(of("Vaultis launches a wallet and custody platform")).strength).toBe(
      "moderate",
    );
  });
});

describe("classifyDiscoveryUtility", () => {
  it("rates a seed-stage launch as high utility", () => {
    expect(classifyDiscoveryUtility(of("Meridian emerges from stealth with a seed round"))).toBe("high");
  });

  it("rates a mega-cap / IPO story as low utility", () => {
    expect(
      classifyDiscoveryUtility(of("Coinbase files for an IPO after reaching public company status")),
    ).toBe("low");
  });

  it("rates a story with no signal as medium utility", () => {
    expect(classifyDiscoveryUtility(of("A blockchain protocol updated its documentation"))).toBe("medium");
  });
});

describe("isNoiseHeadline", () => {
  it("rejects event promotion", () => {
    expect(isNoiseHeadline("5 days left to exhibit at TechCrunch Disrupt")).toBe(true);
  });
  it("rejects a funding roundup listicle", () => {
    expect(isNoiseHeadline("The Week's 10 Biggest Funding Rounds in Crypto")).toBe(true);
  });
  it("rejects a moats listicle", () => {
    expect(isNoiseHeadline("The Only 2 Moats That Matter in Crypto VC")).toBe(true);
  });
  it("does not reject a real financing headline", () => {
    expect(isNoiseHeadline("Meridian raises $8M seed to build stablecoin infrastructure")).toBe(false);
  });
});

describe("withinLookback", () => {
  const now = "2026-09-08T00:00:00.000Z";
  it("keeps an item inside the window", () => {
    expect(withinLookback("2026-08-20T00:00:00.000Z", now, 30)).toBe(true);
  });
  it("filters an item outside the window", () => {
    expect(withinLookback("2026-01-01T00:00:00.000Z", now, 30)).toBe(false);
  });
  it("keeps an item with no known date", () => {
    expect(withinLookback(null, now, 30)).toBe(true);
  });
});
