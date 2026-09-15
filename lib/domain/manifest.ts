import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { sha256Hex } from "@/lib/hash/canonical";
import { isoDateTimeSchema, schemaVersionSchema } from "@/lib/schemas/common";

/**
 * The generated-data manifest.
 *
 * Every dataset this project commits is produced by a research script, not
 * written by hand. The manifest is what makes that claim checkable: it records
 * the SHA-256 of each generated file, so a file edited after generation fails
 * verification instead of quietly becoming the source of truth.
 *
 * This matters because the whole evidence discipline rests on generated data
 * being reproducible. A hand-edited number inside a generated file would look
 * identical to a sourced one.
 *
 * Phase 2 builds the mechanism and proves it with a tiny fixture. Phase 3
 * produces the real corpus through it.
 */

export const manifestEntrySchema = z.object({
  /** Path relative to the repository root, forward slashes. */
  path: z.string().min(1),
  /** Shape version of the records inside the file. */
  schemaVersion: schemaVersionSchema,
  /** When the generator produced it. */
  generatedAt: isoDateTimeSchema,
  /** Which generator produced it, so an output can be traced to its code. */
  generator: z.string().min(1),
  /** Number of records in the file. Checked against the parsed content. */
  recordCount: z.number().int().nonnegative(),
  /** Lowercase hex SHA-256 of the file bytes as UTF-8 text. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "sha256 must be 64 lowercase hex characters"),
});
export type ManifestEntry = z.infer<typeof manifestEntrySchema>;

export const manifestSchema = z.object({
  schemaVersion: schemaVersionSchema,
  generatedAt: isoDateTimeSchema,
  /** Hash of the configuration in force when the corpus was generated. */
  configHash: z.string().min(1),
  entries: z.array(manifestEntrySchema),
});
export type Manifest = z.infer<typeof manifestSchema>;

export const MANIFEST_PATH = "data/generated/MANIFEST.json";

/** The hash of a file's contents, computed the same way the manifest records it. */
export function hashFileContents(text: string): string {
  return sha256Hex(text);
}

export interface VerificationProblem {
  path: string;
  kind: "missing" | "hash_mismatch" | "record_count_mismatch" | "unparseable";
  detail: string;
}

export interface VerificationResult {
  ok: boolean;
  checked: number;
  problems: VerificationProblem[];
}

/**
 * Verify every manifest entry against the file on disk.
 *
 * A hash mismatch is a failure, not a warning. There is no repair path and no
 * option to accept the file as found: if the bytes changed, either regenerate
 * the corpus or explain why the file was edited.
 */
export function verifyManifest(manifest: Manifest, root: string): VerificationResult {
  const problems: VerificationProblem[] = [];

  for (const entry of manifest.entries) {
    const absolutePath = join(root, entry.path);

    if (!existsSync(absolutePath)) {
      problems.push({
        path: entry.path,
        kind: "missing",
        detail: "listed in the manifest but not present on disk",
      });
      continue;
    }

    const text = readFileSync(absolutePath, "utf8");
    const actual = hashFileContents(text);
    if (actual !== entry.sha256) {
      problems.push({
        path: entry.path,
        kind: "hash_mismatch",
        detail: `manifest records ${entry.sha256.slice(0, 12)} but the file hashes to ${actual.slice(0, 12)}. Regenerate the corpus rather than updating the manifest by hand.`,
      });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (cause) {
      problems.push({
        path: entry.path,
        kind: "unparseable",
        detail: `not valid JSON: ${(cause as Error).message}`,
      });
      continue;
    }

    const records = Array.isArray(parsed)
      ? parsed
      : (parsed as { records?: unknown }).records;
    if (Array.isArray(records) && records.length !== entry.recordCount) {
      problems.push({
        path: entry.path,
        kind: "record_count_mismatch",
        detail: `manifest records ${entry.recordCount} entries but the file contains ${records.length}`,
      });
    }
  }

  return { ok: problems.length === 0, checked: manifest.entries.length, problems };
}

/** Load and validate the manifest. Throws if it is absent or malformed. */
export function loadManifest(root: string): Manifest {
  const absolutePath = join(root, MANIFEST_PATH);
  if (!existsSync(absolutePath)) {
    throw new Error(`[manifest] ${MANIFEST_PATH} is missing.`);
  }
  const raw: unknown = JSON.parse(readFileSync(absolutePath, "utf8"));
  const result = manifestSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `[manifest] ${MANIFEST_PATH} is invalid: ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return result.data;
}

/** Build a manifest entry for a file whose text is already in hand. */
export function buildManifestEntry(input: {
  path: string;
  text: string;
  schemaVersion: number;
  generatedAt: string;
  generator: string;
  recordCount: number;
}): ManifestEntry {
  return manifestEntrySchema.parse({
    path: input.path,
    schemaVersion: input.schemaVersion,
    generatedAt: input.generatedAt,
    generator: input.generator,
    recordCount: input.recordCount,
    sha256: hashFileContents(input.text),
  });
}
