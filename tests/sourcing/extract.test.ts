import { describe, expect, it } from "vitest";
import { extractCandidate } from "@/lib/sourcing/extract";
import type { FeedItem } from "@/lib/sourcing/parse";

function item(partial: Partial<FeedItem>): FeedItem {
  return {
    title: "",
    link: null,
    publishedAt: null,
    id: "x",
    summary: null,
    categories: [],
    ...partial,
  };
}

describe("extractCandidate", () => {
  it("extracts the company from a financing headline with high confidence", () => {
    const e = extractCandidate(item({ title: "Northwind raises $20M to automate logistics" }))!;
    expect(e.name).toBe("Northwind");
    expect(e.identityConfidence).toBe("confirmed");
    expect(e.discoveryReason).toBe("funding announcement");
  });

  it("strips a leading sector descriptor", () => {
    const e = extractCandidate(
      item({ title: "Nuclear startup Bluecore Energy raises $50M seed round" }),
    )!;
    expect(e.name).toBe("Bluecore Energy");
    expect(e.identityConfidence).toBe("confirmed");
  });

  it("handles 'reportedly' by cutting before it", () => {
    const e = extractCandidate(item({ title: "Crusoe reportedly raises $3B at a $30B valuation" }))!;
    expect(e.name).toBe("Crusoe");
  });

  it("marks a headline with no recognisable pattern as needs_review", () => {
    const e = extractCandidate(
      item({ title: "The week in venture: what the latest data tells us about the market" }),
    )!;
    expect(e.identityConfidence).toBe("needs_review");
  });

  it("does not turn arbitrary lowercase nouns into a company", () => {
    const e = extractCandidate(item({ title: "the market shifts as interest rates climb" }))!;
    expect(e.identityConfidence).toBe("needs_review");
  });

  it("only claims a domain when the feed metadata carries a bare domain", () => {
    const withDomain = extractCandidate(
      item({ title: "Beacon Labs launches", summary: "More at beaconlabs.ai today." }),
    )!;
    expect(withDomain.domain).toBe("beaconlabs.ai");
    const withoutDomain = extractCandidate(item({ title: "Beacon Labs launches its platform" }))!;
    expect(withoutDomain.domain).toBeNull();
  });

  it("never invents a description", () => {
    const e = extractCandidate(item({ title: "Northwind raises $20M" }))!;
    expect(e.description).toBeNull();
  });

  describe("crypto-native headline structures (recall correction)", () => {
    it("strips a sector-plus-startup prefix before a financing verb", () => {
      const e = extractCandidate(item({ title: "Stablecoin startup AcmePay raises $8M seed round" }))!;
      expect(e.name).toBe("AcmePay");
      expect(e.identityConfidence).toBe("confirmed");
    });

    it("extracts the subject when the sector word trails the verb instead of leading it", () => {
      const e = extractCandidate(
        item({ title: "AcmePay raises $8M to build stablecoin infrastructure" }),
      )!;
      expect(e.name).toBe("AcmePay");
      expect(e.identityConfidence).toBe("confirmed");
    });

    it("strips a bare label word directly in front of the entity name", () => {
      const e = extractCandidate(item({ title: "Protocol Nova launches mainnet after $6M seed" }))!;
      expect(e.name).toBe("Nova");
      expect(e.identityConfidence).toBe("confirmed");
      expect(e.discoveryReason).toBe("product or company launch");
    });

    it("strips a two-word technical descriptor before a platform/startup noun", () => {
      const e = extractCandidate(
        item({ title: "ZK developer platform ProofWorks emerges from stealth" }),
      )!;
      expect(e.name).toBe("ProofWorks");
      expect(e.identityConfidence).toBe("confirmed");
    });

    it("strips an onchain-data sector prefix before a startup noun", () => {
      const e = extractCandidate(item({ title: "Onchain data startup ChainScope secures Series A" }))!;
      expect(e.name).toBe("ChainScope");
      expect(e.identityConfidence).toBe("confirmed");
    });

    it("strips a DePIN network prefix", () => {
      const e = extractCandidate(
        item({ title: "DePIN network MeshGrid closes $12M funding round" }),
      )!;
      expect(e.name).toBe("MeshGrid");
      expect(e.identityConfidence).toBe("confirmed");
    });

    it("strips a custody startup prefix before an unveil verb", () => {
      const e = extractCandidate(
        item({ title: "Custody startup KeyVault unveils institutional wallet platform" }),
      )!;
      expect(e.name).toBe("KeyVault");
      expect(e.identityConfidence).toBe("confirmed");
    });
  });

  describe("false candidates: no company/protocol named", () => {
    const falseHeadlines = [
      "Bitcoin rises 8% as traders eye Fed",
      "SEC proposes new crypto custody rule",
      "Here is what happened in crypto today",
      "10 tokens to watch this week",
      "Ethereum ETF flows hit record",
      "CoinDesk Consensus tickets on sale",
    ];

    for (const title of falseHeadlines) {
      it(`marks "${title}" as needs_review rather than a resolved company`, () => {
        const e = extractCandidate(item({ title }))!;
        expect(e.identityConfidence).toBe("needs_review");
      });
    }
  });
});
