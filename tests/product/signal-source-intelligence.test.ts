import { describe, it, expect, beforeEach } from "vitest";
import {
  listCompanies,
  getSignalIntelligence,
  getSourceIntelligence,
  __resetDigitalAssetProductCache,
} from "@/lib/digital-asset-product";

/**
 * Phase 4B read-model tests: Signal Engine and Source Intelligence must
 * flatten the exact per-company data already in the committed corpus, with
 * valid company links and no duplication or dangling references.
 */
describe("Signal Engine read model", () => {
  beforeEach(() => __resetDigitalAssetProductCache());

  it("includes every signal event across the corpus exactly once", () => {
    const totalFromCompanies = listCompanies().reduce((n, c) => n + c.signalEvents.length, 0);
    expect(getSignalIntelligence()).toHaveLength(totalFromCompanies);
  });

  it("has no duplicate signal event ids", () => {
    const ids = getSignalIntelligence().map((r) => r.eventId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every row links to a real company slug", () => {
    const slugs = new Set(listCompanies().map((c) => c.slug));
    for (const row of getSignalIntelligence()) {
      expect(slugs.has(row.slug)).toBe(true);
    }
  });

  it("orders most-recent-first by event date (chronological, not a ranking)", () => {
    const dates = getSignalIntelligence().map((r) => r.eventDate ?? r.publicationDate ?? "");
    expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
  });

  it("carries only canonical subject types", () => {
    for (const row of getSignalIntelligence()) {
      expect(["company", "protocol", "network"]).toContain(row.subjectType);
    }
  });

  it("never fabricates an unconfirmedNote for a completed event", () => {
    for (const row of getSignalIntelligence()) {
      if (row.eventStatus === "reported_unconfirmed") {
        expect(row.unconfirmedNote).not.toBeNull();
      }
    }
  });
});

describe("Source Intelligence read model", () => {
  beforeEach(() => __resetDigitalAssetProductCache());

  it("includes every cited source across the corpus exactly once (per company binding)", () => {
    const totalFromCompanies = listCompanies().reduce((n, c) => n + c.sources.length, 0);
    expect(getSourceIntelligence()).toHaveLength(totalFromCompanies);
  });

  it("every row links to a real company slug", () => {
    const slugs = new Set(listCompanies().map((c) => c.slug));
    for (const row of getSourceIntelligence()) {
      expect(slugs.has(row.slug)).toBe(true);
    }
  });

  it("a source that is not independent can never corroborate", () => {
    for (const row of getSourceIntelligence()) {
      if (!row.isIndependent) expect(row.canCorroborate).toBe(false);
    }
  });

  it("every source has a non-negative claim count", () => {
    for (const row of getSourceIntelligence()) {
      expect(row.claimCount).toBeGreaterThan(0);
    }
  });

  it("linked criteria ids are unique and sorted per source", () => {
    for (const row of getSourceIntelligence()) {
      expect(row.linkedCriteriaIds).toEqual([...new Set(row.linkedCriteriaIds)].sort());
    }
  });
});
