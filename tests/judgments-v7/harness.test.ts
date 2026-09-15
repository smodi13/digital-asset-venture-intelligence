import { describe, it, expect } from "vitest";
import { validateJudgmentPacket } from "@/lib/judgments-v7/validate";
import { compileJudgmentBatch, type JudgmentCompileInput } from "@/lib/judgments-v7/compile";
import { FORBIDDEN_JUDGMENT_FIELDS } from "@/lib/judgments-v7/packet-schema";
import { DA_SCREENING_CRITERION_IDS } from "@/lib/scoring/digital-asset/screening";
import {
  baseResearchPacket,
  otherResearchPacket,
  baseJudgmentPacket,
  syntheticClaim,
} from "./fixtures";

const CRITERIA = [...DA_SCREENING_CRITERION_IDS];
const FIRST_CRITERION = CRITERIA[0]!;

describe("v7 judgment harness synthetic coverage (Phase 3C-0, fixtures A-T)", () => {
  it("A: fully applicable criterion with evidence and anchor validates cleanly", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research);
    const result = validateJudgmentPacket(raw, "fixture-a");
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    const c = result.packet!.criterionJudgments.find((c) => c.criterionId === FIRST_CRITERION)!;
    expect(c.applicability).toBe("applicable");
    expect(c.rawAnchor).toBe(60);
    expect(c.coverage).toBe(1);
  });

  it("B: not_applicable criterion carries null rawAnchor/coverage and no evidence", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: { applicability: "not_applicable", rationale: "No token exposure exists or is committed for this equity-only entity." },
    });
    const result = validateJudgmentPacket(raw, "fixture-b");
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    const c = result.packet!.criterionJudgments.find((c) => c.criterionId === FIRST_CRITERION)!;
    expect(c.applicability).toBe("not_applicable");
    expect(c.rawAnchor).toBeNull();
    expect(c.coverage).toBeNull();
    expect(c.citedEvidenceClaimIds).toEqual([]);
  });

  it("C: unknown applicability carries null rawAnchor/coverage, distinct from not_applicable", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: { applicability: "unknown", rationale: "Whether token exposure exists is not established by the frozen research." },
    });
    const result = validateJudgmentPacket(raw, "fixture-c");
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    const c = result.packet!.criterionJudgments.find((c) => c.criterionId === FIRST_CRITERION)!;
    expect(c.applicability).toBe("unknown");
    expect(c.rawAnchor).toBeNull();
  });

  it("D: missing cited claim id is an integrity ERROR", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: { citedEvidenceClaimIds: ["clm-does-not-exist"] },
    });
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "fixture-d", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "missing_cited_claim_id")).toBe(true);
  });

  it("E: cited claim belonging to another entity is an integrity ERROR", () => {
    const research = baseResearchPacket();
    const other = otherResearchPacket();
    const raw = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: { citedEvidenceClaimIds: ["clm-synthetic-other-01"] },
    });
    const researchByEntityId = new Map([
      [research.canonicalId, research],
      [other.canonicalId, other],
    ]);
    const result = compileJudgmentBatch([{ label: "fixture-e", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "claim_belongs_to_another_entity")).toBe(true);
  });

  it("F: stale research packet hash is an integrity ERROR", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research);
    const mutatedResearch = baseResearchPacket({ description: "A mutated description after the judgment was made." });
    const researchByEntityId = new Map([[mutatedResearch.canonicalId, mutatedResearch]]);
    const result = compileJudgmentBatch([{ label: "fixture-f", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "stale_research_packet")).toBe(true);
  });

  it("G: wrong research baseline commit is an integrity ERROR", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research, { researchBaselineCommit: "1111111111111111111111111111111111111a".padEnd(40, "1") });
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "fixture-g", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "wrong_research_baseline_commit")).toBe(true);
  });

  it("H: forbidden aggregate score field is a schema-level ERROR, before any binding check", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research, { thesisFit: 72 });
    const result = validateJudgmentPacket(raw, "fixture-h");
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "forbidden_outcome_field")).toBe(true);
  });

  it("H2: rawAnchor itself is never rejected as a forbidden field", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research);
    const result = validateJudgmentPacket(raw, "fixture-h2");
    expect(result.issues.some((i) => i.code === "forbidden_outcome_field")).toBe(false);
  });

  it("H3: the forbidden-field registry has exactly 13 entries (Phase 3C-0.1 count reconciliation)", () => {
    expect(FORBIDDEN_JUDGMENT_FIELDS.length).toBe(13);
    expect(new Set(FORBIDDEN_JUDGMENT_FIELDS).size).toBe(13);
  });

  it("I: missing criterion judgment is a schema ERROR", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research);
    (raw.criterionJudgments as unknown[]).pop();
    const result = validateJudgmentPacket(raw, "fixture-i");
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /missing criterion judgment/.test(i.message))).toBe(true);
  });

  it("J: duplicate criterion judgment is a schema ERROR", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research);
    const criteria = raw.criterionJudgments as Record<string, unknown>[];
    criteria.push({ ...criteria[0]! });
    const result = validateJudgmentPacket(raw, "fixture-j");
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /duplicate criterion judgment/.test(i.message))).toBe(true);
  });

  it("K: invalid rawAnchor (out of 0-100 range) is a schema ERROR", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research, {}, { [FIRST_CRITERION]: { rawAnchor: 150 } });
    const result = validateJudgmentPacket(raw, "fixture-k");
    expect(result.ok).toBe(false);
  });

  it("L: contradiction present and acknowledged resolves cleanly", () => {
    // clm-synthetic-01 (the default-cited claim for every other criterion) stays
    // uncontested; the contradiction pair sits on a separate claim only FIRST_CRITERION
    // cites, so the other 13 default criterion judgments are unaffected.
    const research = baseResearchPacket({
      evidenceClaims: [
        ...baseResearchPacket().evidenceClaims,
        syntheticClaim({ id: "clm-synthetic-b1", claim: "Synthetic Widgets Inc's v1 shipped on schedule." }),
        syntheticClaim({ id: "clm-synthetic-b2", claim: "A later source states the v1 shipment slipped to August 2026.", contradicts: ["clm-synthetic-b1"] }),
      ],
    });
    const raw = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: {
        citedEvidenceClaimIds: ["clm-synthetic-b1"],
        acknowledgedContradictionIds: ["clm-synthetic-b2"],
        rationale: "Evidence is mixed on ship date; anchor reflects the acknowledged contradiction.",
      },
    });
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "fixture-l", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("M: a material contradiction tied to cited evidence, omitted from acknowledgment, is a structural ERROR (Phase 3C-0.1 hardening)", () => {
    const research = baseResearchPacket({
      evidenceClaims: [
        ...baseResearchPacket().evidenceClaims,
        syntheticClaim({ id: "clm-synthetic-b1", claim: "Synthetic Widgets Inc's v1 shipped on schedule." }),
        syntheticClaim({ id: "clm-synthetic-b2", claim: "A later source states the v1 shipment slipped to August 2026.", contradicts: ["clm-synthetic-b1"] }),
      ],
    });
    const raw = baseJudgmentPacket(research, {}, { [FIRST_CRITERION]: { citedEvidenceClaimIds: ["clm-synthetic-b1"] } });
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "fixture-m", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "unacknowledged_contradiction")).toBe(true);
  });

  it("N: insufficient evidence is recorded as unknown applicability, never a fabricated neutral applicable anchor", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: { applicability: "unknown", evidenceGapNote: "No frozen evidence establishes this criterion for this entity." },
    });
    const result = validateJudgmentPacket(raw, "fixture-n");
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    const c = result.packet!.criterionJudgments.find((c) => c.criterionId === FIRST_CRITERION)!;
    expect(c.rawAnchor).toBeNull();
    expect(c.applicability).toBe("unknown");
  });

  it("O: token metric present in research does not auto-convert to a positive anchor (packet schema carries no such path)", () => {
    // The packet schema has no field through which a raw metric could set rawAnchor.
    // rawAnchor is always an explicit analyst-supplied number; this test proves the
    // schema affords no automatic-positive path, without needing a real token metric.
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: { rawAnchor: 40, rationale: "Evidence is thin despite the entity carrying token exposure; anchor reflects the evidence, not the metric." },
    });
    const result = validateJudgmentPacket(raw, "fixture-o");
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    expect(result.packet!.criterionJudgments.find((c) => c.criterionId === FIRST_CRITERION)!.rawAnchor).toBe(40);
  });

  it("P: high funding does not auto-convert to a positive anchor (same schema affordance argument as O)", () => {
    const research = baseResearchPacket({ financingStage: "series_c" });
    const raw = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: { rawAnchor: 30, rationale: "Large financing alone is not scale; anchor reflects observable scale relative to capital, not the raise size." },
    });
    const result = validateJudgmentPacket(raw, "fixture-p");
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("Q: the zero-coverage critical-dimension guard is a downstream scoring concern, not something the judgment packet assigns", () => {
    // lib/scoring/digital-asset/config.ts DA_CRITICAL_DIMENSION_EVIDENCE_GUARD is not a
    // packet field and cannot be set here. The packet only ever supplies per-criterion
    // coverage; guard evaluation happens in a later, separate scoring stage.
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research);
    expect("criticalDimensionGuard" in raw).toBe(false);
    const result = validateJudgmentPacket(raw, "fixture-q");
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("R: wrong cohort against the targeted batch is an integrity ERROR", () => {
    const research = baseResearchPacket({ cohort: "CALIBRATION" });
    const raw = baseJudgmentPacket(research);
    (raw as Record<string, unknown>).cohort = "VALIDATION";
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "fixture-r", raw }], { batch: "CALIBRATION", researchByEntityId });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "cohort_mismatch" || i.code === "wrong_cohort")).toBe(true);
  });

  it("S: all 14 criterion ids exactly once is required and sufficient", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research);
    const ids = (raw.criterionJudgments as Record<string, unknown>[]).map((c) => c.criterionId);
    expect(new Set(ids).size).toBe(14);
    expect(ids.sort()).toEqual([...CRITERIA].sort());
    const result = validateJudgmentPacket(raw, "fixture-s");
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("T: deterministic compiled analytical-input output is byte-identical across repeated compilation", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research);
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const now = new Date("2026-09-11T00:00:00.000Z");
    const inputs: JudgmentCompileInput[] = [{ label: "fixture-t", raw }];

    const first = compileJudgmentBatch(inputs, { batch: "CALIBRATION", researchByEntityId, now });
    const second = compileJudgmentBatch(inputs, { batch: "CALIBRATION", researchByEntityId, now });

    expect(first.ok, JSON.stringify(first.issues)).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.files).toEqual(second.files);
  });

  it("compiled analytical input contains only the CriterionScoreInput shape, no rationale/evidence text", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research);
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "fixture-shape", raw }], { batch: "CALIBRATION", researchByEntityId });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    const entity = result.corpus!.entities[0]!;
    for (const c of entity.criteria) {
      expect(Object.keys(c).sort()).toEqual(["applicability", "coverage", "criterionId", "rawAnchor"].sort());
    }
  });

  it("config drift: a tampered methodology fingerprint is an integrity ERROR", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research, { methodologyConfigFingerprint: "sha256:" + "0".repeat(64) });
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "fixture-drift", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "config_drift_detected")).toBe(true);
  });

  it("no research packet supplied for the entity is an integrity ERROR", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research);
    const result = compileJudgmentBatch([{ label: "fixture-nores", raw }], { batch: "SYNTHETIC", researchByEntityId: new Map() });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "research_packet_not_found")).toBe(true);
  });

  it("duplicate judgment packets for the same entity is a batch-level ERROR", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research);
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch(
      [
        { label: "fixture-dup-1", raw },
        { label: "fixture-dup-2", raw: { ...raw } },
      ],
      { batch: "SYNTHETIC", researchByEntityId },
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "duplicate_judgment_packet")).toBe(true);
  });

  it("Phase 3C-1A.1: applicable criterion with coverage 0 and zero cited claims is NOT flagged (sanctioned evidence-gap representation)", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: {
        rawAnchor: 50,
        coverage: 0,
        citedEvidenceClaimIds: [],
        rationale: "No frozen evidence bears on this criterion; anchor is a downstream-inert neutral placeholder.",
        evidenceGapNote: "No relevant EvidenceClaim exists in the frozen packet for this criterion.",
      },
    });
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "fixture-coverage-zero", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    expect(result.issues.some((i) => i.code === "coverage_without_cited_evidence")).toBe(false);
  });

  it("Phase 3C-1A.1: applicable criterion with coverage > 0 and zero cited claims is a structural ERROR", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research, {}, {
      [FIRST_CRITERION]: {
        rawAnchor: 55,
        coverage: 0.5,
        citedEvidenceClaimIds: [],
        rationale: "Anchor asserts partial evidentiary confidence without citing any supporting claim.",
      },
    });
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "fixture-coverage-uncited", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "coverage_without_cited_evidence")).toBe(true);
  });
});
