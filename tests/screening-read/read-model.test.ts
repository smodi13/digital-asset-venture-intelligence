import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getScreeningWorklist,
  getCompanyScreeningDetail,
  getScreeningReadModelMeta,
  SCREENING_READ_AS_OF,
} from "@/lib/screening-read";
import { SCREENING_CRITERION_IDS } from "@/lib/scoring/screening";

const ROOT = process.cwd();
const oracle = JSON.parse(
  readFileSync(join(ROOT, "docs", "phase6c-descriptive-diagnostics.data.json"), "utf8"),
) as {
  screening: Array<{
    companyId: string;
    domain: string;
    screeningThesisFit: number;
    overallEvidenceCoverage: number;
    overallEvidenceConfidence: number;
    displayState: string;
    screeningEvidenceEligible: boolean;
    failedGates: string[];
    dimensions: Array<{ dimension: string; score: number; coverage: number; confidence: number; displayState: string }>;
  }>;
};

const assessments = JSON.parse(
  readFileSync(join(ROOT, "data", "analytical-inputs", "screening-assessments.json"), "utf8"),
) as {
  counts: { companies: number; criterionAssessments: number };
  companies: Record<string, { criteria: Record<string, unknown> }>;
};

const worklist = getScreeningWorklist();
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe("screening analytical inputs", () => {
  it("has 39 companies and 546 criterion assessments (14 per company)", () => {
    expect(assessments.counts).toMatchObject({ companies: 39, criterionAssessments: 546 });
    const ids = Object.keys(assessments.companies);
    expect(ids).toHaveLength(39);
    let total = 0;
    const seen = new Set<string>();
    for (const [companyId, co] of Object.entries(assessments.companies)) {
      const crit = Object.keys(co.criteria);
      expect(crit).toHaveLength(14);
      for (const c of crit) {
        expect(SCREENING_CRITERION_IDS.has(c)).toBe(true);
        const pair = `${companyId}::${c}`;
        expect(seen.has(pair)).toBe(false);
        seen.add(pair);
        total += 1;
      }
    }
    expect(total).toBe(546);
  });

  it("every cited claim id resolves against the canonical corpus", () => {
    const corpusIds = new Set(
      (JSON.parse(readFileSync(join(ROOT, "data", "generated", "evidence.json"), "utf8")).records as Array<{ id: string }>).map(
        (c) => c.id,
      ),
    );
    for (const co of Object.values(assessments.companies)) {
      for (const j of Object.values(co.criteria) as Array<{
        qualifyingClaimIds: string[];
        reviewedButExcludedClaimIds: string[];
      }>) {
        for (const id of [...j.qualifyingClaimIds, ...j.reviewedButExcludedClaimIds]) {
          expect(corpusIds.has(id), `unresolved claim ${id}`).toBe(true);
        }
      }
    }
  });
});

