import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadUniverseContract } from "@/lib/research-v7/universe-contract";
import { compileBatch } from "@/lib/research-v7/compile";
import { buildAuditReport } from "@/lib/research-v7/audit";
import { validatePacket } from "@/lib/research-v7/validate";
import { baseCompanyPacket } from "./fixtures";

const CONTRACT_DIR = join(process.cwd(), "tests", "research-v7", "fixtures", "universe-contract");

/** Write a one-off contract directory so a test can exercise a specific malformed/edge-case CSV shape. */
function writeContractDir(finalUniverseCsv: string, cohortAssignmentCsv: string): string {
  const dir = mkdtempSync(join(tmpdir(), "universe-contract-test-"));
  writeFileSync(join(dir, "final-universe.csv"), finalUniverseCsv);
  writeFileSync(join(dir, "cohort-assignment.csv"), cohortAssignmentCsv);
  return dir;
}

describe("universe-contract validation (fixture only, never local-artifacts/)", () => {
  it("loads a fixture contract", () => {
    const contract = loadUniverseContract(CONTRACT_DIR);
    expect(contract.byCandidateId.get("cand-synthetic-001")?.canonicalName).toBe("Synthetic Widgets Inc");
    expect(contract.cohortByCandidateId.get("cand-synthetic-001")).toBe("CALIBRATION");
  });

  it("accepts a packet matching the contract exactly, cohort included", () => {
    const contract = loadUniverseContract(CONTRACT_DIR);
    const packet = baseCompanyPacket({ cohort: "CALIBRATION" });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "CALIBRATION", contract });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("rejects a candidateId absent from the universe", () => {
    const contract = loadUniverseContract(CONTRACT_DIR);
    const packet = baseCompanyPacket({ candidateId: "cand-does-not-exist" });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "CALIBRATION", contract });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "candidate_not_in_universe")).toBe(true);
  });

  it("rejects a name mismatch with no nameAliasNote", () => {
    const contract = loadUniverseContract(CONTRACT_DIR);
    const packet = baseCompanyPacket({ canonicalName: "Totally Different Name" });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "CALIBRATION", contract });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "name_mismatch")).toBe(true);
  });

  it("accepts a name mismatch when a reviewed nameAliasNote is present", () => {
    const contract = loadUniverseContract(CONTRACT_DIR);
    const packet = baseCompanyPacket({ canonicalName: "Totally Different Name", nameAliasNote: "Renamed after acquisition, per 2026-08 filing." });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "CALIBRATION", contract });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("rejects a category mismatch", () => {
    const contract = loadUniverseContract(CONTRACT_DIR);
    const packet = baseCompanyPacket({ category: "core_protocols_and_scaling" });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "CALIBRATION", contract });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "category_mismatch")).toBe(true);
  });

  it("rejects an entityType mismatch without a correction note, accepts it with one", () => {
    const contract = loadUniverseContract(CONTRACT_DIR);
    const bad = baseCompanyPacket({ entityType: "protocol" });
    const good = baseCompanyPacket({ entityType: "protocol", entityTypeCorrectionNote: "Reclassified after governance transition, see 2026-06 disclosure." });
    expect(compileBatch([{ label: "p", raw: bad }], { batch: "CALIBRATION", contract }).ok).toBe(false);
    expect(compileBatch([{ label: "p", raw: good }], { batch: "CALIBRATION", contract }).ok).toBe(true);
  });

  it("rejects an assetType mismatch without a correction note, accepts it with one", () => {
    const contract = loadUniverseContract(CONTRACT_DIR);
    const bad = baseCompanyPacket({ assetType: "token" });
    const good = baseCompanyPacket({ assetType: "token", assetTypeCorrectionNote: "Token launched post-observation window, see source." });
    expect(compileBatch([{ label: "p", raw: bad }], { batch: "CALIBRATION", contract }).ok).toBe(false);
    expect(compileBatch([{ label: "p", raw: good }], { batch: "CALIBRATION", contract }).ok).toBe(true);
  });

  it("rejects a cohort that does not match the frozen assignment, with no override possible", () => {
    const contract = loadUniverseContract(CONTRACT_DIR);
    const packet = baseCompanyPacket({ cohort: "VALIDATION" }); // frozen assignment is CALIBRATION
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "CALIBRATION", contract });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "cohort_mismatch")).toBe(true);
  });

  it("reports a cohort distribution when a contract is supplied", () => {
    const contract = loadUniverseContract(CONTRACT_DIR);
    const packet = validatePacket(baseCompanyPacket({ cohort: "CALIBRATION" }), "p").packet!;
    const report = buildAuditReport([packet], null, contract);
    expect(report.cohortDistribution).toEqual({ CALIBRATION: 1 });
  });

  describe("real Phase 3A contract shape (name, entity_type, asset_type; RFC4180 quoting)", () => {
    it("parses the fixture's real-shaped header (candidate_id,name,...,entity_type,asset_type,...) directly, no remap", () => {
      const contract = loadUniverseContract(CONTRACT_DIR);
      const entry = contract.byCandidateId.get("cand-synthetic-001");
      expect(entry).toEqual({
        candidateId: "cand-synthetic-001",
        canonicalName: "Synthetic Widgets Inc",
        category: "custody_compliance_and_institutional_infrastructure",
        entityType: "company",
        assetType: "equity",
      });
    });

    it("honors RFC4180-quoted fields containing commas (e.g. an 'HQ, Country' cell) without misaligning later columns", () => {
      const contract = loadUniverseContract(CONTRACT_DIR);
      // cand-synthetic-001's hq_or_primary_geography field is `"San Francisco, USA"`,
      // a quoted comma ahead of entity_type/asset_type in column order. A naive
      // comma-split parser would shift entityType/assetType by one column.
      const entry = contract.byCandidateId.get("cand-synthetic-001");
      expect(entry?.entityType).toBe("company");
      expect(entry?.assetType).toBe("equity");
    });

    it("throws a clear error when final-universe.csv is missing a required column, rather than silently accepting it", () => {
      const dir = writeContractDir(
        "candidate_id,name,category,asset_type\ncand-x,Missing Entity Type Co,core_protocols_and_scaling,equity\n",
        "candidate_id,cohort\ncand-x,CALIBRATION\n",
      );
      expect(() => loadUniverseContract(dir)).toThrow(/final-universe\.csv is missing required column\(s\): entity_type/);
    });

    it("throws a clear error when cohort-assignment.csv is missing a required column, rather than silently accepting it", () => {
      const dir = writeContractDir(
        "candidate_id,name,category,entity_type,asset_type\ncand-x,X,core_protocols_and_scaling,protocol,token\n",
        "candidate_id,assignment_reason\ncand-x,no cohort column here\n",
      );
      expect(() => loadUniverseContract(dir)).toThrow(/cohort-assignment\.csv is missing required column\(s\): cohort/);
    });
  });
});
