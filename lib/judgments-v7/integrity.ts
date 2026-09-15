import type { JudgmentPacket } from "./packet-schema";
import type { Packet as ResearchPacket } from "@/lib/research-v7/packet-schema";
import { issue, type Issue } from "./validate";
import { checkResearchBinding } from "./research-binding";
import { FROZEN_RESEARCH_BASELINE_COMMIT } from "./dates";
import { DA_METHODOLOGY_FINGERPRINT } from "./methodology-fingerprint";
import { allDuplicates } from "@/lib/research-v7/ids";

/**
 * Cross-record judgment integrity checks (Phase 3C-0, PARALLEL / DORMANT).
 *
 * Runs after every packet has individually passed schema validation
 * (validate.ts). These checks require the actual frozen research packet the
 * judgment claims to bind to, so a judgment packet can never be silently
 * accepted against research that has moved out from under it.
 */

/** Bind one judgment packet to its claimed research packet and report every discrepancy. */
export function checkResearchAndMethodologyBinding(
  judgment: JudgmentPacket,
  researchByEntityId: Map<string, ResearchPacket>,
): Issue[] {
  const issues: Issue[] = [];

  if (judgment.researchBaselineCommit !== FROZEN_RESEARCH_BASELINE_COMMIT) {
    issues.push(
      issue(
        "ERROR",
        "wrong_research_baseline_commit",
        `Judgment claims research baseline "${judgment.researchBaselineCommit}", but the frozen CALIBRATION baseline is "${FROZEN_RESEARCH_BASELINE_COMMIT}".`,
        { packetId: judgment.entityId, path: "researchBaselineCommit" },
      ),
    );
  }

  if (judgment.methodologyConfigFingerprint !== DA_METHODOLOGY_FINGERPRINT) {
    issues.push(
      issue(
        "ERROR",
        "config_drift_detected",
        `Judgment's stored methodology/config fingerprint no longer matches the live digital-asset scoring configuration. The judgment was made under a different configuration than the one now in force.`,
        { packetId: judgment.entityId, path: "methodologyConfigFingerprint" },
      ),
    );
  }

  const research = researchByEntityId.get(judgment.entityId);
  if (!research) {
    issues.push(
      issue(
        "ERROR",
        "research_packet_not_found",
        `No frozen research packet was supplied for entity "${judgment.entityId}". A judgment cannot be validated without the exact research it was judged against.`,
        { packetId: judgment.entityId, path: "entityId" },
      ),
    );
    return issues;
  }

  if (research.cohort !== judgment.cohort) {
    issues.push(
      issue(
        "ERROR",
        "cohort_mismatch",
        `Judgment declares cohort "${judgment.cohort}" but the bound research packet's cohort is "${research.cohort}".`,
        { packetId: judgment.entityId, path: "cohort" },
      ),
    );
  }

  const binding = checkResearchBinding(judgment.researchPacketSha256, research);
  if (binding.staleResearchPacket) {
    issues.push(
      issue(
        "ERROR",
        "stale_research_packet",
        `Judgment's bound research-packet hash "${judgment.researchPacketSha256}" does not match the currently supplied research packet's hash "${binding.currentHash}". The research packet was mutated after this judgment was made, or the wrong research packet was supplied.`,
        { packetId: judgment.entityId, path: "researchPacketSha256" },
      ),
    );
  }

  // Resolve against every supplied research packet, not just the bound one, so a claim
  // id that exists but belongs to a different entity's frozen research is reported as
  // "claim_belongs_to_another_entity" rather than the less specific "missing".
  const claimOwner = new Map<string, string>();
  for (const p of researchByEntityId.values()) {
    for (const c of p.evidenceClaims) claimOwner.set(c.id, c.companyId);
  }

  for (const criterion of judgment.criterionJudgments) {
    for (const claimId of [...criterion.citedEvidenceClaimIds, ...criterion.acknowledgedContradictionIds]) {
      if (!claimOwner.has(claimId)) {
        issues.push(
          issue(
            "ERROR",
            "missing_cited_claim_id",
            `Criterion "${criterion.criterionId}" cites EvidenceClaim "${claimId}", which does not exist in the bound research packet for "${judgment.entityId}".`,
            { packetId: judgment.entityId, path: `criterionJudgments.${criterion.criterionId}` },
          ),
        );
        continue;
      }
      const owner = claimOwner.get(claimId);
      if (owner !== judgment.entityId) {
        issues.push(
          issue(
            "ERROR",
            "claim_belongs_to_another_entity",
            `Criterion "${criterion.criterionId}" cites EvidenceClaim "${claimId}", which belongs to entity "${owner}", not "${judgment.entityId}".`,
            { packetId: judgment.entityId, path: `criterionJudgments.${criterion.criterionId}` },
          ),
        );
      }
    }
  }

  return issues;
}

/**
 * Criterion-specific contradiction acknowledgment (Phase 3C-0.1).
 *
 * A cited EvidenceClaim's `contradicts` / `contradictedBy` (lib/schemas/evidence-claim.ts)
 * is the ONLY contradiction graph in the system; this does not invent a second one. For
 * every criterion, the required acknowledgment set is exactly the union of `contradicts`
 * and `contradictedBy` across that criterion's OWN cited claims -- never every
 * contradiction anywhere in the entity's research packet. A contradiction elsewhere in
 * the packet, unrelated to what this criterion cites, requires nothing here.
 *
 * This only enforces that the relevant contradiction id is LISTED in
 * acknowledgedContradictionIds. It has no effect on rawAnchor, coverage, applicability,
 * or any scoring rule: acknowledgment is a disclosure requirement, not a penalty.
 */
