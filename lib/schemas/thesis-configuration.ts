import { z } from "zod";
import { signalTypeSchema } from "./signal-event";
import { stageSchema } from "./company";
import { idSchema, schemaVersionSchema } from "./common";

/**
 * ThesisConfiguration: the investment methodology, as data.
 *
 * The application must never hardcode one firm's criteria into application
 * logic. Every criterion a scoring engine reads lives here, loaded from
 * config/thesis.yaml and validated on load. Swapping the file changes what the
 * product looks for without touching a line of scoring code.
 *
 * The dimension ids are a closed enum because a scoring engine must be able to
 * exhaustively handle them. Everything else, including sectors, geographies,
 * and the signal lists, is open, so a private equity or corporate venture
 * thesis can name whatever it needs.
 *
 * Note that thesisId is a plain string, not a closed union. Prior work made
 * the mandate id a compile-time union, which made a thesis a code entity
 * rather than a configuration entity. That is the one thing this object must
 * not repeat.
 */

/** The Thesis Fit dimensions. Closed so scoring can be exhaustive. */
export const thesisDimensionSchema = z.enum([
  "capital_efficiency",
  "growth_momentum",
  "founder_alignment",
  "market_quality",
  "business_model_quality",
  "gtm_quality",
  "competitive_position",
]);
export type ThesisDimension = z.infer<typeof thesisDimensionSchema>;

export const THESIS_DIMENSION_LABEL: Record<ThesisDimension, string> = {
  capital_efficiency: "Capital efficiency",
  growth_momentum: "Growth momentum",
  founder_alignment: "Founder alignment",
  market_quality: "Market quality",
  business_model_quality: "Business model quality",
  gtm_quality: "Go to market quality",
  competitive_position: "Competitive position",
};

/** Tolerance for the weights-sum-to-one check. */
export const WEIGHT_SUM_TOLERANCE = 1e-9;

const rangeSchema = z.object({
  min: z.number().finite().nullable().default(null),
  max: z.number().finite().nullable().default(null),
});

const preferenceSchema = z.object({
  /** What the thesis is looking for, in plain language shown in the interface. */
  question: z.string().min(1),
  preferred: z.array(z.string().min(1)).default([]),
  discouraged: z.array(z.string().min(1)).default([]),
});

export const thesisCriteriaSchema = z.object({
  stage: z.object({
    question: z.string().min(1),
    primary: z.array(stageSchema).min(1),
    acceptable: z.array(stageSchema).default([]),
    excluded: z.array(stageSchema).default([]),
  }),
  sector: z.object({
    question: z.string().min(1),
    primary: z.array(z.string().min(1)).min(1),
    secondary: z.array(z.string().min(1)).default([]),
    excluded: z.array(z.string().min(1)).default([]),
  }),
  geography: z.object({
    question: z.string().min(1),
    primary: z.array(z.string().min(1)).min(1),
    secondary: z.array(z.string().min(1)).default([]),
    excluded: z.array(z.string().min(1)).default([]),
  }),
  founderInvolvement: preferenceSchema,
  ownership: preferenceSchema,
  capitalEfficiency: z.object({
    question: z.string().min(1),
    /** Revenue generated per dollar of capital raised. */
    arrPerDollarRaised: rangeSchema,
    /** Months of runway implied by the last disclosed round. */
    impliedRunwayMonths: rangeSchema,
  }),
  growth: z.object({
    question: z.string().min(1),
    annualGrowthPct: rangeSchema,
    /** Growth rate plus profit margin, the common growth-stage sanity check. */
    ruleOfForty: rangeSchema,
  }),
  businessModel: preferenceSchema,
  marketQuality: preferenceSchema,
  gtm: preferenceSchema,
  transaction: z.object({
    question: z.string().min(1),
    checkSizeUsdMillions: rangeSchema,
    targetOwnershipPct: rangeSchema,
    preferredStructures: z.array(z.string().min(1)).default([]),
  }),
});
export type ThesisCriteria = z.infer<typeof thesisCriteriaSchema>;

export const thesisConfigurationSchema = z
  .object({
    /** A plain string. A thesis is configuration, never a compile-time union. */
    id: idSchema,
    schemaVersion: schemaVersionSchema,
    version: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    /**
     * Shown wherever the methodology appears. Guards the firm-agnostic promise
     * at the level of the data rather than of the page copy.
     */
    attribution: z.string().min(1),
    coreBelief: z.string().min(1),

    criteria: thesisCriteriaSchema,

    /** Signal types that count for this thesis, with the reason they count. */
    positiveSignals: z
      .array(
        z.object({
          signalType: signalTypeSchema,
          rationale: z.string().min(1),
        }),
      )
      .default([]),
    negativeSignals: z
      .array(
        z.object({
          signalType: signalTypeSchema,
          rationale: z.string().min(1),
        }),
      )
      .default([]),
    /** Hard disqualifiers. Applied before scoring, never traded off against it. */
    exclusions: z
      .array(
        z.object({
          id: idSchema,
          rule: z.string().min(1),
          rationale: z.string().min(1),
        }),
      )
      .default([]),

    /** Thesis Fit dimension weights. Must sum to exactly 1 within tolerance. */
    dimensionWeights: z.record(thesisDimensionSchema, z.number().min(0).max(1)),
  })
  .superRefine((cfg, ctx) => {
    const dimensions = thesisDimensionSchema.options;
    const missing = dimensions.filter((d) => cfg.dimensionWeights[d] === undefined);
    if (missing.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["dimensionWeights"],
        message: `Missing a weight for: ${missing.join(", ")}. Every dimension must be weighted, including at zero.`,
      });
      return;
    }
    const sum = dimensions.reduce((acc, d) => acc + (cfg.dimensionWeights[d] ?? 0), 0);
    if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
      ctx.addIssue({
        code: "custom",
        path: ["dimensionWeights"],
        message: `Thesis dimension weights must sum to exactly 1. Received ${sum}.`,
      });
    }
  });

export type ThesisConfiguration = z.infer<typeof thesisConfigurationSchema>;
