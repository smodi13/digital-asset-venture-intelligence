import { z } from "zod";
import { idSchema } from "@/lib/schemas/common";
import { DA_SCREENING_CRITERION_IDS } from "@/lib/scoring/digital-asset/screening";

/**
 * The v7 Screening judgment packet: one human-reviewable YAML file per
 * (entity, cohort) judgment (Phase 3C-0, PARALLEL / DORMANT).
 *
 * A judgment packet is a HUMAN INPUT record. It must never contain a
 * computed outcome (dimensionScore, thesisFit, rank, recommendation, ...):
 * see FORBIDDEN_JUDGMENT_FIELDS and scanForForbiddenFields below, enforced
 * the same two ways the research packet firewall is enforced (a named
 * recursive scan before parsing, plus .strict() schemas).
 *
 * Distinct namespace from research/v7/input/**: a judgment packet cites
 * research, it never contains research (no new EvidenceClaim, SourceRecord,
 * or SignalEvent content here, only ids that must resolve against the bound,
 * frozen research packet -- see lib/judgments-v7/research-binding.ts and
 * integrity.ts).
 */

export const FORBIDDEN_JUDGMENT_FIELDS = [
  "dimensionScore",
  "dimension_score",
  "thesisFit",
  "thesis_fit",
  "overallScore",
  "overall_score",
  "rank",
  "investmentRank",
  "recommendation",
  "investmentRecommendation",
  "rankEligibility",
  "screeningEvidenceEligibility",
  "priorityScore",
] as const;

/** rawAnchor is explicitly NOT in this list: it is the intentional human criterion-level input. */
const FORBIDDEN_FIELD_SET = new Set<string>(FORBIDDEN_JUDGMENT_FIELDS);

export interface ForbiddenFieldHit {
  field: string;
  path: string;
}

/** Recursively scan a raw (pre-validation) judgment packet object for forbidden computed-outcome fields, at any depth. */
export function scanForForbiddenFields(value: unknown, path = "$"): ForbiddenFieldHit[] {
  const hits: ForbiddenFieldHit[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => hits.push(...scanForForbiddenFields(item, `${path}[${i}]`)));
    return hits;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = `${path}.${key}`;
      if (FORBIDDEN_FIELD_SET.has(key)) hits.push({ field: key, path: nextPath });
      hits.push(...scanForForbiddenFields(v, nextPath));
    }
  }
  return hits;
}

export const sha256HashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/, "expected a sha256:<64 hex> hash");
export const gitCommitSchema = z.string().regex(/^[0-9a-f]{40}$/, "expected a full 40-hex git commit sha");

export const applicabilityStateSchema = z.enum(["applicable", "not_applicable", "unknown"]);
export type ApplicabilityStateInput = z.infer<typeof applicabilityStateSchema>;

/** 0, 0.5, or 1: the same coverage vocabulary as lib/scoring/digital-asset/applicability.ts CriterionScoreInput.coverage. */
export const coverageSchema = z.union([z.literal(0), z.literal(0.5), z.literal(1)]);

export const criterionJudgmentSchema = z
  .object({
    criterionId: z.string().min(1),
    applicability: applicabilityStateSchema,
    /** null unless applicability is "applicable". Range matches the implemented internal-score formula (50 + coverage * (anchor - 50)) in applicability.ts. */
    rawAnchor: z.number().min(0).max(100).nullable(),
    /** null unless applicability is "applicable". */
    coverage: coverageSchema.nullable(),
    /** EvidenceClaim ids from the bound, frozen research packet for this entity. No freehand new evidence here. */
    citedEvidenceClaimIds: z.array(idSchema).default([]),
    /** Why the frozen evidence supports this anchor/applicability. Not a restatement of the whole research packet. */
    rationale: z.string().min(1),
    /** EvidenceClaim ids of a material contradiction this judgment acknowledges, where relevant. */
    acknowledgedContradictionIds: z.array(idSchema).default([]),
    /** A judgment-side note that evidence was insufficient to fully resolve this criterion. Never a substitute for going and researching more. */
    evidenceGapNote: z.string().min(1).nullable().default(null),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.applicability === "applicable") {
      if (c.rawAnchor === null) {
        ctx.addIssue({ code: "custom", message: "applicable criterion requires a rawAnchor.", path: ["rawAnchor"] });
      }
      if (c.coverage === null) {
        ctx.addIssue({ code: "custom", message: "applicable criterion requires a coverage value.", path: ["coverage"] });
      }
    } else {
      if (c.rawAnchor !== null) {
        ctx.addIssue({
          code: "custom",
          message: `rawAnchor must be null when applicability is "${c.applicability}".`,
          path: ["rawAnchor"],
        });
      }
      if (c.coverage !== null) {
        ctx.addIssue({
          code: "custom",
          message: `coverage must be null when applicability is "${c.applicability}".`,
          path: ["coverage"],
        });
      }
    }
  });

