import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import {
  digitalAssetThesisConfigSchema,
  daSignalsConfigSchema,
  daSourcesConfigSchema,
  daScoringConfigSchema,
} from "./schemas";
import type { DigitalAssetThesisConfig } from "@/lib/schemas/v7/thesis-configuration";
import {
  DIGITAL_ASSET_SIGNAL_SPECS,
  DIGITAL_ASSET_SIGNAL_TYPES,
} from "@/lib/schemas/v7/signal-event";
import { DIGITAL_ASSET_SOURCE_TYPES } from "@/lib/schemas/v7/source-record";

/**
 * Digital-asset config loading (PARALLEL / DORMANT - Phase 2B).
 *
 * SERVER / BUILD / TEST ONLY. Reads config/digital-asset/*.yaml. NOT called by
 * lib/config/load.ts and NOT part of the active configHash. Phase 3 activates
 * this path.
 */

export class DigitalAssetConfigError extends Error {
  constructor(file: string, detail: string) {
    super(`[digital-asset config] ${file}: ${detail}`);
    this.name = "DigitalAssetConfigError";
  }
}

const DIR = join(process.cwd(), "config", "digital-asset");

function read<T>(file: string, schema: z.ZodType<T>): T {
  let text: string;
  try {
    text = readFileSync(join(DIR, file), "utf8");
  } catch {
    throw new DigitalAssetConfigError(file, "file is missing or unreadable");
  }
  let raw: unknown;
  try {
    raw = yaml.load(text);
  } catch (cause) {
    throw new DigitalAssetConfigError(file, `YAML is malformed: ${(cause as Error).message}`);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new DigitalAssetConfigError(
      file,
      result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "),
    );
  }
  return result.data;
}

export function loadDigitalAssetThesisConfig(): DigitalAssetThesisConfig {
  return read("thesis.yaml", digitalAssetThesisConfigSchema);
}

export function loadDigitalAssetConfig() {
  const thesis = loadDigitalAssetThesisConfig();
  const signals = read("signals.yaml", daSignalsConfigSchema);
  const sources = read("sources.yaml", daSourcesConfigSchema);
  const scoring = read("scoring.yaml", daScoringConfigSchema);

  const problems: string[] = [];

  // Every digital-asset signal type is defined exactly once, and the yaml entry
  // agrees with the code spec (single source of truth for half-lives / subjects).
  const defined = new Set(signals.signals.map((s) => s.id));
  for (const type of DIGITAL_ASSET_SIGNAL_TYPES) {
    if (!defined.has(type)) {
      problems.push(`signals.yaml is missing digital-asset signal "${type}"`);
      continue;
    }
    const entry = signals.signals.find((s) => s.id === type)!;
    const spec = DIGITAL_ASSET_SIGNAL_SPECS[type];
    if (entry.halfLifeDays !== spec.halfLifeDays) {
      problems.push(`signal "${type}" half-life ${entry.halfLifeDays} disagrees with code spec ${spec.halfLifeDays}`);
    }
    if (entry.category !== spec.category) {
      problems.push(`signal "${type}" category "${entry.category}" disagrees with code spec "${spec.category}"`);
    }
    if ([...entry.subjectTypes].sort().join(",") !== [...spec.subjectTypes].sort().join(",")) {
      problems.push(`signal "${type}" subjectTypes disagree with code spec`);
    }
  }

  const definedSources = new Set(sources.sourceClasses.map((s) => s.id));
  for (const type of DIGITAL_ASSET_SOURCE_TYPES) {
    if (!definedSources.has(type)) problems.push(`sources.yaml is missing source class "${type}"`);
  }

  if (problems.length > 0) {
    throw new DigitalAssetConfigError("cross-document", problems.join("; "));
  }

  return { thesis, signals, sources, scoring };
}
