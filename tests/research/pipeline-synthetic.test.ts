import { describe, it, expect } from "vitest";
import { loadConfig } from "@/lib/config/load";
import {
  companiesFileSchema,
  sourcesFileSchema,
  evidenceFileSchema,
  eventsFileSchema,
  headlinesFileSchema,
} from "@/lib/research/input-schemas";
import { runPipeline } from "@/lib/research/pipeline";
import { SCHEMA_VERSION } from "@/lib/schemas";

/**
 * Pipeline behaviour on synthetic scenarios.
 *
 * The real Batch 1 corpus (tests/research/corpus.test.ts) is a clean data set:
 * every company is approved, every founding year is disclosed, and no two
 * claims contradict. The pipeline still has to handle the opposite of each,
 * and this file proves it does, on a small synthetic input that never touches
 * research/input or data/generated.
 */

const config = loadConfig();
const RUN_AT = "2026-09-07T00:00:00.000Z";

function build() {
  const companies = companiesFileSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    companies: [
      {
        name: "Approved Co",
        domain: "approved.example",
        sector: "Test",
        description: "An approved synthetic company.",
        reasonSourced: "Synthetic fixture.",
        researchStatus: "approved",
        firstObservedAt: "2026-01-01",
        foundingYear: 2021,
      },
      {
        name: "Reviewed Co",
        domain: "reviewed.example",
        sector: "Test",
        description: "A reviewed synthetic company, not signed off.",
        reasonSourced: "Synthetic fixture.",
        researchStatus: "reviewed",
        firstObservedAt: "2026-01-01",
        foundingYear: 2020,
      },
      {
        name: "Undated Co",
        domain: "undated.example",
        sector: "Test",
        description: "An approved company whose founding year is not disclosed.",
        reasonSourced: "Synthetic fixture.",
        researchStatus: "approved",
        firstObservedAt: "2026-01-01",
        foundingYear: null,
      },
    ],
  });

  const sources = sourcesFileSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sources: [
      {
        url: "https://approved.example/a",
        publisher: "Approved Co",
        title: "Company statement A",
        sourceType: "official_company",
        publishedAt: "2026-02-01",
      },
      {
        url: "https://news.example/b",
        publisher: "Example News",
        title: "Independent report B",
        sourceType: "independent_journalism",
        publishedAt: "2026-02-02",
      },
    ],
  });

  const evidence = evidenceFileSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    evidence: [
      {
        company: "approved.example",
        claim: "Approved Co reported 100 employees.",
        source: "https://approved.example/a",
        confidence: "medium",
        topic: "team",
        provenance: "sourced",
        sourceSubtype: "company_reported",
      },
      {
        company: "approved.example",
        claim: "An external report put Approved Co at 60 employees.",
        source: "https://news.example/b",
        confidence: "medium",
        topic: "team",
        provenance: "sourced",
        sourceSubtype: "third_party_estimate",
        contradictsClaims: ["Approved Co reported 100 employees."],
      },
    ],
  });

  const events = eventsFileSchema.parse({ schemaVersion: SCHEMA_VERSION, events: [] });
  const headlines = headlinesFileSchema.parse({ schemaVersion: SCHEMA_VERSION, headlines: [] });

  return runPipeline(
    { companies: companies.companies, sources: sources.sources, evidence: evidence.evidence, events: events.events, headlines: headlines.headlines },
    { config, researchRunAt: RUN_AT, researchRunId: "run-synth", asOf: "2026-09-07" },
  );
}

describe("the research-status gate", () => {
  const output = build();

  it("writes an approved company and holds back a reviewed one", () => {
    const names = output.companies.map((c) => c.name);
    expect(names).toContain("Approved Co");
    expect(names).not.toContain("Reviewed Co");
    expect(output.excludedCompanies).toBeGreaterThan(0);
  });
});

describe("an undisclosed founding year", () => {
  const output = build();

  it("is recorded as unknown rather than guessed", () => {
    const undated = output.companies.find((c) => c.domain === "undated.example");
    expect(undated?.foundedYear.provenance).toBe("unknown");
    expect(undated?.foundedYear.value).toBeNull();
  });
});

describe("two contradicting claims", () => {
  const output = build();

  it("are linked symmetrically and neither is deleted", () => {
    const contradicting = output.claims.filter((c) => c.contradicts.length > 0);
    expect(contradicting.length).toBeGreaterThan(0);
    for (const claim of contradicting) {
      for (const otherId of claim.contradicts) {
        const other = output.claims.find((c) => c.id === otherId);
        expect(other, `contradicted claim ${otherId} was deleted`).toBeDefined();
        expect(other?.contradictedBy).toContain(claim.id);
      }
    }
  });

  it("raise a review item that keeps both", () => {
    const report = output.review.report({
      generatedAt: RUN_AT,
      researchRunId: "run-synth",
      schemaVersion: SCHEMA_VERSION,
    });
    expect(report.items.some((i) => i.reason === "contradictory_claim")).toBe(true);
  });
});