export type CriterionJudgmentInput = z.input<typeof criterionJudgmentSchema>;
export type CriterionJudgment = z.infer<typeof criterionJudgmentSchema>;

export const judgmentPacketSchema = z
  .object({
    schemaVersion: z.literal(7),

    candidateId: z.string().min(1),
    entityId: idSchema,
    cohort: z.enum(["CALIBRATION", "VALIDATION", "FINAL_TEST"]),

    /** Must equal lib/judgments-v7/dates.ts FROZEN_RESEARCH_BASELINE_COMMIT. */
    researchBaselineCommit: gitCommitSchema,
    /** Must equal hashResearchPacket(<the bound research packet>) at validation time. */
    researchPacketSha256: sha256HashSchema,
    /** Must equal lib/judgments-v7/methodology-fingerprint.ts DA_METHODOLOGY_FINGERPRINT at validation time. */
    methodologyConfigFingerprint: sha256HashSchema,

    /**
     * Mandate eligibility/evidence-sufficiency is a structurally separate
     * assessment (lib/scoring/digital-asset/mandate.ts) and is not populated
     * by this phase's Screening-criterion judgment workflow. Literal-locked
     * to NOT_ASSESSED so a packet cannot silently smuggle a mandate opinion
     * in through this field before mandate assessment is built out.
     */
    mandateStatus: z.literal("NOT_ASSESSED").default("NOT_ASSESSED"),

    criterionJudgments: z.array(criterionJudgmentSchema),

    analystNote: z.string().min(1).nullable().default(null),
  })
  .strict()
  .superRefine((packet, ctx) => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const c of packet.criterionJudgments) {
      if (seen.has(c.criterionId)) duplicates.add(c.criterionId);
      seen.add(c.criterionId);
    }
    for (const dup of duplicates) {
      ctx.addIssue({ code: "custom", message: `duplicate criterion judgment for "${dup}".`, path: ["criterionJudgments"] });
    }

    const unknownIds = [...seen].filter((id) => !DA_SCREENING_CRITERION_IDS.has(id));
    for (const id of unknownIds) {
      ctx.addIssue({ code: "custom", message: `"${id}" is not one of the 14 implemented Screening criteria.`, path: ["criterionJudgments"] });
    }

    const missingIds = [...DA_SCREENING_CRITERION_IDS].filter((id) => !seen.has(id));
    for (const id of missingIds) {
      ctx.addIssue({ code: "custom", message: `missing criterion judgment for "${id}".`, path: ["criterionJudgments"] });
    }

    if (packet.criterionJudgments.length !== DA_SCREENING_CRITERION_IDS.size) {
      ctx.addIssue({
        code: "custom",
        message: `expected exactly ${DA_SCREENING_CRITERION_IDS.size} criterion judgments, received ${packet.criterionJudgments.length}.`,
        path: ["criterionJudgments"],
      });
    }
  });

export type JudgmentPacketInput = z.input<typeof judgmentPacketSchema>;
export type JudgmentPacket = z.infer<typeof judgmentPacketSchema>;
