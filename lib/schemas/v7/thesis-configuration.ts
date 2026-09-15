import { z } from "zod";
import { thesisDimensionSchema } from "@/lib/schemas/thesis-configuration";
import { entityTypeSchema, assetTypeSchema, digitalAssetCategorySchema } from "./company";
import { schemaVersionV7Schema } from "./common";

/**
 * v7 digital-asset thesis / mandate schema (PARALLEL / DORMANT).
 *
 * Firm-neutral. Global and jurisdiction-aware, NOT jurisdiction-excluding: an
 * arbitrary primary geography is not encoded as a hidden firm mandate.
 * Regulatory and jurisdictional quality belong in the `structural_and_regulatory_fit`
 * screening criterion and in deeper regulatory underwriting, not in a hard gate.
 *
 * The seven Thesis Fit dimensions are reused unchanged from v6.
 */

export { thesisDimensionSchema };

/**
 * Mandate eligibility and evidence sufficiency are SEPARATE concepts.
 *
 * `unresolved` is NOT ineligible: weak or missing public evidence never makes a
 * mandate INELIGIBLE. Only a conclusive mandate conflict (e.g. no accessible
 * investable instrument at all, credible fraud evidence, out-of-scope stage)
 * yields `ineligible`.
 */
export const mandateEligibilityV7Schema = z.enum(["eligible", "ineligible", "unresolved"]);
export type MandateEligibilityV7 = z.infer<typeof mandateEligibilityV7Schema>;

export const evidenceSufficiencyV7Schema = z.enum(["sufficient", "insufficient"]);
export type EvidenceSufficiencyV7 = z.infer<typeof evidenceSufficiencyV7Schema>;

export const digitalAssetThesisConfigSchema = z
  .object({
    schemaVersion: schemaVersionV7Schema,
    id: z.string().min(1),
    version: z.string().min(1),
    name: z.string().min(1),
    attribution: z.string().min(1),
    coreBelief: z.string().min(1),

    allowedEntityTypes: z.array(entityTypeSchema).min(1),
    allowedAssetTypes: z.array(assetTypeSchema).min(1),
    categories: z.array(digitalAssetCategorySchema).min(1),

    /** Jurisdiction-aware, not jurisdiction-excluding. */
    jurisdictionPolicy: z.object({
      question: z.string().min(1),
      note: z.string().min(1),
    }),

    hardExclusions: z
      .array(z.object({ id: z.string().min(1), rule: z.string().min(1), rationale: z.string().min(1) }))
      .min(1),

    /** PROVISIONAL / UNVALIDATED digital-asset dimension weights. Not calibrated. */
    dimensionWeights: z.record(thesisDimensionSchema, z.number().min(0).max(1)),
    weightsStatus: z.literal("PROVISIONAL_DIGITAL_ASSET_V1_UNVALIDATED"),
  })
  .superRefine((cfg, ctx) => {
    const dims = thesisDimensionSchema.options;
    const missing = dims.filter((d) => cfg.dimensionWeights[d] === undefined);
    if (missing.length > 0) {
      ctx.addIssue({ code: "custom", path: ["dimensionWeights"], message: `Missing weight for: ${missing.join(", ")}.` });
      return;
    }
    const sum = dims.reduce((a, d) => a + (cfg.dimensionWeights[d] ?? 0), 0);
    if (Math.abs(sum - 1) > 1e-9) {
      ctx.addIssue({ code: "custom", path: ["dimensionWeights"], message: `Dimension weights must sum to 1. Received ${sum}.` });
    }
    // Firm-neutrality of the mandate at the data level: no token requirement,
    // no token bonus.
    if (!cfg.allowedAssetTypes.includes("network_no_token") || !cfg.allowedAssetTypes.includes("equity")) {
      ctx.addIssue({
        code: "custom",
        path: ["allowedAssetTypes"],
        message: "A no-token asset structure must not be excluded. `equity` and `network_no_token` are required allowed types.",
      });
    }
  });

export type DigitalAssetThesisConfig = z.infer<typeof digitalAssetThesisConfigSchema>;
