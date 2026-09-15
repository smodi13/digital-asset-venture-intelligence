import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { loadConfig } from "@/lib/config/load";
import {
  companiesFileSchema,
  sourcesFileSchema,
  evidenceFileSchema,
  eventsFileSchema,
  headlinesFileSchema,
  companyInputSchema,
} from "@/lib/research/input-schemas";
import { hashResearchInput, runPipeline } from "@/lib/research/pipeline";
import { computeCorpusMetrics } from "@/lib/research/metrics";
import { buildSearchIndex, loadSearchIndex } from "@/lib/research/search-index";
import { reviewQueueSchema } from "@/lib/research/review";
import { loadManifest, verifyManifest } from "@/lib/domain/manifest";
import {
  companySchema,
  personSchema,
  evidenceClaimSchema,
  signalEventSchema,
  sourceRecordSchema,
  SCHEMA_VERSION,
  MAX_VERBATIM_EXCERPT_CHARS,
} from "@/lib/schemas";
import { isBacktestAdmissible } from "@/lib/backtest/cutoff";
import { walkTextFiles } from "@/lib/policy";

const ROOT = process.cwd();
// On or after the latest availabilityDate in the Batch 1 research (2026-09-02),
// and identical to scripts/research/build-corpus.ts so this test and the
// committed corpus describe the same run.
const RUN_AT = "2026-09-07T00:00:00.000Z";
const AS_OF = "2026-09-07";

function readInput<T>(file: string, schema: z.ZodType<T>): T {
  return schema.parse(yaml.load(readFileSync(join(ROOT, "research/input", file), "utf8")));
}

const input = {
  companies: readInput("companies.yaml", companiesFileSchema).companies,
  sources: readInput("sources.yaml", sourcesFileSchema).sources,
  evidence: readInput("evidence.yaml", evidenceFileSchema).evidence,
  events: readInput("events.yaml", eventsFileSchema).events,
  headlines: readInput("headlines.yaml", headlinesFileSchema).headlines,
};

const config = loadConfig();

function run() {
  return runPipeline(input, {
    config,
    researchRunAt: RUN_AT,
    researchRunId: "run-test",
    asOf: AS_OF,
  });
}

