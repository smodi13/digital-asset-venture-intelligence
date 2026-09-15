import { z } from "zod";
import { schemaVersionV7Schema } from "@/lib/schemas/v7/common";
import {
  subjectTypeSchema,
  signalCategoryV7Schema,
  signalDirectionSchema,
  signalTypeV7Schema,
} from "@/lib/schemas/v7/signal-event";
import { sourceTypeV7Schema } from "@/lib/schemas/v7/source-record";
import { thesisDimensionSchema } from "@/lib/schemas/thesis-configuration";

/**
 * Zod schemas for the four parallel digital-asset config documents
 * (PARALLEL / DORMANT - Phase 2B).
 *
 * These documents live under config/digital-asset/ and are NOT read by
 * lib/config/load.ts, so they do not affect the active configHash.
 */

export { digitalAssetThesisConfigSchema } from "@/lib/schemas/v7/thesis-configuration";

export const daSignalDefinitionSchema = z.object({
  id: signalTypeV7Schema,
  category: signalCategoryV7Schema,
  subjectTypes: z.array(subjectTypeSchema).min(1),
  directions: z.array(signalDirectionSchema).min(1),
  /** PROVISIONAL V1 half-life hypothesis. NOT calibrated. */
  halfLifeDays: z.number().positive(),
  description: z.string().min(1),
});

export const daSignalsConfigSchema = z.object({
  schemaVersion: schemaVersionV7Schema,
  version: z.string().min(1),
  status: z.literal("PROVISIONAL_DIGITAL_ASSET_V1_UNCALIBRATED"),
  signals: z.array(daSignalDefinitionSchema).min(1),
});
export type DaSignalsConfig = z.infer<typeof daSignalsConfigSchema>;

export const daSourceClassSchema = z
  .object({
    id: sourceTypeV7Schema,
    name: z.string().min(1),
    reliabilityPrior: z.number().min(0).max(1),
    isIndependent: z.boolean(),
    canCorroborate: z.boolean(),
    originDedupRequired: z.boolean(),
    description: z.string().min(1),
    constraints: z.string().min(1),
  })
  .refine((s) => s.isIndependent || !s.canCorroborate, {
    message: "A source class that is not independent must not be allowed to corroborate.",
    path: ["canCorroborate"],
  });

export const daSourcesConfigSchema = z.object({
  schemaVersion: schemaVersionV7Schema,
  version: z.string().min(1),
  status: z.literal("PROVISIONAL_DIGITAL_ASSET_V1_UNCALIBRATED"),
  sourceClasses: z.array(daSourceClassSchema).min(1),
});
export type DaSourcesConfig = z.infer<typeof daSourcesConfigSchema>;

export const daScoringConfigSchema = z.object({
  schemaVersion: schemaVersionV7Schema,
  version: z.string().min(1),
  status: z.literal("PROVISIONAL_DIGITAL_ASSET_V1_UNCALIBRATED"),
  forbiddenAutomaticPositive: z
    .array(z.object({ id: z.string().min(1), rule: z.string().min(1) }))
    .min(1),
  criticalDimensions: z.object({
    status: z.literal("PROVISIONAL_DIGITAL_ASSET_V1"),
    calibrated: z.literal(false),
    dimensions: z.array(thesisDimensionSchema).min(1),
    requireNonzeroCoverage: z.literal(true),
  }),
  evidenceThresholds: z.object({
    status: z.literal("PROVISIONAL_UNVALIDATED_INACTIVE"),
    active: z.literal(false),
    calibrated: z.literal(false),
    minOverallCoverage: z.number().min(0).max(1),
    minOverallConfidence: z.number().min(0).max(1),
    dimensionCoverageFloor: z.number().min(0).max(1),
    minDimensionsAtFloor: z.number().int().min(1),
  }),
});
export type DaScoringConfig = z.infer<typeof daScoringConfigSchema>;
