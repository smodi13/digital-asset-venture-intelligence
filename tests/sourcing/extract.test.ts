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
});
