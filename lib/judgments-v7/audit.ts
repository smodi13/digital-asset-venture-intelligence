import type { JudgmentPacket } from "./packet-schema";
import type { Issue } from "./validate";
import { DA_SCREENING_CRITERION_IDS } from "@/lib/scoring/digital-asset/screening";

/**
 * The judgment-integrity audit report (Phase 3C-0, PARALLEL / DORMANT).
 *
 * Reports structural facts about a batch of judgment packets: completion,
 * applicability distribution, anchor distribution by criterion, evidence
 * linkage, contradictions, and every provenance/binding issue. Deliberately
 * excludes company rankings, overall Thesis Fit / dimension aggregates, and
 * recommendations: none of those exist at this stage, and computing them
 * here would defeat the blind-judgment workflow (docs/digital-asset-v7-
 * judgment-protocol.md section on blind judgment).
 */

export interface JudgmentAuditReport {
  packets: number;
  entities: string[];
  cohort: string | null;
  criteriaExpected: number;
  criteriaCompletedByEntity: Record<string, number>;
  applicableCount: number;
  notApplicableCount: number;
  unknownApplicabilityCount: number;
  anchorsByCriterion: Record<string, number[]>;
  missingEvidenceLinkCount: number;
  contradictionsAcknowledgedCount: number;
  unacknowledgedContradictionCount: number;
  researchPacketHashMismatches: number;
  researchBaselineMismatches: number;
  methodologyFingerprintMismatches: number;
  forbiddenFieldHits: number;
  validationErrorCount: number;
  validationWarningCount: number;
}

export function buildJudgmentAuditReport(packets: readonly JudgmentPacket[], issues: readonly Issue[]): JudgmentAuditReport {
  const cohorts = new Set(packets.map((p) => p.cohort));
  const anchorsByCriterion: Record<string, number[]> = {};
  for (const id of DA_SCREENING_CRITERION_IDS) anchorsByCriterion[id] = [];

  let applicableCount = 0;
  let notApplicableCount = 0;
  let unknownApplicabilityCount = 0;
  let missingEvidenceLinkCount = 0;
  let contradictionsAcknowledgedCount = 0;
  const criteriaCompletedByEntity: Record<string, number> = {};

  for (const p of packets) {
    criteriaCompletedByEntity[p.entityId] = p.criterionJudgments.length;
    for (const c of p.criterionJudgments) {
      if (c.applicability === "applicable") {
        applicableCount += 1;
        if (c.rawAnchor !== null) anchorsByCriterion[c.criterionId]?.push(c.rawAnchor);
        if (c.citedEvidenceClaimIds.length === 0) missingEvidenceLinkCount += 1;
      } else if (c.applicability === "not_applicable") {
        notApplicableCount += 1;
      } else {
        unknownApplicabilityCount += 1;
      }
      contradictionsAcknowledgedCount += c.acknowledgedContradictionIds.length;
    }
  }

  const codeCount = (code: string, severity: "ERROR" | "WARNING") => issues.filter((i) => i.code === code && i.severity === severity).length;

  return {
    packets: packets.length,
    entities: [...packets.map((p) => p.entityId)].sort(),
    cohort: cohorts.size === 1 ? [...cohorts][0]! : null,
    criteriaExpected: DA_SCREENING_CRITERION_IDS.size,
    criteriaCompletedByEntity,
    applicableCount,
    notApplicableCount,
    unknownApplicabilityCount,
    anchorsByCriterion,
    missingEvidenceLinkCount,
    contradictionsAcknowledgedCount,
    unacknowledgedContradictionCount: codeCount("unacknowledged_contradiction", "ERROR"),
    researchPacketHashMismatches: codeCount("stale_research_packet", "ERROR"),
    researchBaselineMismatches: codeCount("wrong_research_baseline_commit", "ERROR"),
    methodologyFingerprintMismatches: codeCount("config_drift_detected", "ERROR"),
    forbiddenFieldHits: codeCount("forbidden_outcome_field", "ERROR"),
    validationErrorCount: issues.filter((i) => i.severity === "ERROR").length,
    validationWarningCount: issues.filter((i) => i.severity === "WARNING").length,
  };
}
