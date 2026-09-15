import { describe, it, expect } from "vitest";
import { compileJudgmentBatch } from "@/lib/judgments-v7/compile";
import { DA_SCREENING_CRITERION_IDS } from "@/lib/scoring/digital-asset/screening";
import { baseResearchPacket, otherResearchPacket, baseJudgmentPacket, syntheticClaim, SYNTHETIC_CLAIM_ID } from "./fixtures";

/**
 * Criterion-specific contradiction acknowledgment (Phase 3C-0.1 hardening).
 *
 * The required acknowledgment set for a criterion is exactly the union of
 * `contradicts` / `contradictedBy` across that criterion's OWN cited claims
 * (lib/judgments-v7/integrity.ts, checkContradictionAcknowledgment). This
 * file exercises the ten cases enumerated in the 3C-0.1 phase spec.
 */

const FIRST_CRITERION = [...DA_SCREENING_CRITERION_IDS][0]!;

describe("contradiction acknowledgment (Phase 3C-0.1)", () => {
  it("1. cited claim with no contradiction -> valid", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research);
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "case-1", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("2. cited claim contradicted by another claim, contradiction acknowledged -> valid", () => {
    // clm-synthetic-01 (the default-cited claim for every other criterion) stays
    // uncontested; the pair under test sits on separate claim ids only FIRST_CRITERION
    // cites, so the other 13 default criterion judgments are unaffected.
    const research = baseResearchPacket({
      evidenceClaims: [
        ...baseResearchPacket().evidenceClaims,
        syntheticClaim({ id: "clm-synthetic-b1" }),
        syntheticClaim({ id: "clm-synthetic-b2", contradicts: ["clm-synthetic-b1"] }),
      ],
    });
    const raw = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: { citedEvidenceClaimIds: ["clm-synthetic-b1"], acknowledgedContradictionIds: ["clm-synthetic-b2"] },
    });
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "case-2", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("3. cited claim contradicted by another claim, contradiction omitted -> ERROR", () => {
    const research = baseResearchPacket({
      evidenceClaims: [
        ...baseResearchPacket().evidenceClaims,
        syntheticClaim({ id: "clm-synthetic-b1" }),
        syntheticClaim({ id: "clm-synthetic-b2", contradicts: ["clm-synthetic-b1"] }),
      ],
    });
    const raw = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: { citedEvidenceClaimIds: ["clm-synthetic-b1"] },
    });
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "case-3", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "unacknowledged_contradiction")).toBe(true);
  });

  it("4. cited claim that contradicts another relevant claim, conflict acknowledged -> valid", () => {
    // Here the CITED claim is the one that names the contradiction, the mirror image
    // of case 2 (where the OTHER claim names it).
    const research = baseResearchPacket({
      evidenceClaims: [
        ...baseResearchPacket().evidenceClaims,
        syntheticClaim({ id: "clm-synthetic-b1", contradicts: ["clm-synthetic-b2"] }),
        syntheticClaim({ id: "clm-synthetic-b2" }),
      ],
    });
    const raw = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: { citedEvidenceClaimIds: ["clm-synthetic-b1"], acknowledgedContradictionIds: ["clm-synthetic-b2"] },
    });
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "case-4", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("5. acknowledged contradiction id does not exist -> ERROR", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: { acknowledgedContradictionIds: ["clm-does-not-exist"] },
    });
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "case-5", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "missing_cited_claim_id")).toBe(true);
  });

  it("6. acknowledged contradiction belongs to another entity -> ERROR", () => {
    const research = baseResearchPacket();
    const other = otherResearchPacket();
    const raw = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: { acknowledgedContradictionIds: ["clm-synthetic-other-01"] },
    });
    const researchByEntityId = new Map([
      [research.canonicalId, research],
      [other.canonicalId, other],
    ]);
    const result = compileJudgmentBatch([{ label: "case-6", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "claim_belongs_to_another_entity")).toBe(true);
  });

  it("7. an unrelated contradiction elsewhere in the research packet does NOT need acknowledgment", () => {
    const research = baseResearchPacket({
      evidenceClaims: [
        ...baseResearchPacket().evidenceClaims,
        syntheticClaim({ id: "clm-synthetic-02", claim: "An unrelated fact." }),
        syntheticClaim({ id: "clm-synthetic-03", claim: "A fact contradicting clm-synthetic-02.", contradicts: ["clm-synthetic-02"] }),
      ],
    });
    // Criterion cites only clm-synthetic-01, which has no relationship to the unrelated
    // clm-synthetic-02 / clm-synthetic-03 contradiction pair.
    const raw = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: { citedEvidenceClaimIds: [SYNTHETIC_CLAIM_ID] },
    });
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "case-7", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("8. not_applicable criterion with an unrelated contradiction elsewhere requires no acknowledgment", () => {
    const research = baseResearchPacket({
      evidenceClaims: [
        ...baseResearchPacket().evidenceClaims,
        syntheticClaim({ id: "clm-synthetic-02" }),
        syntheticClaim({ id: "clm-synthetic-03", contradicts: ["clm-synthetic-02"] }),
      ],
    });
    const raw = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: { applicability: "not_applicable", rationale: "Not applicable to this entity's structure." },
    });
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "case-8", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("9. unknown applicability may acknowledge a contradiction without requiring rawAnchor", () => {
    const research = baseResearchPacket({
      evidenceClaims: [
        ...baseResearchPacket().evidenceClaims,
        syntheticClaim({ id: "clm-synthetic-b1" }),
        syntheticClaim({ id: "clm-synthetic-b2", contradicts: ["clm-synthetic-b1"] }),
      ],
    });
    const raw = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: {
        applicability: "unknown",
        citedEvidenceClaimIds: ["clm-synthetic-b1"],
        acknowledgedContradictionIds: ["clm-synthetic-b2"],
        rationale: "Evidence is contradictory and insufficient to resolve applicability.",
      },
    });
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "case-9", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    const c = result.corpus!.entities[0]!.criteria.find((c) => c.criterionId === FIRST_CRITERION)!;
    expect(c.applicability).toBe("unknown");
    expect(c.rawAnchor).toBeNull();
  });

  it("an acknowledged id that exists for this entity but has no contradiction relationship to the cited evidence set is an ERROR", () => {
    const research = baseResearchPacket({
      evidenceClaims: [
        ...baseResearchPacket().evidenceClaims,
        syntheticClaim({ id: "clm-synthetic-b1", claim: "An unrelated claim, no contradiction to anything cited." }),
      ],
    });
    const raw = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: { citedEvidenceClaimIds: [SYNTHETIC_CLAIM_ID], acknowledgedContradictionIds: ["clm-synthetic-b1"] },
    });
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "case-unrelated-ack", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "unrelated_acknowledged_contradiction")).toBe(true);
  });

  it("10. acknowledging a contradiction never changes rawAnchor", () => {
    const research = baseResearchPacket({
      evidenceClaims: [
        ...baseResearchPacket().evidenceClaims,
        syntheticClaim({ id: "clm-synthetic-b1" }),
        syntheticClaim({ id: "clm-synthetic-b2", contradicts: ["clm-synthetic-b1"] }),
      ],
    });
    const withAck = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: { citedEvidenceClaimIds: ["clm-synthetic-b1"], acknowledgedContradictionIds: ["clm-synthetic-b2"], rawAnchor: 42 },
    });
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "case-10", raw: withAck }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    const c = result.corpus!.entities[0]!.criteria.find((c) => c.criterionId === FIRST_CRITERION)!;
    expect(c.rawAnchor).toBe(42);
  });
});
