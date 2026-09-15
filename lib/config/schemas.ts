import { z } from "zod";
import {
  signalTypeSchema,
  signalCategorySchema,
  signalDirectionSchema,
  ENDURING_FACT_KEYS,
} from "@/lib/schemas/signal-event";
import { sourceTypeSchema, sourceTierSchema } from "@/lib/schemas/source-record";
import { relevanceTierSchema } from "@/lib/schemas/score-snapshot";
import { thesisDimensionSchema, WEIGHT_SUM_TOLERANCE } from "@/lib/schemas/thesis-configuration";
import { confidenceLevelSchema } from "@/lib/provenance/classification";
import { idSchema, schemaVersionSchema } from "@/lib/schemas/common";

/**
 * Schemas for the four configuration documents.
 *
 * Bad configuration fails loudly. Nothing here repairs a weight, defaults a
 * missing field to something plausible, or ignores an unrecognised signal id.
 * A configuration error that is silently corrected becomes a scoring error
 * nobody can find later.
 */

/* -------------------------------------------------------------------------- */
/* signals.yaml                                                               */
/* -------------------------------------------------------------------------- */

export const signalDefinitionSchema = z
  .object({
    id: signalTypeSchema,
    name: z.string().min(1),
    category: signalCategorySchema,
    direction: signalDirectionSchema,
    baseStrength: z.number().min(0).max(1),
    /**
     * Whether this signal's information value expires.
     *
     * Every signal in this file is an event, so this is true for all of them.
     * The field is retained rather than removed because it is the mechanism
     * that catches an enduring fact being added to the event stream: setting
     * it to false is how someone would try to avoid decay, and the config
     * validator rejects exactly that.
     */
    isTimeSensitive: z.boolean(),
    /** Required when time sensitive, and forbidden when not. */
    halfLifeDays: z.number().positive().nullable(),
    minimumEvidence: z.number().int().min(1),
    eligibleSourceTypes: z.array(sourceTypeSchema).min(1),
    description: z.string().min(1),
  })
  .refine((s) => !s.isTimeSensitive || s.halfLifeDays !== null, {
    message: "A time-sensitive signal must declare a half life.",
    path: ["halfLifeDays"],
  })
  .refine((s) => s.isTimeSensitive || s.halfLifeDays === null, {
    message:
      "An enduring signal must not declare a half life. Enduring facts are never decayed.",
    path: ["halfLifeDays"],
  });

export type SignalDefinition = z.infer<typeof signalDefinitionSchema>;

export const signalsConfigSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    version: z.string().min(1),
    signals: z.array(signalDefinitionSchema).min(1),
  })
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>();
    for (const signal of cfg.signals) {
      if (seen.has(signal.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["signals"],
          message: `Duplicate signal id "${signal.id}".`,
        });
      }
      seen.add(signal.id);

      // FACTS ENDURE, EVENTS DECAY. SignalEvent is an event stream, so every
      // definition here must be an event with a half life. Marking a signal
      // as enduring is how an enduring fact would be smuggled in to avoid
      // decay, and that is rejected rather than accommodated. Enduring facts
      // belong on Person, Company, or EvidenceClaim: see ENDURING_FACT_HOMES.
      if (!signal.isTimeSensitive) {
        ctx.addIssue({
          code: "custom",
          path: ["signals"],
          message:
            `Signal "${signal.id}" is marked as not time sensitive. Every signal is an event and every event decays. ` +
            "An enduring fact does not belong in the event stream: record it on Person, Company, or as an EvidenceClaim instead.",
        });
      }

      if (ENDURING_FACT_KEYS.includes(signal.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["signals"],
          message: `"${signal.id}" names an enduring fact, not an event. It must not be a signal id.`,
        });
      }
    }
  });

export type SignalsConfig = z.infer<typeof signalsConfigSchema>;

/* -------------------------------------------------------------------------- */
/* scoring.yaml                                                               */
/* -------------------------------------------------------------------------- */

const weightRecordSchema = z.record(thesisDimensionSchema, z.number().min(0).max(1));

