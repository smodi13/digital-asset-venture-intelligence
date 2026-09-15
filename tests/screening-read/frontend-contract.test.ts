import { describe, it, expect } from "vitest";
import {
  getScreeningWorklist,
  getCompanyScreeningDetail,
  getCompanyDirectory,
} from "@/lib/screening-read";
import { fitDisplay, pct, gaugeSegments, dimensionLabel } from "@/lib/ui/format";

/**
 * Phase 6D-C frontend data contract. The UI is driven entirely by this read
 * model; these assertions pin the properties the interface relies on and the
 * things it must never be able to render.
 */

const worklist = getScreeningWorklist();

describe("worklist contract", () => {
  it("returns all 39 companies in the deterministic neutral order (canonical id asc)", () => {
    expect(worklist).toHaveLength(39);
    const ids = worklist.map((r) => r.identity.companyId);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
  });

  it("exposes Fit as a raw number with no band or rank field", () => {
    for (const r of worklist) {
      expect(typeof r.screeningThesisFit).toBe("number");
      expect(r).not.toHaveProperty("fitBand");
      expect(r).not.toHaveProperty("rank");
      expect(r).not.toHaveProperty("priority");
      expect(r).not.toHaveProperty("recommendation");
    }
  });

  it("keeps Coverage and Confidence as two separate values, never merged", () => {
    for (const r of worklist) {
      expect(typeof r.overallEvidenceCoverage).toBe("number");
      expect(typeof r.overallEvidenceConfidence).toBe("number");
      expect(r).not.toHaveProperty("trust");
      expect(r).not.toHaveProperty("compositeConfidence");
    }
  });

  it("reports mandate NOT_ASSESSED and null evidence eligibility for every company", () => {
    for (const r of worklist) {
      expect(r.mandateStatus).toBe("NOT_ASSESSED");
      expect(r.screeningEvidenceEligibility).toBeNull();
    }
  });

  it("never exposes a Momentum or Convergence score on a worklist row", () => {
    // growth_momentum is a legitimate thesis dimension id; the productionised
    // Momentum/Convergence SCORES are what must never appear.
    for (const r of worklist) {
      const blob = JSON.stringify(r).toLowerCase();
      for (const banned of [
        "momentumscore",
        "netmomentum",
        "positivemomentum",
        "negativemomentum",
        "convergence",
      ]) {
        expect(blob).not.toContain(banned);
      }
    }
  });

  it("carries the reported_unconfirmed event status through verbatim", () => {
    const statuses = new Set(
      worklist.flatMap((r) => (r.recentSignal ? [r.recentSignal.eventStatus] : [])),
    );
    expect(statuses.has("reported_unconfirmed")).toBe(true);
  });
});

describe("company detail contract", () => {
  const detail = getCompanyScreeningDetail(worklist[0]!.identity.companyId)!;

  it("renders seven screening dimensions and fourteen criteria", () => {
    expect(detail.dimensions).toHaveLength(7);
    expect(detail.criteria).toHaveLength(14);
  });

  it("distinguishes the human anchor from the deterministic adjusted score per criterion", () => {
    for (const c of detail.criteria) {
      expect(c).toHaveProperty("rawAnchor");
      expect(c).toHaveProperty("adjustedScore");
      expect(c).toHaveProperty("neutralFill");
    }
  });

  it("exposes claim provenance and de-duplicated cited sources for tracing", () => {
    expect(detail.citedClaims.length).toBeGreaterThan(0);
    expect(detail.citedSources.length).toBeGreaterThan(0);
    for (const cl of detail.citedClaims) expect(cl).toHaveProperty("provenance");
  });

  it("populates canonical People without inventing biography fields", () => {
    for (const p of detail.people) {
      expect(Object.keys(p).sort()).toEqual(
        ["companyRoles", "currentRole", "isFounder", "name", "personId", "priorCompanies"].sort(),
      );
    }
  });

  it("keeps mandate honest and the eligibility note attached", () => {
    expect(detail.mandateStatus).toBe("NOT_ASSESSED");
    expect(detail.screeningEvidenceEligibility).toBeNull();
    expect(detail.mandateNote.length).toBeGreaterThan(0);
  });
});

describe("directory + presentation helpers", () => {
  it("returns 39 companies sorted by name for navigation and search", () => {
    const dir = getCompanyDirectory();
    expect(dir).toHaveLength(39);
    const names = dir.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("rounds Fit to a whole number and never bands it", () => {
    expect(fitDisplay(62.47)).toBe("62");
    expect(fitDisplay(49.51)).toBe("50");
  });

  it("formats coverage/confidence as whole percents and gauge segments 0..4", () => {
    expect(pct(0.714)).toBe("71%");
    expect(gaugeSegments(0)).toBe(0);
    expect(gaugeSegments(1)).toBe(4);
    expect(gaugeSegments(0.7)).toBe(3);
  });

  it("labels the GTM dimension in caps", () => {
    expect(dimensionLabel("gtm_quality")).toBe("GTM quality");
  });
});
