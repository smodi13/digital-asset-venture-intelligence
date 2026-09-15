import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Phase 6D-B diagnostic firewall.
 *
 * The production Screening read path and the app must not import the Phase 6C
 * diagnostic runner or consume its JSON output. The diagnostic artifacts remain
 * useful as a methodology / regression oracle in tests ONLY.
 */

const ROOT = process.cwd();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const PRODUCTION_DIRS = [join(ROOT, "lib", "screening-read"), join(ROOT, "app")];

describe("phase 6d-b diagnostic firewall", () => {
  it("no production read-path or app module imports the Phase 6C diagnostic runner", () => {
    for (const dir of PRODUCTION_DIRS) {
      for (const file of walk(dir)) {
        const text = readFileSync(file, "utf8");
        expect(/phase6c-diagnostics/.test(text), `${file} references phase6c-diagnostics`).toBe(false);
        expect(/scripts\/diagnostics/.test(text), `${file} references scripts/diagnostics`).toBe(false);
      }
    }
  });

  it("no production read-path or app module consumes the diagnostic JSON", () => {
    for (const dir of PRODUCTION_DIRS) {
      for (const file of walk(dir)) {
        const text = readFileSync(file, "utf8");
        expect(
          /phase6c-descriptive-diagnostics\.data\.json/.test(text),
          `${file} references the diagnostic data JSON`,
        ).toBe(false);
      }
    }
  });

  it("the production read path does not import the Phase 5C audit artifacts", () => {
    for (const file of walk(join(ROOT, "lib", "screening-read"))) {
      const text = readFileSync(file, "utf8");
      expect(/phase5c/i.test(text), `${file} references a Phase 5C artifact`).toBe(false);
      expect(/originationiq_phase5c/.test(text), `${file}`).toBe(false);
    }
  });

  it("the tracked analytical input carries no cohort / split / audit labels", () => {
    const raw = readFileSync(join(ROOT, "data", "analytical-inputs", "screening-assessments.json"), "utf8");
    for (const token of ["calibration", "validation", "final_test", "final-test", "finalTest", "cohort", "holdout"]) {
      expect(raw.includes(`"${token}"`), `assessment dataset contains ${token} as a key`).toBe(false);
    }
    const parsed = JSON.parse(raw);
    for (const co of Object.values<Record<string, unknown>>(parsed.companies)) {
      expect(Object.keys(co).sort()).toEqual(["companyId", "criteria", "domain", "name"]);
    }
  });

  it("the tracked analytical input carries no scoring artifact", () => {
    const raw = readFileSync(join(ROOT, "data", "analytical-inputs", "screening-assessments.json"), "utf8");
    for (const token of ["thesisFit", "screeningThesisFit", "momentumScore", "convergenceScore", "priorityScore", "priorityState", "rankEligible"]) {
      expect(raw.includes(`"${token}"`), `assessment dataset contains ${token}`).toBe(false);
    }
  });
});
