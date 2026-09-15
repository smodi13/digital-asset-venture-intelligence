/**
 * The research corpus generator.
 *
 * Reads research/input, produces data/generated. Humans edit the first;
 * nothing edits the second by hand.
 *
 * Run with:  npm run research
 *
 * REPRODUCIBILITY
 *
 * The run timestamp is an input, not a clock read, so the same research input
 * and the same configuration always produce a byte-identical corpus. That is
 * what makes the manifest hash meaningful and what lets an approved corpus be
 * regenerated exactly.
 *
 * This uses the research-build boundary established in Phase 2.1: the
 * production ingestion constructor still reads the clock and still accepts no
 * timestamp argument. Only the reproducible-build path supplies one, and it is
 * the deliberately named fixture entry point. The production semantics are
 * untouched.
 *
 * Override the stamp for a fresh run with RESEARCH_RUN_AT, for example:
 *   RESEARCH_RUN_AT=2026-06-01T00:00:00.000Z npm run research
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { SCHEMA_VERSION } from "@/lib/schemas/common";
import { loadConfig } from "@/lib/config/load";
import { stableHash } from "@/lib/hash/canonical";
import {
  buildManifestEntry,
  manifestSchema,
  MANIFEST_PATH,
  type ManifestEntry,
} from "@/lib/domain/manifest";
import {
  companiesFileSchema,
  sourcesFileSchema,
  evidenceFileSchema,
  eventsFileSchema,
  headlinesFileSchema,
} from "@/lib/research/input-schemas";
import { hashResearchInput, runPipeline } from "@/lib/research/pipeline";
import { computeCorpusMetrics } from "@/lib/research/metrics";
import { buildSearchIndex } from "@/lib/research/search-index";
import { findLocalPaths, findSecrets, findEmDashes } from "@/lib/policy/rules";

const ROOT = process.cwd();
const INPUT_DIR = join(ROOT, "research", "input");
const OUTPUT_DIR = "data/generated";
const GENERATOR = "scripts/research/build-corpus.ts";

/**
 * The committed research-build timestamp. Overridable for a fresh run.
 *
 * Must fall on or after the latest availabilityDate in the input: information
 * cannot be ingested before it was publicly available, and the schema enforces
 * that. A run stamp earlier than a source's demonstrated availability is a
 * genuine inconsistency, not a nuisance, and the build reports it.
 */
const RESEARCH_RUN_AT =
  process.env.RESEARCH_RUN_AT ?? "2026-09-07T00:00:00.000Z";
/** As-of date for staleness metrics. Derived from the run stamp. */
const AS_OF = RESEARCH_RUN_AT.slice(0, 10);
/** Days after which a claim is counted as stale. */
const STALE_THRESHOLD_DAYS = 365;

class ResearchError extends Error {
  constructor(message: string) {
    super(`[research] ${message}`);
    this.name = "ResearchError";
  }
}

