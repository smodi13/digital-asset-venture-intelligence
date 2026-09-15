import { describe, it, expect } from "vitest";
import { getCompanyScreeningDetail } from "@/lib/screening-read";
import { buildEvidenceCsv, EVIDENCE_CSV_HEADER, slugify } from "@/lib/export/evidence-csv";

const WELL_COVERED = "co-linear-app";
const detail = getCompanyScreeningDetail(WELL_COVERED)!;
const csv = buildEvidenceCsv(detail);
const lines = csv.trimEnd().split("\r\n");
const header = lines[0];
const dataRows = lines.slice(1);

function parseRow(line: string): string[] {
  // fields are always double-quoted; embedded quotes doubled; no bare commas outside quotes
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    }
  }
  out.push(cur);
  return out;
}

describe("evidence CSV", () => {
  it("has the exact documented header", () => {
    expect(header).toBe(EVIDENCE_CSV_HEADER.map((h) => `"${h}"`).join(","));
    expect(EVIDENCE_CSV_HEADER).toHaveLength(20);
  });

  it("produces one row per claim x criterion relationship", () => {
    const expected = detail.criteria.reduce(
      (n, c) => n + c.supportingClaims.length + c.reviewedButExcludedClaims.length,
      0,
    );
    expect(dataRows).toHaveLength(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it("maps each row's claim to its source fields", () => {
    const col = (name: string) => EVIDENCE_CSV_HEADER.indexOf(name as never);
    const sourceById = new Map(detail.citedSources.map((s) => [s.sourceId, s]));
    for (const line of dataRows) {
      const cells = parseRow(line);
      expect(cells[col("company_id")]).toBe(WELL_COVERED);
      expect(cells[col("company_name")]).toBe(detail.identity.name);
      expect(["included", "excluded"]).toContain(cells[col("included_or_excluded")]);
      const sid = cells[col("source_id")];
      if (sid) {
        const s = sourceById.get(sid);
        if (s) {
          expect(cells[col("source_publisher")]).toBe(s.publisher ?? "");
          expect(cells[col("source_type")]).toBe(s.sourceType ?? "");
        }
      }
    }
  });

  it("represents both included and excluded evidence when present", () => {
    const hasExcluded = detail.criteria.some((c) => c.reviewedButExcludedClaims.length > 0);
    const idx = EVIDENCE_CSV_HEADER.indexOf("included_or_excluded");
    const inclusions = new Set(dataRows.map((l) => parseRow(l)[idx]));
    expect(inclusions.has("included")).toBe(true);
    if (hasExcluded) expect(inclusions.has("excluded")).toBe(true);
  });

  it("never contains a raw article body marker, local path, or the literal 'null'", () => {
    expect(csv).not.toMatch(/\/Users\/|\/home\/|file:\/\/|C:\\\\/);
    expect(csv).not.toMatch(/"null"/);
    expect(csv).not.toMatch(/articleBody|rawBody|<html|<\/p>/i);
  });

  it("keeps only http(s) source URLs", () => {
    const idx = EVIDENCE_CSV_HEADER.indexOf("source_url");
    for (const line of dataRows) {
      const u = parseRow(line)[idx];
      if (u) expect(u).toMatch(/^https?:\/\//);
    }
  });

  it("is deterministic for a fixed company", () => {
    expect(buildEvidenceCsv(getCompanyScreeningDetail(WELL_COVERED)!)).toBe(csv);
  });

  it("slugify sanitises filename components", () => {
    expect(slugify("Applied Compute")).toBe("applied-compute");
    expect(slugify("Arcade.dev")).toBe("arcade-dev");
    expect(slugify("  ../etc/passwd  ")).toBe("etc-passwd");
    expect(slugify("!!!")).toBe("company");
  });
});
