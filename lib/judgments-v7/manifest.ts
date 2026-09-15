import { z } from "zod";
import { sha256Hex } from "@/lib/hash/canonical";
import { isoDateTimeSchema } from "@/lib/schemas/common";

/**
 * The dormant v7 analytical-input manifest (Phase 3C-0, PARALLEL / DORMANT).
 *
 * Entirely separate from both the active data/analytical-inputs manifest and
 * the dormant research data/v7-generated/MANIFEST.v7.json: its own path, its
 * own schema, so a judgment build can never be confused with a research
 * build or an active build.
 */

export const JUDGMENT_MANIFEST_V7_PATH = "data/v7-analytical-inputs/MANIFEST.v7.json";

export const judgmentManifestV7EntrySchema = z.object({
  path: z.string().min(1),
  schemaVersion: z.literal(7),
  generatedAt: isoDateTimeSchema,
  generator: z.string().min(1),
  recordCount: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type JudgmentManifestV7Entry = z.infer<typeof judgmentManifestV7EntrySchema>;

export const judgmentManifestV7Schema = z.object({
  schemaVersion: z.literal(7),
  generatedAt: isoDateTimeSchema,
  batch: z.enum(["CALIBRATION", "VALIDATION", "FINAL_TEST", "SYNTHETIC"]),
  entries: z.array(judgmentManifestV7EntrySchema),
});
export type JudgmentManifestV7 = z.infer<typeof judgmentManifestV7Schema>;

export function buildJudgmentManifestEntry(input: {
  path: string;
  text: string;
  generatedAt: string;
  generator: string;
  recordCount: number;
}): JudgmentManifestV7Entry {
  return judgmentManifestV7EntrySchema.parse({
    path: input.path,
    schemaVersion: 7,
    generatedAt: input.generatedAt,
    generator: input.generator,
    recordCount: input.recordCount,
    sha256: sha256Hex(input.text),
  });
}
