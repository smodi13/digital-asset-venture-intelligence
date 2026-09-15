import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * Route / information-architecture guard for Phase 4A productization, where
 * Partner Home became the root page and Sourcing Worklist lives at /worklist.
 * These are source-level assertions (not rendered-DOM snapshots):
 * implementation-aware enough to catch a real regression, loose enough not to
 * break on copy edits.
 */
function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");
}

describe("root page is Partner Home", () => {
  const page = read("app/page.tsx");

  it("renders Partner Home data, not the legacy SourcingView", () => {
    expect(page).toMatch(/getPartnerHomeData/);
    expect(page).not.toMatch(/<SourcingView\b/);
  });

  it("titles the tab as Partner Home", () => {
    expect(page).toMatch(/title:\s*"Partner Home[^"]*"/);
  });
});

describe("/worklist renders the Sourcing Worklist", () => {
  const page = read("app/worklist/page.tsx");

  it("renders ProductWorklistView", () => {
    expect(page).toMatch(/<ProductWorklistView\b/);
  });
});

describe("Phase 4B routes exist", () => {
  it("/signals renders the Signal Engine", () => {
    const page = read("app/signals/page.tsx");
    expect(page).toMatch(/getSignalIntelligence/);
    expect(page).toMatch(/<SignalEngineView\b/);
  });

  it("/sources renders Source Intelligence", () => {
    const page = read("app/sources/page.tsx");
    expect(page).toMatch(/getSourceIntelligence/);
    expect(page).toMatch(/<SourceIntelligenceView\b/);
  });
});

describe("Methodology reflects v7, not v6", () => {
  const page = read("app/methodology/page.tsx");

  it("sources v7 digital-asset scoring config, not the legacy v6 screening module", () => {
    expect(page).toMatch(/lib\/scoring\/digital-asset\//);
    expect(page).not.toMatch(/lib\/scoring\/screening["']/);
    expect(page).not.toMatch(/lib\/screening-read/);
  });

  it("explains mandate and rank separation without exposing cohort membership as navigation", () => {
    expect(page).toMatch(/Mandate is separate/);
    expect(page).toMatch(/Rank eligibility is separate/);
    expect(page).not.toMatch(/CALIBRATION|VALIDATION|FINAL_TEST/);
  });
});

describe("/sourcing renders the Sourcing Engine", () => {
  const page = read("app/sourcing/page.tsx");

  it("renders SourcingView, not a redirect", () => {
    expect(page).toMatch(/<SourcingView\b/);
    expect(page).not.toMatch(/permanentRedirect/);
  });
});

describe("Phase 4C routes exist", () => {
  it("/market-map renders the Market Map", () => {
    const page = read("app/market-map/page.tsx");
    expect(page).toMatch(/getMarketMap/);
    expect(page).toMatch(/<MarketMapView\b/);
  });

  it("/radar renders the Follow-On Radar", () => {
    const page = read("app/radar/page.tsx");
    expect(page).toMatch(/getSourcingWorklist/);
    expect(page).toMatch(/<RadarView\b/);
  });

  it("/relationships renders Relationship Intelligence", () => {
    const page = read("app/relationships/page.tsx");
    expect(page).toMatch(/getRelationshipIntelligence/);
    expect(page).toMatch(/<RelationshipIntelligenceView\b/);
  });
});

describe("primary navigation", () => {
  const nav = read("components/NavLinks.tsx");

  it("orders items Partner Home, Sourcing Engine, Sourcing Worklist, Signal Engine, Source Intelligence, Market Map, Follow-On Radar, Relationship Intelligence, Companies, Methodology", () => {
    const labels = [...nav.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toEqual([
      "Partner Home",
      "Sourcing Engine",
      "Sourcing Worklist",
      "Signal Engine",
      "Source Intelligence",
      "Market Map",
      "Follow-On Radar",
      "Relationship Intelligence",
      "Companies",
      "Methodology",
    ]);
  });

  it("points Partner Home at /, Sourcing Engine at /sourcing, and Sourcing Worklist at /worklist", () => {
    expect(nav).toMatch(/href:\s*"\/"\s*,\s*label:\s*"Partner Home"/);
    expect(nav).toMatch(/href:\s*"\/sourcing"\s*,\s*label:\s*"Sourcing Engine"/);
    expect(nav).toMatch(/href:\s*"\/worklist"\s*,\s*label:\s*"Sourcing Worklist"/);
  });

  it("does not list cohort labels as navigable modules", () => {
    expect(nav).not.toMatch(/CALIBRATION|VALIDATION|FINAL_TEST/);
  });
});

describe("Company Detail breadcrumb", () => {
  const detail = read("components/company/ProductCompanyDetail.tsx");

  it("links the Sourcing Worklist crumb to /worklist", () => {
    expect(detail).toMatch(/<Link href="\/worklist"[^>]*>\s*Sourcing Worklist/);
  });
});
