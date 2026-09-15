import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  buildDiagnostics,
  quantiles,
  pearson,
  AS_OF,
  DIAGNOSTIC_BANNER,
} from "@/scripts/diagnostics/phase6c-diagnostics";

/**
 * The three Phase 5C human judgment packets are local-only audit artifacts
 * (git-ignored by design). When they are absent - a fresh clone or CI - the
 * corpus-dependent assertions are skipped; the pure stat helpers still run.
 */
const PACKETS_PRESENT = [
  "originationiq_phase5c_c_screening_calibration_v2.json",
  "originationiq_phase5c_f_validation_screening_judgments.json",
  "originationiq_phase5c_g_final_test_screening_judgments.json",
].every((f) => existsSync(join(process.cwd(), f)));

/**
 * Phase 6C diagnostic-plumbing tests.
 *
 * These lock the reproducibility of the DESCRIPTIVE_DIAGNOSTIC_ONLY runner:
 * judgment-packet reconciliation, canonical ordering, no persisted snapshots,
 * and the stat helpers. They do NOT assert any threshold, weight, or ranking.
 */

const out = PACKETS_PRESENT ? buildDiagnostics() : null;

describe.skipIf(!PACKETS_PRESENT)("phase 6c diagnostic plumbing (needs local judgment packets)", () => {
  if (!out) return;
  it("is marked descriptive-only and uses the single phase as-of date", () => {
    expect(out.banner).toBe(DIAGNOSTIC_BANNER);
    expect(out.asOf).toBe("2026-09-08");
    expect(AS_OF).toBe("2026-09-08");
  });

  it("reconciles the three locked judgment packets to 39 companies / 546 criterion judgments", () => {
    expect(out.reconciliation.ok).toBe(true);
    expect(out.reconciliation.companies).toBe(39);
    expect(out.reconciliation.criterionJudgments).toBe(546);
    expect(out.reconciliation.criteriaPerCompany).toEqual([14]);
    expect(out.reconciliation.unresolvedClaimIds).toEqual([]);
    expect(out.reconciliation.byCohort).toEqual({
      calibration: { companies: 10, judgments: 140 },
      validation: { companies: 15, judgments: 210 },
      final_test: { companies: 14, judgments: 196 },
    });
  });

  it("matches the canonical corpus counts and persists no snapshots", () => {
    expect(out.corpusCounts).toEqual({
      companies: 39,
      sources: 222,
      evidenceClaims: 510,
      people: 84,
      signalEvents: 113,
      persistedSnapshots: 0,
    });
  });

  it("runs Screening Fit for all 39 companies in canonical (company id) order", () => {
    expect(out.screening).toHaveLength(39);
    const ids = out.screening.map((s) => s.companyId);
    expect([...ids].sort()).toEqual(ids);
    for (const s of out.screening) {
      expect(s.analyticalMode).toBe("screening");
      expect(Number.isFinite(s.screeningThesisFit)).toBe(true);
    }
  });

  it("reproduces the Phase 5C-D calibration Fit / coverage / confidence values", () => {
    const rillet = out.screening.find((s) => s.domain === "rillet.com")!;
    expect(rillet.screeningThesisFit).toBeCloseTo(54.99375, 4);
    expect(rillet.overallEvidenceCoverage).toBeCloseTo(0.3575, 4);
    expect(rillet.overallEvidenceConfidence).toBeCloseTo(0.7251748, 4);
  });

  it("is deterministic across runs", () => {
    const again = buildDiagnostics();
    expect(again.screening).toEqual(out.screening);
    expect(again.temporal).toEqual(out.temporal);
  });

});

describe("phase 6c stat helpers", () => {
  it("quantiles and pearson behave", () => {
    expect(quantiles([1, 2, 3, 4, 5])).toMatchObject({ min: 1, median: 3, max: 5, n: 5 });
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNaN();
  });
});
