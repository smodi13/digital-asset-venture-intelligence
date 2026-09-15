import { z } from "zod";
import { sha256Hex } from "@/lib/hash/canonical";
import { isoDateTimeSchema } from "@/lib/schemas/common";

/**
 * The dormant v7 generated-data manifest (Phase 3B-0, PARALLEL / DORMANT).
 *
 * Entirely separate from the active data/generated/MANIFEST.json: reuses the
 * same hashing approach (lib/hash/canonical.sha256Hex) but its own schema, its
 * own path, and its own load/verify functions, so nothing here can be
 * confused with or accidentally touch the active manifest.
 */

export const V7_MANIFEST_PATH = "data/v7-generated/MANIFEST.v7.json";

export const manifestV7EntrySchema = z.object({
  path: z.string().min(1),
  schemaVersion: z.literal(7),
  generatedAt: isoDateTimeSchema,
  generator: z.string().min(1),
  recordCount: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ManifestV7Entry = z.infer<typeof manifestV7EntrySchema>;

export const manifestV7Schema = z.object({
  schemaVersion: z.literal(7),
  generatedAt: isoDateTimeSchema,
  batch: z.enum(["CALIBRATION", "VALIDATION", "FINAL_TEST", "SYNTHETIC"]),
  entries: z.array(manifestV7EntrySchema),
});
export type ManifestV7 = z.infer<typeof manifestV7Schema>;

export function buildManifestV7Entry(input: {
  path: string;
  text: string;
  generatedAt: string;
  generator: string;
  recordCount: number;
}): ManifestV7Entry {
  return manifestV7EntrySchema.parse({
    path: input.path,
    schemaVersion: 7,
    generatedAt: input.generatedAt,
    generator: input.generator,
    recordCount: input.recordCount,
    sha256: sha256Hex(input.text),
  });
}
