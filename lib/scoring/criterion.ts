import { z } from "zod";
import { rawAnchorSchema, coverageSchema, type CoverageValue } from "./config";
import { resolveConfidence, type ConfidenceResolutionInput } from "./confidence";

/**
 * Criterion: one subcriterion assessment and its evidence-adjusted score.
 *
 * The analyst supplies judgment only: a discrete rubric anchor, the cited
 * claim ids, unknowns, discrete coverage, and a rationale. The analyst does
 * NOT supply evidence confidence; that scalar is derived deterministically
 * from the cited evidence by resolveConfidence(). A raw anchor is only
 * 0, 25, 50, 75, 100, or null. A numeric anchor with no cited evidence fails
 * validation. Assumptions and unknowns never raise coverage.
 */

export const analystAssessmentSchema = z
  .object({
    criterionId: z.string().min(1),
    rawAnchor: rawAnchorSchema.nullable(),
    rubricAnchorUsed: z.boolean(),
    supportingClaimIds: z.array(z.string().min(1)).default([]),
    opposingClaimIds: z.array(z.string().min(1)).default([]),
    unknowns: z.array(z.string()).default([]),
    coverage: coverageSchema,
    analystRationale: z.string().min(1),
  })
  // Strict: an analyst may not supply, override, or smuggle any scoring-confidence
  // scalar (confidence, computedConfidence, effectiveReliability, reliabilityCap,
  // ...). Unknown keys fail loud rather than being silently stripped. Confidence
  // is derived only by resolveConfidence() from cited evidence.
  .strict()
  .superRefine((a, ctx) => {
    if (a.rawAnchor !== null) {
      if (!a.rubricAnchorUsed) {
        ctx.addIssue({
          code: "custom",
          path: ["rubricAnchorUsed"],
          message: "A numeric raw anchor must be taken from the rubric.",
        });
      }
      if (a.supportingClaimIds.length + a.opposingClaimIds.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["supportingClaimIds"],
          message: "A numeric raw anchor must cite at least one supporting or opposing claim.",
        });
      }
    }
  });

export type AnalystCriterionAssessment = z.infer<typeof analystAssessmentSchema>;

export type CriterionDisplayStatus = "SCORED" | "INSUFFICIENT_EVIDENCE";

export interface CriterionResult {
  criterionId: string;
  /** Score used inside dimension math. Neutral 50 when the anchor is null. */
  internalAdjustedScore: number;
  effectiveReliability: number;
  coverage: CoverageValue;
  /** Computed evidence confidence, never an analyst-entered scalar. */
  confidence: number;
  confidenceClaimIds?: string[];
  displayStatus: CriterionDisplayStatus;
}

/**
 * effectiveReliability = computedConfidence * coverage.
 * adjustedScore = 50 + effectiveReliability * (rawAnchor - 50).
 * A null anchor fills 50 internally and never displays as a real assessment.
 *
 * `evidence` describes the cited claims; confidence is resolved from it here.
 * There is no path for a caller to pass the confidence scalar directly.
 */
export function scoreCriterion(
  assessment: AnalystCriterionAssessment,
  evidence: ConfidenceResolutionInput = { evidence: [] },
): CriterionResult {
  const parsed = analystAssessmentSchema.parse(assessment);
  const computed = resolveConfidence(evidence);
  const effectiveReliability = computed.confidence * parsed.coverage;

  const shared = {
    criterionId: parsed.criterionId,
    effectiveReliability,
    coverage: parsed.coverage,
    confidence: computed.confidence,
    confidenceClaimIds: computed.claimIds,
  };

  if (parsed.rawAnchor === null) {
    return { ...shared, internalAdjustedScore: 50, displayStatus: "INSUFFICIENT_EVIDENCE" };
  }
  return {
    ...shared,
    internalAdjustedScore: 50 + effectiveReliability * (parsed.rawAnchor - 50),
    displayStatus: "SCORED",
  };
}