function readInput<T>(file: string, schema: z.ZodType<T>): T {
  const path = join(INPUT_DIR, file);
  if (!existsSync(path)) {
    throw new ResearchError(`research/input/${file} is missing.`);
  }
  let raw: unknown;
  try {
    raw = yaml.load(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new ResearchError(`research/input/${file} is not valid YAML: ${(cause as Error).message}`);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    // A malformed research file fails the run. It is never partially loaded,
    // because a partially loaded corpus is indistinguishable from a complete
    // one that simply has less evidence.
    throw new ResearchError(
      `research/input/${file} failed validation:\n` +
        result.error.issues
          .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("\n"),
    );
  }
  return result.data;
}

function writeGenerated(relativePath: string, payload: unknown): string {
  const absolutePath = join(ROOT, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  writeFileSync(absolutePath, text, "utf8");
  return text;
}

function main(): void {
  process.stdout.write("Loading configuration...\n");
  const config = loadConfig();

  process.stdout.write("Validating research input...\n");
  const companiesFile = readInput("companies.yaml", companiesFileSchema);
  const sourcesFile = readInput("sources.yaml", sourcesFileSchema);
  const evidenceFile = readInput("evidence.yaml", evidenceFileSchema);
  const eventsFile = readInput("events.yaml", eventsFileSchema);
  const headlinesFile = readInput("headlines.yaml", headlinesFileSchema);

  const input = {
    companies: companiesFile.companies,
    sources: sourcesFile.sources,
    evidence: evidenceFile.evidence,
    events: eventsFile.events,
    headlines: headlinesFile.headlines,
  };

  const inputHash = hashResearchInput(input);
  // The run id is derived from the input and the configuration, so the same
  // reviewed research always carries the same run id.
  const researchRunId = `run-${stableHash({ inputHash, config: config.hashes.combined, at: RESEARCH_RUN_AT }).slice(7, 19)}`;

  process.stdout.write("Running pipeline...\n");
  const output = runPipeline(input, {
    config,
    researchRunAt: RESEARCH_RUN_AT,
    researchRunId,
    asOf: AS_OF,
  });

  const review = output.review.report({
    generatedAt: RESEARCH_RUN_AT,
    researchRunId,
    schemaVersion: SCHEMA_VERSION,
  });

  process.stdout.write("Computing metrics...\n");
  const metrics = computeCorpusMetrics({
    companies: output.companies,
    peopleCount: output.people.length,
    sources: output.sources,
    claims: output.claims,
    events: output.events,
    snapshotCount: 0,
    reviewQueueCount: review.totalItems,
    sourcesConfig: config.sources,
    asOf: AS_OF,
    staleThresholdDays: STALE_THRESHOLD_DAYS,
  });

  process.stdout.write("Building search index...\n");
  const searchIndex = buildSearchIndex(
    {
      companies: output.companies,
      people: output.people,
      claims: output.claims,
      events: output.events,
    },
    SCHEMA_VERSION,
  );

  const runMeta = {
    researchRunId,
    generatedAt: RESEARCH_RUN_AT,
    schemaVersion: SCHEMA_VERSION,
    thesisConfigHash: config.hashes.thesis,
    signalConfigHash: config.hashes.signals,
    scoringConfigHash: config.hashes.scoring,
    sourceConfigHash: config.hashes.sources,
    /** Ties this corpus to the exact reviewed research input files. */
    researchInputHash: inputHash,
    generator: GENERATOR,
  };

  const envelope = <T>(records: T[]) => ({ ...runMeta, recordCount: records.length, records });

  const files: Array<{ path: string; text: string; count: number }> = [];
  const emit = (name: string, payload: unknown, count: number): void => {
    const path = `${OUTPUT_DIR}/${name}`;
    files.push({ path, text: writeGenerated(path, payload), count });
  };

  process.stdout.write("Writing generated data...\n");
  emit("companies.json", envelope(output.companies), output.companies.length);
  emit("people.json", envelope(output.people), output.people.length);
  emit("sources.json", envelope(output.sources), output.sources.length);
  emit("evidence.json", envelope(output.claims), output.claims.length);
  emit("signal-events.json", envelope(output.events), output.events.length);
  emit("snapshots.json", envelope([]), 0);
  emit("review-queue.json", { ...runMeta, ...review }, review.totalItems);
  emit(
    "research-summary.json",
    {
      ...runMeta,
      note:
        "Research quality metrics. These describe how well evidenced the corpus is. None of them is an investment performance measure.",
      excludedCompaniesNotApproved: output.excludedCompanies,
      metrics,
    },
    1,
  );
  emit("search-index.json", { ...runMeta, ...searchIndex }, searchIndex.documentCount);

  process.stdout.write("Running sanitization checks on generated output...\n");
  const scanned = files.map((file) => ({
    absolutePath: join(ROOT, file.path),
    path: file.path,
    text: file.text,
  }));
  const problems = [
    ...findSecrets(scanned),
    ...findLocalPaths(scanned, { publicOnly: false }),
    ...findEmDashes(scanned),
  ];
  if (problems.length > 0) {
    // Aborts rather than warns. Generated output that contains a credential, a
    // local path, or a prohibited character must never reach a commit.
    throw new ResearchError(
      `generated output failed sanitization:\n${problems
        .map((p) => `  ${p.path}:${p.line} [${p.rule}] ${p.detail}`)
        .join("\n")}`,
    );
  }

  const entries: ManifestEntry[] = files.map((file) =>
    buildManifestEntry({
      path: file.path,
      text: file.text,
      schemaVersion: SCHEMA_VERSION,
      generatedAt: RESEARCH_RUN_AT,
      generator: GENERATOR,
      recordCount: file.count,
    }),
  );

  const manifest = manifestSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    generatedAt: RESEARCH_RUN_AT,
    configHash: config.hashes.combined,
    entries,
  });
  writeGenerated(MANIFEST_PATH, manifest);

  const m = metrics;
  process.stdout.write(
    [
      "",
      `Research run ${researchRunId}`,
      `  companies            ${m.counts.companies} (${output.excludedCompanies} not approved, excluded)`,
      `  people               ${m.counts.people}`,
      `  sources              ${m.counts.sources}`,
      `  evidence claims      ${m.counts.evidenceClaims}`,
      `  signal events        ${m.counts.signalEvents}`,
      `  search documents     ${searchIndex.documentCount}`,
      `  review queue         ${review.totalItems}`,
      "",
      `  companies with a corroborating source   ${m.evidenceCoverage.companiesWithPrimarySource}/${m.counts.companies}`,
      `  companies with two independent sources  ${m.evidenceCoverage.companiesWithTwoIndependentSources}/${m.counts.companies}`,
      `  backtest-admissible events              ${m.backtestAdmissibility.historicallyAdmissibleEvents}/${m.backtestAdmissibility.totalEvents} (${(m.backtestAdmissibility.historicalAdmissibilityRate * 100).toFixed(1)}%)`,
      "",
      `  input hash  ${inputHash}`,
      `  config hash ${config.hashes.combined}`,
      "",
      `Wrote ${entries.length} files and ${MANIFEST_PATH}.`,
      review.totalItems > 0
        ? `Review ${review.totalItems} record(s) in ${OUTPUT_DIR}/review-queue.json before treating this corpus as complete.`
        : "No records require review.",
      "",
    ].join("\n"),
  );
}

main();