describe("screening worklist read", () => {
  it("returns all 39 companies", () => {
    expect(worklist).toHaveLength(39);
  });

  it("is ordered by canonical company id ascending, not by any score", () => {
    const ids = worklist.map((r) => r.identity.companyId);
    expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(ids);
  });

  it("is deterministic across calls", () => {
    expect(getScreeningWorklist()).toEqual(worklist);
  });

  it("exposes analyticalMode=screening and the Fit/Coverage/Confidence triad at full precision", () => {
    for (const r of worklist) {
      expect(r.analyticalMode).toBe("screening");
      expect(Number.isFinite(r.screeningThesisFit)).toBe(true);
      expect(r.overallEvidenceCoverage).toBeGreaterThanOrEqual(0);
      expect(r.overallEvidenceConfidence).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("phase 6c parity (oracle: docs/phase6c-descriptive-diagnostics.data.json)", () => {
  it("reproduces Screening Fit / Coverage / Confidence / display state for all 39 companies", () => {
    for (const o of oracle.screening) {
      const r = worklist.find((x) => x.identity.companyId === o.companyId)!;
      expect(r, o.domain).toBeDefined();
      close(r.screeningThesisFit, o.screeningThesisFit);
      close(r.overallEvidenceCoverage, o.overallEvidenceCoverage);
      close(r.overallEvidenceConfidence, o.overallEvidenceConfidence);
      expect(r.displayState, o.domain).toBe(o.displayState);
    }
  });

  it("reproduces per-dimension score / coverage / confidence / display state", () => {
    for (const o of oracle.screening) {
      const d = getCompanyScreeningDetail(o.companyId)!;
      for (const od of o.dimensions) {
        const rd = d.dimensions.find((x) => x.dimension === od.dimension)!;
        close(rd.score, od.score);
        close(rd.coverage, od.coverage);
        close(rd.confidence, od.confidence);
        expect(rd.displayState, `${o.domain} ${od.dimension}`).toBe(od.displayState);
      }
    }
  });

  it("reproduces the NON-mandate evidence-bar mechanics (never importing the ELIGIBLE assumption)", () => {
    for (const o of oracle.screening) {
      const r = worklist.find((x) => x.identity.companyId === o.companyId)!;
      const nonMandateGatesFailed = o.failedGates.filter((g) => !g.startsWith("mandate eligibility is"));
      expect(r.evidenceBar.nonMandateEvidenceBarPass, o.domain).toBe(nonMandateGatesFailed.length === 0);
    }
  });
});

describe("mandate + evidence-sufficiency semantics", () => {
  it("never defaults mandate to ELIGIBLE; every company is NOT_ASSESSED", () => {
    for (const r of worklist) expect(r.mandateStatus).toBe("NOT_ASSESSED");
  });

  it("emits null for full Screening evidence eligibility while mandate is unknown", () => {
    for (const r of worklist) expect(r.screeningEvidenceEligibility).toBeNull();
    for (const id of worklist.map((r) => r.identity.companyId)) {
      expect(getCompanyScreeningDetail(id)!.screeningEvidenceEligibility).toBeNull();
    }
  });

  it("exposes the calibrated non-mandate preconditions verbatim", () => {
    const withFailure = worklist.find((r) => !r.evidenceBar.nonMandateEvidenceBarPass)!;
    expect(withFailure.evidenceBar.failedPreconditions.length).toBeGreaterThan(0);
    for (const g of withFailure.evidenceBar.failedPreconditions) {
      expect(g.startsWith("mandate eligibility is")).toBe(false);
    }
  });

  it("keeps the critical-dimension guard zero-only (no 0.30 floor)", () => {
    for (const r of worklist) {
      const { criticalDimensionCoverage: cov, criticalDimensionsNonZeroCoveragePass: pass } = r.evidenceBar;
      expect(pass).toBe(cov.capital_efficiency > 0 && cov.growth_momentum > 0);
    }
  });

  it("no Fit value participates in the evidence bar (bar unchanged when only Fit would move)", () => {
    // The evidence bar is derived purely from coverage / confidence / dimension
    // breadth; SCREENING_EVIDENCE_SUFFICIENCY.minScreeningThesisFit is null.
    const raw = readFileSync(join(ROOT, "lib", "scoring", "config.ts"), "utf8");
    expect(raw).toMatch(/minScreeningThesisFit:\s*null/);
  });
});

describe("Phase 6D-B: no fabricated mandate state; explicit non-mandate helper", () => {
  const readSrc = readFileSync(join(ROOT, "lib", "screening-read", "index.ts"), "utf8");

  it("the production read layer never constructs a mandate value", () => {
    expect(readSrc).not.toMatch(/mandateEligibility\s*:/);
    expect(readSrc).not.toMatch(/evaluateScreeningEvidenceEligibility\b/);
  });

  it("the production read layer obtains non-mandate mechanics through the explicit helper", () => {
    expect(readSrc).toMatch(/evaluateScreeningEvidenceBarPreconditions/);
  });

  it("the non-mandate evidence-bar result is identical to composing the full evaluator and stripping the mandate gate", () => {
    for (const o of oracle.screening) {
      const r = worklist.find((x) => x.identity.companyId === o.companyId)!;
      const nonMandateGatesFailed = o.failedGates.filter((g) => !g.startsWith("mandate eligibility is"));
      expect(r.evidenceBar.failedPreconditions, o.domain).toEqual(nonMandateGatesFailed);
      expect(r.evidenceBar.nonMandateEvidenceBarPass).toBe(nonMandateGatesFailed.length === 0);
    }
  });

  it("Momentum / Convergence / Priority / rank types are absent from the read contract types", () => {
    const typesSrc = readFileSync(join(ROOT, "lib", "screening-read", "types.ts"), "utf8");
    expect(typesSrc).not.toMatch(/[Mm]omentumScore|[Cc]onvergenceScore|priorityScore|priorityState|rankEligible/);
  });
});

describe("Phase 6D-B: recentSignal carries canonical event status", () => {
  it("every recentSignal exposes a canonical eventStatus", () => {
    const valid = new Set(["completed", "reported_unconfirmed"]);
    let withSignal = 0;
    for (const r of worklist) {
      if (!r.recentSignal) continue;
      withSignal += 1;
      expect(valid.has(r.recentSignal.eventStatus), r.identity.companyId).toBe(true);
    }
    expect(withSignal).toBeGreaterThan(0);
  });

  it("a reported_unconfirmed most-recent event is preserved as reported_unconfirmed, never promoted to completed", () => {
    const events = JSON.parse(readFileSync(join(ROOT, "data", "generated", "signal-events.json"), "utf8"))
      .records as Array<{ companyId: string | null; eventStatus: string; eventDate: string | null; availabilityDate: string | null; publicationDate: string | null }>;
    const key = (e: { eventDate: string | null; availabilityDate: string | null; publicationDate: string | null }) =>
      e.eventDate ?? e.availabilityDate ?? e.publicationDate ?? "";
    const byCompany = new Map<string, typeof events>();
    for (const e of events) {
      if (!e.companyId) continue;
      const list = byCompany.get(e.companyId) ?? [];
      list.push(e);
      byCompany.set(e.companyId, list);
    }
    const unconfirmed = [...byCompany.entries()].filter(
      ([, list]) => [...list].sort((a, b) => key(b).localeCompare(key(a)))[0]!.eventStatus === "reported_unconfirmed",
    );
    expect(unconfirmed.length).toBeGreaterThan(0);
    for (const [companyId] of unconfirmed) {
      const row = worklist.find((r) => r.identity.companyId === companyId);
      if (!row?.recentSignal) continue;
      expect(row.recentSignal.eventStatus, companyId).toBe("reported_unconfirmed");
    }
  });

  it("the company detail signalEvents also carry eventStatus", () => {
    const d = worklist
      .map((r) => getCompanyScreeningDetail(r.identity.companyId)!)
      .find((x) => x.signalEvents.length > 0)!;
    for (const e of d.signalEvents) expect(typeof e.eventStatus).toBe("string");
  });
});

describe("display sufficiency", () => {
  it("uses only SCREENED / INSUFFICIENT_EVIDENCE", () => {
    for (const r of worklist) {
      expect(["SCREENED", "INSUFFICIENT_EVIDENCE"]).toContain(r.displayState);
    }
  });
});

describe("evidence gaps", () => {
  it("derives gaps deterministically without producing a score or recommendation", () => {
    const detail = getCompanyScreeningDetail(worklist[0]!.identity.companyId)!;
    const g = detail.evidenceGaps;
    expect(g).toHaveProperty("criticalDimensionGaps");
    expect(g).toHaveProperty("missingDimensions");
    expect(g).toHaveProperty("thinDimensions");
    expect(g).toHaveProperty("unresolvedConflicts");
    expect(g).toHaveProperty("reviewedButExcludedEvidence");
    expect(Array.isArray(g.researchQuestions)).toBe(true);
    expect(JSON.stringify(g)).not.toMatch(/priority|recommend|invest/i);
  });

  it("flags a critical dimension with zero coverage as blocking the evidence bar", () => {
    for (const id of worklist.map((r) => r.identity.companyId)) {
      const d = getCompanyScreeningDetail(id)!;
      for (const cg of d.evidenceGaps.criticalDimensionGaps) {
        expect(cg.blocksEvidenceBar).toBe(cg.coverage <= 0);
        if (cg.coverage <= 0) expect(d.evidenceBar.criticalDimensionsNonZeroCoveragePass).toBe(false);
      }
    }
  });
});

describe("provenance contract", () => {
  it("worklist row -> criterion -> claim -> source resolves without prose reconstruction", () => {
    const d = getCompanyScreeningDetail(worklist.find((r) => r.overallEvidenceCoverage > 0.5)!.identity.companyId)!;
    const claimIds = new Set(d.citedClaims.map((c) => c.claimId));
    for (const crit of d.criteria) {
      for (const cl of crit.supportingClaims) {
        expect(claimIds.has(cl.claimId)).toBe(true);
        expect(typeof cl.claim).toBe("string");
      }
    }
    const sourceIds = new Set(d.citedSources.map((s) => s.sourceId));
    for (const cl of d.citedClaims) {
      for (const sid of [cl.sourceId, ...cl.supportingSourceIds].filter(Boolean) as string[]) {
        expect(sourceIds.has(sid), `source ${sid}`).toBe(true);
      }
    }
  });

  it("does not expose raw source bodies or local paths", () => {
    const blob = JSON.stringify(getCompanyScreeningDetail(worklist[0]!.identity.companyId));
    expect(blob).not.toMatch(/\/Users\//);
    expect(blob).not.toMatch(/verbatimExcerpt/);
  });
});

describe("temporal exposure", () => {
  it("exposes canonical SignalEvents but NO Momentum / Convergence through the Screening contract", () => {
    const withEvents = worklist
      .map((r) => getCompanyScreeningDetail(r.identity.companyId)!)
      .find((d) => d.signalEvents.length > 0)!;
    expect(withEvents.signalEvents[0]).toHaveProperty("signalType");
    expect(withEvents.signalEvents[0]).toHaveProperty("signalDirection");
    // "growth_momentum" is a legitimate Screening dimension name; the ban is on
    // the Momentum / Convergence SCORING outputs.
    const blob = JSON.stringify(withEvents);
    expect(blob).not.toMatch(/momentumScore|netMomentum|positiveMomentum|negativeMomentum|familyScores/);
    expect(blob).not.toMatch(/convergenceScore|netConvergence|positiveConvergence|activeFamilies/);
  });

  it("the worklist row carries recent signal context but no Momentum score", () => {
    const blob = JSON.stringify(worklist);
    expect(blob).not.toMatch(/momentumScore|netMomentum|positiveMomentum|familyScores/);
    expect(blob).not.toMatch(/convergenceScore|netConvergence|positiveConvergence/);
  });
});

describe("no persisted score state", () => {
  it("snapshots.json still holds zero records", () => {
    const snap = JSON.parse(readFileSync(join(ROOT, "data", "generated", "snapshots.json"), "utf8"));
    expect(snap.recordCount).toBe(0);
    expect(snap.records).toEqual([]);
  });

  it("the read model meta reports 0 persisted ScoreSnapshots and the single as-of date", () => {
    const meta = getScreeningReadModelMeta();
    expect(meta.persistedScoreSnapshots).toBe(0);
    expect(meta.asOf).toBe(SCREENING_READ_AS_OF);
    expect(meta.companies).toBe(39);
    expect(meta.criterionAssessments).toBe(546);
  });

  it("no Priority / ranking / Fit band leaks into the contract", () => {
    const blob = JSON.stringify({ worklist, detail: getCompanyScreeningDetail(worklist[0]!.identity.companyId) });
    expect(blob).not.toMatch(/"priority/i);
    expect(blob).not.toMatch(/"rank/i);
    expect(blob).not.toMatch(/STRONG|MARGINAL|top quartile|"band"/);
  });
});

describe("research corpus unchanged", () => {
  it("still 39 / 222 / 510 / 84 / 113 at schema v6", () => {
    const count = (f: string) => JSON.parse(readFileSync(join(ROOT, "data", "generated", f), "utf8")).recordCount;
    expect(count("companies.json")).toBe(39);
    expect(count("sources.json")).toBe(222);
    expect(count("evidence.json")).toBe(510);
    expect(count("people.json")).toBe(84);
    expect(count("signal-events.json")).toBe(113);
  });
});
