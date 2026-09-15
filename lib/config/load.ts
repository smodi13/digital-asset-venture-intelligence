import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { thesisConfigurationSchema, type ThesisConfiguration } from "@/lib/schemas/thesis-configuration";
import { hashConfig } from "@/lib/hash/canonical";
import {
  signalsConfigSchema,
  scoringConfigSchema,
  sourcesConfigSchema,
  type SignalsConfig,
  type ScoringConfig,
  type SourcesConfig,
} from "./schemas";

/**
 * Configuration loading and validation.
 *
 * BUILD TIME AND SERVER ONLY. This module reads the filesystem and parses
 * YAML. It must never be imported by a client component: configuration is
 * resolved during the build and the resulting values are what reach the
 * browser, so no YAML parser ships in the client bundle.
 *
 * Every document is validated through Zod on load. Bad configuration throws.
 * Nothing is repaired, defaulted, or ignored, because a silently corrected
 * weight becomes a scoring error that is impossible to find afterwards.
 */

export class ConfigError extends Error {
  constructor(file: string, detail: string) {
    super(`[config] ${file}: ${detail}`);
    this.name = "ConfigError";
  }
}

const CONFIG_DIR = join(process.cwd(), "config");

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

/** Parse and validate one YAML document. Throws ConfigError on any problem. */
export function parseConfig<T>(
  file: string,
  text: string,
  schema: z.ZodType<T>,
): T {
  let raw: unknown;
  try {
    raw = yaml.load(text);
  } catch (cause) {
    throw new ConfigError(file, `YAML is malformed: ${(cause as Error).message}`);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ConfigError(file, formatIssues(result.error));
  }
  return result.data;
}

function readConfig<T>(file: string, schema: z.ZodType<T>): T {
  let text: string;
  try {
    text = readFileSync(join(CONFIG_DIR, file), "utf8");
  } catch {
    throw new ConfigError(file, "file is missing or unreadable");
  }
  return parseConfig(file, text, schema);
}

export function loadThesisConfig(): ThesisConfiguration {
  return readConfig("thesis.yaml", thesisConfigurationSchema);
}

export function loadSignalsConfig(): SignalsConfig {
  return readConfig("signals.yaml", signalsConfigSchema);
}

export function loadScoringConfig(): ScoringConfig {
  return readConfig("scoring.yaml", scoringConfigSchema);
}

export function loadSourcesConfig(): SourcesConfig {
  return readConfig("sources.yaml", sourcesConfigSchema);
}

export interface LoadedConfig {
  thesis: ThesisConfiguration;
  signals: SignalsConfig;
  scoring: ScoringConfig;
  sources: SourcesConfig;
  hashes: {
    thesis: string;
    signals: string;
    scoring: string;
    sources: string;
    combined: string;
  };
}

/**
 * Cross-document consistency checks.
 *
 * Each file validates in isolation above. These are the rules that only make
 * sense across files, and they are where drift actually happens: two files
 * that each look correct while disagreeing with each other.
 */
export function validateConfigConsistency(config: {
  thesis: ThesisConfiguration;
  signals: SignalsConfig;
  scoring: ScoringConfig;
  sources: SourcesConfig;
}): void {
  const problems: string[] = [];

  // The two weight tables must agree exactly. thesis.yaml is authoritative;
  // scoring.yaml mirrors it so scoring engines have one place to read from.
  for (const [dimension, weight] of Object.entries(config.thesis.dimensionWeights)) {
    const mirrored = config.scoring.thesisDimensionWeights[
      dimension as keyof typeof config.scoring.thesisDimensionWeights
    ];
    if (mirrored !== weight) {
      problems.push(
        `dimension "${dimension}" is ${weight} in thesis.yaml but ${String(mirrored)} in scoring.yaml`,
      );
    }
  }

  const definedSignals = new Set(config.signals.signals.map((s) => s.id));

  for (const entry of config.thesis.positiveSignals) {
    if (!definedSignals.has(entry.signalType)) {
      problems.push(`thesis.yaml positive signal "${entry.signalType}" is not defined in signals.yaml`);
    }
  }
  for (const entry of config.thesis.negativeSignals) {
    if (!definedSignals.has(entry.signalType)) {
      problems.push(`thesis.yaml negative signal "${entry.signalType}" is not defined in signals.yaml`);
    }
  }

  const definedSourceClasses = new Set(config.sources.sourceClasses.map((s) => s.id));
  for (const signal of config.signals.signals) {
    for (const sourceType of signal.eligibleSourceTypes) {
      if (!definedSourceClasses.has(sourceType)) {
        problems.push(
          `signal "${signal.id}" lists source class "${sourceType}", which is not defined in sources.yaml`,
        );
      }
    }
  }

  // A signal may not be eligible to be evidenced solely by a source class that
  // cannot corroborate, unless it requires only one piece of evidence.
  for (const signal of config.signals.signals) {
    if (signal.minimumEvidence <= 1) continue;
    const corroborating = signal.eligibleSourceTypes.filter((type) => {
      const cls = config.sources.sourceClasses.find((s) => s.id === type);
      return cls?.canCorroborate === true;
    });
    if (corroborating.length === 0) {
      problems.push(
        `signal "${signal.id}" requires ${signal.minimumEvidence} pieces of evidence but lists no source class able to corroborate`,
      );
    }
  }

  if (problems.length > 0) {
    throw new ConfigError("cross-document", problems.join("; "));
  }
}

/**
 * Load, validate, cross-check, and hash every configuration document.
 *
 * The hashes are what ScoreSnapshot records, so a snapshot can be tied to the
 * exact configuration that produced it.
 */
export function loadConfig(): LoadedConfig {
  const thesis = loadThesisConfig();
  const signals = loadSignalsConfig();
  const scoring = loadScoringConfig();
  const sources = loadSourcesConfig();

  validateConfigConsistency({ thesis, signals, scoring, sources });

  const hashes = {
    thesis: hashConfig("thesis", thesis),
    signals: hashConfig("signals", signals),
    scoring: hashConfig("scoring", scoring),
    sources: hashConfig("sources", sources),
    combined: "",
  };
  hashes.combined = hashConfig("combined", {
    thesis: hashes.thesis,
    signals: hashes.signals,
    scoring: hashes.scoring,
    sources: hashes.sources,
  });

  return { thesis, signals, scoring, sources, hashes };
}
