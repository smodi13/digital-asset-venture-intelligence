import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Phase 5B Real Corpus Firewall.
 *
 * The scoring engine must not have been applied to any real company: no real
 * Thesis Fit, Momentum, Convergence, ranking, or Priority artifact may exist
 * in the generated corpus or the research substrate, and no scoring module may
 * import that substrate.
 */

const ROOT = process.cwd();
const GENERATED = join(ROOT, "data", "generated");
const SCORING_DIR = join(ROOT, "lib", "scoring");

describe("real corpus firewall", () => {
  it("snapshots.json holds no records", () => {
    const snap = JSON.parse(readFileSync(join(GENERATED, "snapshots.json"), "utf8"));
    expect(snap.recordCount).toBe(0);
    expect(snap.records).toEqual([]);
  });

  it("no generated corpus file carries a scoring artifact", () => {
    const banned = [
      "thesisFit",
      "rankEligible",
      "rankEligibility",
      "momentumScore",
      "convergenceScore",
      "priorityState",
      "priorityScore",
    ];
    for (const file of readdirSync(GENERATED)) {
      if (file === "snapshots.json") continue;
      const text = readFileSync(join(GENERATED, file), "utf8");
      for (const token of banned) {
        expect(text.includes(`"${token}"`), `${file} contains ${token}`).toBe(false);
      }
    }
  });

  it("no scoring module imports the research corpus or generated data", () => {
    for (const file of readdirSync(SCORING_DIR)) {
      // Phase 2B added lib/scoring/digital-asset/, a parallel dormant
      // subdirectory covered by its own firewall test. Skip directories here.
      if (statSync(join(SCORING_DIR, file)).isDirectory()) continue;
      const text = readFileSync(join(SCORING_DIR, file), "utf8");
      expect(/from ["'].*data\/generated/.test(text), `${file}`).toBe(false);
      expect(/from ["'].*\/research\//.test(text), `${file}`).toBe(false);
      expect(/research\/input/.test(text), `${file}`).toBe(false);
    }
  });
});
