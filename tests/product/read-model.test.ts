import { describe, it, expect, beforeEach } from "vitest";
import {
  listCompanies,
  getCompanyBySlug,
  getCompanyDirectory,
  getSourcingWorklist,
  getPartnerHomeData,
  getReadModelMeta,
  __resetDigitalAssetProductCache,
} from "@/lib/digital-asset-product";

/**
 * Phase 4A product read-model tests: correctness of the deterministic v7
 * corpus and the read layer built on top of it. This does not touch the
 * frozen research/judgment inputs; it only reads the committed generated
 * corpus at data/v7-product/companies.v7.json.
 */
describe("digital-asset product read model", () => {
  beforeEach(() => __resetDigitalAssetProductCache());

  it("exposes all 44 companies (the full v7 corpus, cohort-agnostic)", () => {
    expect(listCompanies()).toHaveLength(44);
  });

  it("gives every company a unique slug", () => {
    const slugs = listCompanies().map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every company a unique entityId / candidateId", () => {
    const companies = listCompanies();
    expect(new Set(companies.map((c) => c.entityId)).size).toBe(companies.length);
    expect(new Set(companies.map((c) => c.candidateId)).size).toBe(companies.length);
  });

  it("resolves a company by slug", () => {
    const first = listCompanies()[0]!;
    const bySlug = getCompanyBySlug(first.slug);
    expect(bySlug?.entityId).toBe(first.entityId);
  });

  it("returns null for an unknown slug", () => {
    expect(getCompanyBySlug("not-a-real-company")).toBeNull();
  });

  it("never fabricates mandate or rank eligibility", () => {
    for (const c of listCompanies()) {
      expect(c.mandateStatus).toBe("NOT_ASSESSED");
      expect(c.rankEligibility).toBe("NOT_ASSESSED");
    }
  });

  it("carries exactly 7 dimensions and 14 criteria per company", () => {
    for (const c of listCompanies()) {
      expect(c.dimensions).toHaveLength(7);
      expect(c.criteria).toHaveLength(14);
    }
  });

  it("only emits the two defined display states", () => {
    for (const c of listCompanies()) {
      expect(["PROVISIONAL", "INSUFFICIENT_EVIDENCE"]).toContain(c.displayState);
    }
  });

  it("keeps cohort as metadata only - never CALIBRATION/VALIDATION/FINAL_TEST leaking into the worklist row shape", () => {
    const row = getSourcingWorklist()[0]!;
    expect(row).not.toHaveProperty("cohort");
  });

  it("orders the Sourcing Worklist alphabetically by default, not by Thesis Fit", () => {
    const rows = getSourcingWorklist();
    const names = rows.map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("company directory is cohort-free and alphabetical", () => {
    const dir = getCompanyDirectory();
    expect(dir[0]).not.toHaveProperty("cohort");
    const names = dir.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("Partner Home totals reconcile against the full corpus", () => {
    const home = getPartnerHomeData();
    expect(home.totalCompanies).toBe(44);
    expect(home.provisionalCount + home.insufficientEvidenceCount).toBe(44);
  });

  it("read model meta reports a research baseline commit and generation timestamp", () => {
    const meta = getReadModelMeta();
    expect(meta.researchBaselineCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(meta.companyCount).toBe(44);
  });
});