describe("research input validates", () => {
  it("every input file parses against its schema", () => {
    expect(input.companies.length).toBeGreaterThan(0);
    expect(input.sources.length).toBeGreaterThan(0);
    expect(input.evidence.length).toBeGreaterThan(0);
    expect(input.events.length).toBeGreaterThan(0);
    // headlines.yaml is empty by design: the Batch 1 handoff has no separately
    // approved headline research. The 67 curated events are the event record.
    // The headline adapter stays covered by synthetic fixtures in tests/.
    expect(Array.isArray(input.headlines)).toBe(true);
    expect(input.headlines.length).toBe(0);
  });

  it("rejects a company with no name", () => {
    expect(companyInputSchema.safeParse({ sector: "x", description: "y", reasonSourced: "z", firstObservedAt: "2025-01-01" }).success).toBe(false);
  });

  it("rejects an evidence excerpt over the 280 character cap", () => {
    const over = "x".repeat(MAX_VERBATIM_EXCERPT_CHARS + 1);
    const result = evidenceFileSchema.safeParse({
      schemaVersion: SCHEMA_VERSION,
      evidence: [
        {
          company: "acme.example",
          claim: "A claim.",
          source: "https://example.com/a",
          confidence: "medium",
          topic: "customers",
          sourceSubtype: "company_reported",
          excerpt: over,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("requires availability evidence on every event", () => {
    const result = eventsFileSchema.safeParse({
      schemaVersion: SCHEMA_VERSION,
      events: [
        {
          company: "acme.example",
          signalType: "funding",
          category: "capital",
          direction: "ambiguous",
          publicationDate: "2025-01-01",
          availabilityDate: "2025-01-01",
          source: "https://example.com/a",
          evidenceSummary: "summary",
          confidence: "medium",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("the pipeline produces a valid corpus", () => {
  const output = run();

  it("every generated record validates against its canonical schema", () => {
    for (const company of output.companies) expect(companySchema.safeParse(company).success).toBe(true);
    for (const person of output.people) expect(personSchema.safeParse(person).success).toBe(true);
    for (const source of output.sources) expect(sourceRecordSchema.safeParse(source).success).toBe(true);
    for (const claim of output.claims) expect(evidenceClaimSchema.safeParse(claim).success).toBe(true);
    for (const event of output.events) expect(signalEventSchema.safeParse(event).success).toBe(true);
  });

  it("writes only approved companies: 19 Batch 1 + 20 Batch 2", () => {
    // Only research/input records a human signed off as approved reach the corpus.
    // The gate itself (a reviewed or seeded company is held back) is proven on a
    // synthetic fixture in pipeline-synthetic.test.ts.
    expect(output.companies.length).toBe(39);
  });

  it("does not carry OpenRouter into the active company corpus", () => {
    // OpenRouter left the active universe after the Stripe acquisition
    // agreement. It is dropped at translation and must never reappear here.
    const names = output.companies.map((c) => c.name.toLowerCase());
    const domains = output.companies.map((c) => (c.domain ?? "").toLowerCase());
    expect(names).not.toContain("openrouter");
    expect(domains).not.toContain("openrouter.ai");
  });

  it("does not carry any synthetic Phase 3A company into the real corpus", () => {
    const names = output.companies.map((c) => c.name);
    for (const synthetic of [
      "Northwind Ledger",
      "Quiet Harbor Analytics",
      "Sable",
      "Harbor Atlas",
    ]) {
      expect(names).not.toContain(synthetic);
    }
    for (const company of output.companies) {
      expect(company.domain ?? "").not.toContain(".example");
    }
  });

  it("stamps every event through the ingestion boundary", () => {
    for (const event of output.events) {
      expect(event.ingestedAt).toBe(RUN_AT);
    }
  });

  it("resolves companies by domain and records the method", () => {
    const resolved = output.events.filter((e) => e.companyId !== null);
    expect(resolved.length).toBeGreaterThan(0);
    for (const event of resolved) {
      expect(event.entityMatchConfidence).toBeGreaterThanOrEqual(0.7);
    }
  });

  it("sorts every collection by id, so output is stable", () => {
    for (const collection of [output.companies, output.sources, output.claims, output.events]) {
      const ids = collection.map((r) => r.id);
      expect(ids).toEqual([...ids].sort());
    }
  });
});

describe("the review queue catches what the pipeline could not settle", () => {
  const output = run();
  const report = output.review.report({
    generatedAt: RUN_AT,
    researchRunId: "run-test",
    schemaVersion: SCHEMA_VERSION,
  });

  it("produces a valid report", () => {
    expect(reviewQueueSchema.safeParse(report).success).toBe(true);
  });

  it("surfaces the Applied Compute financing that was reported but not completed", () => {
    // Forbes reported a possible $350M round with terms explicitly not final.
    // It is kept as market information, recorded as reported_unconfirmed, and
    // routed here so a human confirms the outcome before it is ever treated as
    // capital raised.
    const financing = report.items.filter((i) => i.reason === "unconfirmed_financing");
    // Batch 1 Applied Compute, plus Batch 2 fal's March 2026 financing talks.
    expect(financing.length).toBe(2);
    expect(financing.some((i) => i.recordKey.includes("appliedcompute.com"))).toBe(true);
    expect(financing.some((i) => i.recordKey.includes("fal.ai"))).toBe(true);
  });

  it("keeps every reported_unconfirmed event out of the completed-financing record", () => {
    const unconfirmed = output.events.filter((e) => e.eventStatus === "reported_unconfirmed");
    expect(unconfirmed.length).toBeGreaterThan(0);
    for (const event of unconfirmed) {
      expect(event.unconfirmedNote).not.toBeNull();
      // Still ambiguous, never converted to positive momentum.
      expect(event.signalDirection).toBe("ambiguous");
    }
  });

  it("gives every item actionable guidance", () => {
    for (const item of report.items) {
      expect(item.guidance.length).toBeGreaterThan(10);
    }
  });

  it("orders items deterministically", () => {
    const second = run().review.report({
      generatedAt: RUN_AT,
      researchRunId: "run-test",
      schemaVersion: SCHEMA_VERSION,
    });
    expect(JSON.stringify(second)).toBe(JSON.stringify(report));
  });
});

describe("reproducibility", () => {
  it("the same input and config produce an identical corpus", () => {
    const a = run();
    const b = run();
    expect(JSON.stringify(b.companies)).toBe(JSON.stringify(a.companies));
    expect(JSON.stringify(b.claims)).toBe(JSON.stringify(a.claims));
    expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
    expect(JSON.stringify(b.sources)).toBe(JSON.stringify(a.sources));
  });

  it("the research input hash is stable and order independent within a record", () => {
    expect(hashResearchInput(input)).toBe(hashResearchInput(input));
  });

  it("a different run timestamp changes only the ingestion stamp", () => {
    const later = runPipeline(input, {
      config,
      researchRunAt: "2027-01-01T00:00:00.000Z",
      researchRunId: "run-test",
      asOf: "2027-01-01",
    });
    const base = run();
    expect(later.events.map((e) => e.id)).toEqual(base.events.map((e) => e.id));
    expect(later.events[0]?.ingestedAt).not.toBe(base.events[0]?.ingestedAt);
  });

  it("a later ingestion does not change backtest admissibility", () => {
    const later = runPipeline(input, {
      config,
      researchRunAt: "2027-01-01T00:00:00.000Z",
      researchRunId: "run-test",
      asOf: "2027-01-01",
    });
    const base = run();
    expect(later.events.filter(isBacktestAdmissible).length).toBe(
      base.events.filter(isBacktestAdmissible).length,
    );
  });
});

describe("metrics", () => {
  const output = run();
  const metrics = computeCorpusMetrics({
    companies: output.companies,
    peopleCount: output.people.length,
    sources: output.sources,
    claims: output.claims,
    events: output.events,
    snapshotCount: 0,
    reviewQueueCount: output.review.size,
    sourcesConfig: config.sources,
    asOf: "2026-01-01",
    staleThresholdDays: 365,
  });

  it("counts the corpus", () => {
    expect(metrics.counts.companies).toBe(output.companies.length);
    expect(metrics.counts.evidenceClaims).toBe(output.claims.length);
    expect(metrics.counts.signalEvents).toBe(output.events.length);
  });

  it("computes a backtest admissibility rate", () => {
    expect(metrics.backtestAdmissibility.totalEvents).toBe(output.events.length);
    expect(metrics.backtestAdmissibility.historicalAdmissibilityRate).toBeGreaterThan(0);
    expect(metrics.backtestAdmissibility.historicalAdmissibilityRate).toBeLessThanOrEqual(1);
  });

  it("breaks admissibility down by source type", () => {
    const breakdown = metrics.backtestAdmissibility.bySourceType;
    expect(Object.keys(breakdown).length).toBeGreaterThan(0);
    for (const bucket of Object.values(breakdown)) {
      expect(bucket.admissible).toBeLessThanOrEqual(bucket.total);
    }
  });

  it("counts historical admissibility from established availability alone", () => {
    // Every Batch 1 event carries an intrinsic source timestamp, so all 67 are
    // historically admissible in principle. The negative case (a null
    // availability date is never admissible) is proven on a synthetic fixture
    // in availability.test.ts.
    const established = output.events.filter((e) => e.availabilityDate !== null);
    expect(established.length).toBe(output.events.length);
    expect(metrics.backtestAdmissibility.historicallyAdmissibleEvents).toBe(established.length);
  });

  it("does not credit a first-party source as independent corroboration", () => {
    expect(metrics.evidenceCoverage.companiesWithTwoIndependentSources).toBeLessThanOrEqual(
      metrics.evidenceCoverage.companiesWithPrimarySource,
    );
  });

  it("is deterministic", () => {
    const again = computeCorpusMetrics({
      companies: output.companies,
      peopleCount: output.people.length,
      sources: output.sources,
      claims: output.claims,
      events: output.events,
      snapshotCount: 0,
      reviewQueueCount: output.review.size,
      sourcesConfig: config.sources,
      asOf: "2026-01-01",
      staleThresholdDays: 365,
    });
    expect(JSON.stringify(again)).toBe(JSON.stringify(metrics));
  });
});

describe("search index", () => {
  const output = run();
  const index = buildSearchIndex(
    {
      companies: output.companies,
      people: output.people,
      claims: output.claims,
      events: output.events,
    },
    SCHEMA_VERSION,
  );

  it("indexes every record kind", () => {
    expect(index.documentCount).toBe(
      output.companies.length + output.people.length + output.claims.length + output.events.length,
    );
  });

  it("is byte-identical across builds from the same corpus", () => {
    const again = buildSearchIndex(
      {
        companies: output.companies,
        people: output.people,
        claims: output.claims,
        events: output.events,
      },
      SCHEMA_VERSION,
    );
    expect(JSON.stringify(again)).toBe(JSON.stringify(index));
  });

  const firstCompany = (results: ReadonlyArray<Record<string, unknown>>) =>
    results.find((r) => r.kind === "company") as
      | { kind: string; companyId: string | null }
      | undefined;

  it("indexes all 19 active Batch 1 companies", () => {
    const engine = loadSearchIndex(index);
    for (const name of [
      "Mintlify", "Dust", "LlamaIndex", "CrewAI", "E2B", "Crosby", "Arcade.dev",
      "Pace", "Resend", "Retell AI", "Serval", "Granola", "Gamma", "Applied Compute",
      "Modal", "Linear", "Wispr Flow", "turbopuffer", "Browserbase",
    ]) {
      const hit = firstCompany(engine.search(name));
      expect(hit, `no company result for ${name}`).toBeDefined();
    }
  });

  it("finds Gamma first among companies", () => {
    const engine = loadSearchIndex(index);
    expect(firstCompany(engine.search("Gamma"))?.companyId).toBe("co-gamma-app");
  });

  it("finds Linear first among companies", () => {
    const engine = loadSearchIndex(index);
    expect(firstCompany(engine.search("Linear"))?.companyId).toBe("co-linear-app");
  });

  it("ranks Pace top for insurance operations", () => {
    const engine = loadSearchIndex(index);
    expect(engine.search("insurance operations")[0]?.companyId).toBe("co-withpace-com");
  });

  it("ranks Resend top for email infrastructure", () => {
    const engine = loadSearchIndex(index);
    expect(engine.search("email infrastructure")[0]?.companyId).toBe("co-resend-com");
  });

  it("surfaces the voice AI companies for a voice AI query", () => {
    const engine = loadSearchIndex(index);
    const top = engine.search("voice AI").slice(0, 3).map((r) => r.companyId);
    expect(top).toContain("co-retellai-com");
    expect(top).toContain("co-wisprflow-ai");
  });

  it("tolerates a typo through fuzzy matching", () => {
    const engine = loadSearchIndex(index);
    expect(firstCompany(engine.search("Mintlfy"))?.companyId).toBe("co-mintlify-com");
  });

  it("returns nothing for a term absent from the corpus", () => {
    const engine = loadSearchIndex(index);
    expect(engine.search("zzzznonexistentzzzz").length).toBe(0);
    expect(engine.search("OpenRouter").length).toBe(0);
  });
});

describe("the committed corpus on disk", () => {
  it("exists and verifies against its manifest", () => {
    const manifest = loadManifest(ROOT);
    const result = verifyManifest(manifest, ROOT);
    expect(result.ok, JSON.stringify(result.problems)).toBe(true);
    expect(result.checked).toBeGreaterThan(5);
  });

  it("carries research run metadata tying it to its input", () => {
    const companies = JSON.parse(
      readFileSync(join(ROOT, "data/generated/companies.json"), "utf8"),
    ) as Record<string, unknown>;
    for (const field of [
      "researchRunId",
      "generatedAt",
      "schemaVersion",
      "thesisConfigHash",
      "signalConfigHash",
      "sourceConfigHash",
      "researchInputHash",
      "recordCount",
    ]) {
      expect(companies[field], `missing ${field}`).toBeDefined();
    }
  });

  it("writes every expected output file", () => {
    for (const name of [
      "companies.json",
      "people.json",
      "sources.json",
      "evidence.json",
      "signal-events.json",
      "snapshots.json",
      "search-index.json",
      "research-summary.json",
      "review-queue.json",
      "MANIFEST.json",
    ]) {
      expect(existsSync(join(ROOT, "data/generated", name)), name).toBe(true);
    }
  });

  it("contains no personal identity fields", () => {
    const generated = walkTextFiles(ROOT).filter((f) => f.path.startsWith("data/generated/"));
    for (const file of generated) {
      // Trailing colon: a JSON key, not a lexical token. search-index.json holds
      // the vocabulary word "email" from a company selling email infrastructure.
      for (const field of ['"username":', '"author_id":', '"followers_count":', '"email":']) {
        expect(file.text.includes(field), `${field} in ${file.path}`).toBe(false);
      }
    }
  });
});

describe("no script constructs a SignalEvent outside the ingestion boundary", () => {
  it("only lib/domain/ingest.ts references the schema constructor directly", () => {
    const files = walkTextFiles(ROOT, { extensions: [".ts"] });
    const offenders = files.filter(
      (file) =>
        /signalEventSchema\s*\.\s*parse\(/.test(file.text) &&
        file.path !== "lib/domain/ingest.ts" &&
        !file.path.startsWith("tests/"),
    );
    expect(offenders.map((f) => f.path)).toEqual([]);
  });
});
