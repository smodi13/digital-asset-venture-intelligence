/**
 * Synthetic fixtures for the v7 judgment harness (Phase 3C-0).
 *
 * Obviously synthetic: fake companies, fake claims, example.com URLs. Never
 * a real judgment for any of the 15 real CALIBRATION entities.
 */
import { baseCompanyPacket, baseSource } from "@/tests/research-v7/fixtures";
import { validatePacket as validateResearchPacket } from "@/lib/research-v7/validate";
import type { Packet as ResearchPacket } from "@/lib/research-v7/packet-schema";
import { hashResearchPacket } from "@/lib/judgments-v7/research-binding";
import { DA_METHODOLOGY_FINGERPRINT } from "@/lib/judgments-v7/methodology-fingerprint";
import { FROZEN_RESEARCH_BASELINE_COMMIT } from "@/lib/judgments-v7/dates";
import { DA_SCREENING_CRITERION_IDS } from "@/lib/scoring/digital-asset/screening";

export const SYNTHETIC_ENTITY_ID = "co-synthetic-widgets";
export const SYNTHETIC_CANDIDATE_ID = "cand-synthetic-001";
export const SYNTHETIC_CLAIM_ID = "clm-synthetic-01";

/** A frozen synthetic CALIBRATION research packet, parsed and validated. */
export function baseResearchPacket(overrides: Partial<Record<string, unknown>> = {}): ResearchPacket {
  const raw = baseCompanyPacket({ cohort: "CALIBRATION", ...overrides });
  const result = validateResearchPacket(raw, "fixture");
  if (!result.ok || !result.packet) {
    throw new Error(`fixture research packet is invalid: ${JSON.stringify(result.issues)}`);
  }
  return result.packet;
}

/** A second synthetic entity's research packet, for the "claim belongs to another entity" fixture. */
export function otherResearchPacket(): ResearchPacket {
  return baseResearchPacket({
    canonicalId: "co-synthetic-other",
    canonicalName: "Synthetic Other Inc",
    slug: "synthetic-other",
    sources: [baseSource({ id: "src-synthetic-other-01" })],
    evidenceClaims: [
      {
        id: "clm-synthetic-other-01",
        schemaVersion: 7,
        companyId: "co-synthetic-other",
        claim: "Synthetic Other Inc shipped its v1 product in July 2026.",
        statedValue: null,
        numericValue: null,
        unit: null,
        sourceId: "src-synthetic-other-01",
        supportingSourceIds: [],
        sourceUrl: "https://example.com/synthetic-other-v1",
        publicationDate: "2026-07-15",
        metricAsOfDate: null,
        lastVerified: null,
        provenance: "sourced",
        sourceSubtype: "company_reported",
        confidence: "medium",
        modelEligibility: "context_only",
        topic: "product",
        notes: null,
        evidenceStatus: "supported",
        analystInterpretation: null,
        diligenceQuestion: null,
        researchAssessmentId: null,
        hardeningRef: null,
        verbatimExcerpt: null,
        contradicts: [],
        contradictedBy: [],
        contradictionNote: null,
      },
    ],
  });
}

/** A minimal synthetic EvidenceClaim, for building contradiction fixtures without repeating the full shape everywhere. */
export function syntheticClaim(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "clm-synthetic-xx",
    schemaVersion: 7,
    companyId: SYNTHETIC_ENTITY_ID,
    claim: "A synthetic claim.",
    statedValue: null,
    numericValue: null,
    unit: null,
    sourceId: "src-synthetic-01",
    supportingSourceIds: [],
    sourceUrl: "https://example.com/synthetic",
    publicationDate: "2026-08-01",
    metricAsOfDate: null,
    lastVerified: null,
    provenance: "sourced",
    sourceSubtype: "company_reported",
    confidence: "medium",
    modelEligibility: "context_only",
    topic: "product",
    notes: null,
    evidenceStatus: "mixed",
    analystInterpretation: null,
    diligenceQuestion: null,
    researchAssessmentId: null,
    hardeningRef: null,
    verbatimExcerpt: null,
    contradicts: [],
    contradictedBy: [],
    contradictionNote: null,
    ...overrides,
  };
}

export interface CriterionOverride {
  criterionId: string;
  applicability?: "applicable" | "not_applicable" | "unknown";
  rawAnchor?: number | null;
  coverage?: 0 | 0.5 | 1 | null;
  citedEvidenceClaimIds?: string[];
  rationale?: string;
  acknowledgedContradictionIds?: string[];
  evidenceGapNote?: string | null;
}

/** All 14 criteria, applicable/evidenced/anchored by default, with per-criterion overrides. */
export function allCriterionJudgments(overrides: Record<string, Partial<CriterionOverride>> = {}, claimId = SYNTHETIC_CLAIM_ID): Record<string, unknown>[] {
  return [...DA_SCREENING_CRITERION_IDS].map((criterionId) => {
    const o = overrides[criterionId] ?? {};
    const applicability = o.applicability ?? "applicable";
    return {
      criterionId,
      applicability,
      rawAnchor: applicability === "applicable" ? (o.rawAnchor ?? 60) : null,
      coverage: applicability === "applicable" ? (o.coverage ?? 1) : null,
      citedEvidenceClaimIds: o.citedEvidenceClaimIds ?? (applicability === "applicable" ? [claimId] : []),
      rationale: o.rationale ?? `Synthetic rationale for ${criterionId}, based on frozen evidence ${claimId}.`,
      acknowledgedContradictionIds: o.acknowledgedContradictionIds ?? [],
      evidenceGapNote: o.evidenceGapNote ?? null,
    };
  });
}

/** A raw (pre-parse) judgment packet, fully bound to the given research packet. */
export function baseJudgmentPacket(
  research: ResearchPacket,
  overrides: Partial<Record<string, unknown>> = {},
  criterionOverrides: Record<string, Partial<CriterionOverride>> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 7,
    candidateId: SYNTHETIC_CANDIDATE_ID,
    entityId: research.canonicalId,
    cohort: research.cohort,
    researchBaselineCommit: FROZEN_RESEARCH_BASELINE_COMMIT,
    researchPacketSha256: hashResearchPacket(research),
    methodologyConfigFingerprint: DA_METHODOLOGY_FINGERPRINT,
    mandateStatus: "NOT_ASSESSED",
    criterionJudgments: allCriterionJudgments(criterionOverrides),
    analystNote: null,
    ...overrides,
  };
}
