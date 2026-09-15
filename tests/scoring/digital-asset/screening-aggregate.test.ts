import { describe, it, expect } from "vitest";
import { scoreScreeningEntity } from "@/lib/scoring/digital-asset/screening-aggregate";
import { DA_SCREENING_CRITERION_IDS } from "@/lib/scoring/digital-asset/screening";
import type { CompiledEntityAnalyticalInput } from "@/lib/judgments-v7/compile";

function entity(
  overrides: Partial<Record<string, { rawAnchor: number; coverage: number; confidence?: number }>> = {},
): CompiledEntityAnalyticalInput {
  return {
    entityId: "co-test",
    candidateId: "TST-01",
    cohort: "CALIBRATION",
    mandateStatus: "NOT_ASSESSED",
    researchBaselineCommit: "0".repeat(40),
    researchPacketSha256: `sha256:${"a".repeat(64)}`,
    methodologyConfigFingerprint: `sha256:${"b".repeat(64)}`,
    criteria: [...DA_SCREENING_CRITERION_IDS].map((criterionId) => ({
      criterionId,
      applicability: "applicable" as const,
      rawAnchor: overrides[criterionId]?.rawAnchor ?? null,
      coverage: overrides[criterionId]?.coverage ?? 0,
      confidence: overrides[criterionId]?.confidence,
    })),
  };
}

describe("scoreScreeningEntity", () => {
  it("an entity with all-zero coverage scores exactly neutral 50 with zero overall coverage", () => {
    const result = scoreScreeningEntity(entity());
    expect(result.thesisFit).toBeCloseTo(50, 9);
    expect(result.overallCoverage).toBeCloseTo(0, 9);
    expect(result.dimensions).toHaveLength(7);
    expect(result.overallConfidence).toBe(0);
    expect(result.rankEligibility).toBe("NOT_ASSESSED");
    expect(result.displayState).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("zero coverage never fabricates positive confidence even when a confidence value is supplied", () => {
    const result = scoreScreeningEntity(
      entity({ team_execution_credibility: { rawAnchor: 65, coverage: 0, confidence: 0.9 } }),
    );
    expect(result.overallConfidence).toBe(0);
  });

  it("high confidence does not imply high coverage, and high coverage does not imply high confidence", () => {
    const highConfidenceLowCoverage = scoreScreeningEntity(
      entity({ team_execution_credibility: { rawAnchor: 65, coverage: 0.5, confidence: 0.95 } }),
    );
    const lowConfidenceHighCoverage = scoreScreeningEntity(
      entity({ team_execution_credibility: { rawAnchor: 65, coverage: 0.5, confidence: 0.05 } }),
    );
    expect(highConfidenceLowCoverage.overallCoverage).toBeCloseTo(lowConfidenceHighCoverage.overallCoverage, 9);
    expect(highConfidenceLowCoverage.overallConfidence).toBeGreaterThan(lowConfidenceHighCoverage.overallConfidence);
  });

  it("a fully-evidenced, uniformly positive entity moves thesisFit toward the anchor and overall coverage toward 1", () => {
    const overrides: Record<string, { rawAnchor: number; coverage: number }> = {};
    for (const id of DA_SCREENING_CRITERION_IDS) overrides[id] = { rawAnchor: 80, coverage: 1 };
    const result = scoreScreeningEntity(entity(overrides));
    expect(result.thesisFit).toBeCloseTo(80, 9);
    expect(result.overallCoverage).toBeCloseTo(1, 9);
  });

  it("critical-dimension guard fails when capital_efficiency has zero coverage even if growth_momentum is fully evidenced", () => {
    const result = scoreScreeningEntity(
      entity({
        adoption_and_usage_momentum: { rawAnchor: 70, coverage: 1 },
        developer_and_ecosystem_momentum: { rawAnchor: 70, coverage: 1 },
      }),
    );
    expect(result.criticalDimensionGuard.coverageByDimension.growth_momentum).toBeGreaterThan(0);
    expect(result.criticalDimensionGuard.coverageByDimension.capital_efficiency).toBe(0);
    expect(result.criticalDimensionGuard.pass).toBe(false);
  });

  it("critical-dimension guard passes once both critical dimensions have any nonzero coverage", () => {
    const result = scoreScreeningEntity(
      entity({
        observable_scale_vs_capital: { rawAnchor: 60, coverage: 0.5 },
        adoption_and_usage_momentum: { rawAnchor: 60, coverage: 0.5 },
      }),
    );
    expect(result.criticalDimensionGuard.pass).toBe(true);
  });

  it("is deterministic: identical input scores identically on repeat calls", () => {
    const input = entity({ team_execution_credibility: { rawAnchor: 65, coverage: 1 } });
    const a = scoreScreeningEntity(input);
    const b = scoreScreeningEntity(input);
    expect(a).toEqual(b);
  });
});