export function checkContradictionAcknowledgment(
  judgment: JudgmentPacket,
  researchByEntityId: Map<string, ResearchPacket>,
): Issue[] {
  const issues: Issue[] = [];
  const research = researchByEntityId.get(judgment.entityId);
  if (!research) return issues; // already reported by checkResearchAndMethodologyBinding

  const claimById = new Map(research.evidenceClaims.map((c) => [c.id, c]));

  // A symmetric adjacency map, built without assuming an author kept contradicts /
  // contradictedBy symmetric on both claims (research-v7's own integrity checks do not
  // enforce that): whichever side names the relationship, both ends carry it here.
  const contradictionPartners = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!contradictionPartners.has(a)) contradictionPartners.set(a, new Set());
    if (!contradictionPartners.has(b)) contradictionPartners.set(b, new Set());
    contradictionPartners.get(a)!.add(b);
    contradictionPartners.get(b)!.add(a);
  };
  for (const c of research.evidenceClaims) {
    for (const id of c.contradicts) link(c.id, id);
    for (const id of c.contradictedBy) link(c.id, id);
  }

  for (const criterion of judgment.criterionJudgments) {
    const required = new Set<string>();
    for (const claimId of criterion.citedEvidenceClaimIds) {
      if (!claimById.has(claimId)) continue; // reported separately as missing_cited_claim_id / claim_belongs_to_another_entity
      for (const id of contradictionPartners.get(claimId) ?? []) required.add(id);
    }

    const acknowledged = new Set(criterion.acknowledgedContradictionIds);

    for (const id of required) {
      if (!acknowledged.has(id)) {
        issues.push(
          issue(
            "ERROR",
            "unacknowledged_contradiction",
            `Criterion "${criterion.criterionId}" cites evidence with a material contradiction relationship to "${id}", which is not listed in acknowledgedContradictionIds.`,
            { packetId: judgment.entityId, path: `criterionJudgments.${criterion.criterionId}` },
          ),
        );
      }
    }

    for (const id of criterion.acknowledgedContradictionIds) {
      if (required.has(id)) continue;
      // Existence / cross-entity ownership is already reported by checkResearchAndMethodologyBinding.
      // Here, only flag an acknowledgment that resolves to a real claim of this entity but has no
      // contradiction relationship to this criterion's cited evidence set.
      if (claimById.has(id)) {
        issues.push(
          issue(
            "ERROR",
            "unrelated_acknowledged_contradiction",
            `Criterion "${criterion.criterionId}" acknowledges "${id}", which has no contradiction relationship to its cited evidence set.`,
            { packetId: judgment.entityId, path: `criterionJudgments.${criterion.criterionId}` },
          ),
        );
      }
    }
  }

  return issues;
}

/**
 * Evidence-coverage binding (Phase 3C-1A.1).
 *
 * Narrow, intentionally scoped rule: an applicable criterion claiming
 * non-zero evidence coverage (0.5 or 1) must cite at least one EvidenceClaim
 * that backs it. `coverage: 0` at `applicability: "applicable"` is the
 * sanctioned representation for "this criterion applies but the frozen
 * packet contains no responsible evidence to anchor it" (it renders the
 * rawAnchor downstream-inert, identical to unknown applicability's neutral
 * 50 -- see `renormalizeDimension`, `lib/scoring/digital-asset/applicability.ts`)
 * and is therefore NOT flagged here even with zero cited claims: forcing a
 * citation in that case would mean pretending a weakly related or
 * nonexistent claim supports the anchor, which the judgment protocol
 * forbids. Only a claimed coverage above zero without any citation is
 * flagged, since that combination asserts partial/full evidentiary
 * confidence while citing nothing to justify it.
 */
export function checkEvidenceCoverageBinding(judgment: JudgmentPacket): Issue[] {
  const issues: Issue[] = [];
  for (const criterion of judgment.criterionJudgments) {
    if (criterion.applicability !== "applicable") continue;
    if ((criterion.coverage ?? 0) > 0 && criterion.citedEvidenceClaimIds.length === 0) {
      issues.push(
        issue(
          "ERROR",
          "coverage_without_cited_evidence",
          `Criterion "${criterion.criterionId}" claims coverage ${criterion.coverage} but cites zero EvidenceClaim ids. Non-zero coverage requires at least one cited claim; use coverage 0 (with an evidenceGapNote) when no frozen evidence supports the anchor.`,
          { packetId: judgment.entityId, path: `criterionJudgments.${criterion.criterionId}` },
        ),
      );
    }
  }
  return issues;
}

/** Batch-level checks: duplicate judgment packets for the same entity. */
export function checkJudgmentBatchDedupe(judgments: readonly JudgmentPacket[]): Issue[] {
  const issues: Issue[] = [];
  const dupes = allDuplicates(judgments.map((j) => j.entityId));
  for (const entityId of dupes) {
    issues.push(issue("ERROR", "duplicate_judgment_packet", `More than one judgment packet was supplied for entity "${entityId}".`, { packetId: entityId }));
  }
  return issues;
}