export const scoringConfigSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    version: z.string().min(1),
    thesisDimensionWeights: weightRecordSchema,
    momentum: z.object({
      windowDays: z.number().int().positive(),
      minimumSignals: z.number().int().min(1),
      negativeSignalWeight: z.number().min(0),
      minimumIndependentSources: z.number().int().min(1),
    }),
    convergence: z.object({
      minimumDistinctCategories: z.number().int().min(1),
      minimumIndependentSources: z.number().int().min(1),
      crossCategoryWeight: z.number().min(0).max(1),
      withinCategoryWeight: z.number().min(0).max(1),
      contradictionPenalty: z.number().min(0).max(1),
    }),
    priority: z.object({
      weights: z.object({
        thesisFit: z.number().min(0).max(1),
        momentum: z.number().min(0).max(1),
        convergence: z.number().min(0).max(1),
        trust: z.number().min(0).max(1),
      }),
      relevanceTiers: z.record(
        relevanceTierSchema,
        z.object({
          multiplier: z.number().min(0).max(1),
          ceiling: z.number().min(0).max(100),
        }),
      ),
    }),
    thresholds: z.object({
      minimumTrustToRank: z.number().min(0).max(100),
      requireCompleteFitComponents: z.boolean(),
      minimumEntityMatchConfidence: z.number().min(0).max(1),
    }),
    confidence: z.object({
      levelMultipliers: z.record(confidenceLevelSchema, z.number().min(0).max(1)),
    }),
    /**
     * The negative specification: quantities that must never automatically
     * raise a score. A later scoring engine is tested against this list.
     */
    excludedFromPositiveScoring: z
      .array(
        z.object({
          id: idSchema,
          rule: z.string().min(1),
          rationale: z.string().min(1),
        }),
      )
      .min(1),
  })
  .superRefine((cfg, ctx) => {
    const dimensions = thesisDimensionSchema.options;
    const missing = dimensions.filter((d) => cfg.thesisDimensionWeights[d] === undefined);
    if (missing.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["thesisDimensionWeights"],
        message: `Missing a weight for: ${missing.join(", ")}.`,
      });
    } else {
      const sum = dimensions.reduce((a, d) => a + (cfg.thesisDimensionWeights[d] ?? 0), 0);
      if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
        ctx.addIssue({
          code: "custom",
          path: ["thesisDimensionWeights"],
          message: `Thesis dimension weights must sum to exactly 1. Received ${sum}.`,
        });
      }
    }

    const p = cfg.priority.weights;
    const prioritySum = p.thesisFit + p.momentum + p.convergence + p.trust;
    if (Math.abs(prioritySum - 1) > WEIGHT_SUM_TOLERANCE) {
      ctx.addIssue({
        code: "custom",
        path: ["priority", "weights"],
        message: `Priority weights must sum to exactly 1. Received ${prioritySum}.`,
      });
    }

    const c = cfg.convergence;
    const convergenceSum = c.crossCategoryWeight + c.withinCategoryWeight;
    if (Math.abs(convergenceSum - 1) > WEIGHT_SUM_TOLERANCE) {
      ctx.addIssue({
        code: "custom",
        path: ["convergence"],
        message: `Convergence weights must sum to exactly 1. Received ${convergenceSum}.`,
      });
    }

    for (const tier of relevanceTierSchema.options) {
      if (cfg.priority.relevanceTiers[tier] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["priority", "relevanceTiers"],
          message: `Missing relevance tier "${tier}".`,
        });
      }
    }

    for (const level of confidenceLevelSchema.options) {
      if (cfg.confidence.levelMultipliers[level] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["confidence", "levelMultipliers"],
          message: `Missing a confidence multiplier for "${level}".`,
        });
      }
    }

    // An unknown claim must not be able to raise a score. This is a rule, not
    // a preference, so it is enforced rather than documented.
    if ((cfg.confidence.levelMultipliers.unknown ?? 0) !== 0) {
      ctx.addIssue({
        code: "custom",
        path: ["confidence", "levelMultipliers", "unknown"],
        message: "The unknown confidence multiplier must be exactly 0. An unknown claim cannot raise a score.",
      });
    }
  });

export type ScoringConfig = z.infer<typeof scoringConfigSchema>;

/* -------------------------------------------------------------------------- */
/* sources.yaml                                                               */
/* -------------------------------------------------------------------------- */

export const sourceClassSchema = z
  .object({
    id: sourceTypeSchema,
    name: z.string().min(1),
    tier: sourceTierSchema,
    reliability: z.number().min(0).max(1),
    isIndependent: z.boolean(),
    canCorroborate: z.boolean(),
    description: z.string().min(1),
    constraints: z.string().min(1),
  })
  .refine((s) => s.isIndependent || !s.canCorroborate, {
    message: "A source class that is not independent must not be allowed to corroborate.",
    path: ["canCorroborate"],
  });

export type SourceClass = z.infer<typeof sourceClassSchema>;

export const sourcesConfigSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    version: z.string().min(1),
    sourceClasses: z.array(sourceClassSchema).min(1),
  })
  .superRefine((cfg, ctx) => {
    for (const type of sourceTypeSchema.options) {
      if (!cfg.sourceClasses.some((s) => s.id === type)) {
        ctx.addIssue({
          code: "custom",
          path: ["sourceClasses"],
          message: `Missing a definition for source class "${type}".`,
        });
      }
    }
    const inference = cfg.sourceClasses.find((s) => s.id === "analyst_inference");
    if (inference && inference.canCorroborate) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceClasses"],
        message: "Analyst inference must never be allowed to corroborate. It is not evidence.",
      });
    }
  });

export type SourcesConfig = z.infer<typeof sourcesConfigSchema>;
