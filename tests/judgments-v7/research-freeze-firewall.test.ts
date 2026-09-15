import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { compileJudgmentBatch } from "@/lib/judgments-v7/compile";
import { baseResearchPacket, baseJudgmentPacket } from "./fixtures";

/**
 * Research-freeze firewall (Phase 3C-0, section 25).
 *
 * Judgment compilation must never mutate research. Research is input to
 * judgment, never output from it: no EvidenceClaim, SourceRecord, or
 * SignalEvent may be created, and the real frozen research/v7/input/**
 * packets on disk must be untouched by any judgment-harness run.
 */
describe("research-freeze firewall", () => {
  it("compileJudgmentBatch's output contains no evidenceClaims/sources/signalEvents keys", () => {
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research);
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    const result = compileJudgmentBatch([{ label: "freeze-fixture", raw }], { batch: "SYNTHETIC", researchByEntityId });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    for (const text of Object.values(result.files!)) {
      expect(text).not.toMatch(/"evidenceClaims"/);
      expect(text).not.toMatch(/"sources"/);
      expect(text).not.toMatch(/"signalEvents"/);
    }
  });

  it("real research/v7/input/** packets are unchanged after running the judgment harness against synthetic fixtures", () => {
    const dir = join(process.cwd(), "research", "v7", "input");
    const before: Record<string, string> = {};
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      if (statSync(full).isFile() && f.endsWith(".yaml")) before[f] = readFileSync(full, "utf8");
    }

    // Run the full synthetic harness path.
    const research = baseResearchPacket();
    const raw = baseJudgmentPacket(research);
    const researchByEntityId = new Map([[research.canonicalId, research]]);
    compileJudgmentBatch([{ label: "freeze-fixture", raw }], { batch: "SYNTHETIC", researchByEntityId });

    const after = readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile() && f.endsWith(".yaml"));

    // The exact packet set must be unchanged: nothing added, nothing removed.
    expect(after.sort()).toEqual(Object.keys(before).sort());
    for (const [f, text] of Object.entries(before)) {
      expect(readFileSync(join(dir, f), "utf8")).toBe(text);
    }
    // Sanity check that the loop above actually exercised real packets, without
    // hardcoding a total that legitimately grows as holdout research proceeds.
    expect(Object.keys(before).length).toBeGreaterThan(0);
  });
});
