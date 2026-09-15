/**
 * Compile a v7 judgment batch (Phase 3C-0, PARALLEL / DORMANT).
 *
 * Run with:
 *   npm run judgments:v7:build -- <judgment-packet-dir> --batch CALIBRATION|VALIDATION|FINAL_TEST|SYNTHETIC [--research <research-packet-dir>] [--out <dir>]
 *
 * Validates every judgment packet, binds each against its frozen research
 * packet, and ONLY IF the whole batch is error-free writes the compiled
 * data/v7-analytical-inputs/ collection and its manifest. One bad packet
 * fails loudly with no output written at all.
 *
 * Never writes to data/analytical-inputs/ (the active v6 inputs) or
 * data/v7-generated/ (the dormant v7 research corpus), and never modifies
 * anything under research/v7/input/.
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import yaml from "js-yaml";
import { validatePacket as validateResearchPacket } from "@/lib/research-v7/validate";
import type { Packet as ResearchPacket } from "@/lib/research-v7/packet-schema";
import { compileJudgmentBatch, type JudgmentCompileInput, type JudgmentCompileOptions } from "@/lib/judgments-v7/compile";
import type { Issue } from "@/lib/judgments-v7/validate";

function collectYamlFiles(target: string): string[] {
  const stat = statSync(target);
  if (stat.isFile()) return [target];
  return readdirSync(target)
    .filter((f) => extname(f) === ".yaml" || extname(f) === ".yml")
    .map((f) => join(target, f))
    .sort();
}

function loadResearchByEntityId(dir: string): Map<string, ResearchPacket> {
  const byEntityId = new Map<string, ResearchPacket>();
  for (const f of collectYamlFiles(dir)) {
    const raw = yaml.load(readFileSync(f, "utf8"));
    const result = validateResearchPacket(raw, f);
    if (result.ok && result.packet) byEntityId.set(result.packet.canonicalId, result.packet);
  }
  return byEntityId;
}

function printIssues(issues: readonly Issue[]): void {
  for (const i of issues) {
    const loc = [i.packetId, i.path].filter(Boolean).join(" ");
    console.log(`[${i.severity}] ${i.code}: ${i.message}${loc ? ` (${loc})` : ""}`);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--"));
  const batchIdx = args.indexOf("--batch");
  const batch = (batchIdx >= 0 ? args[batchIdx + 1] : "SYNTHETIC") as JudgmentCompileOptions["batch"];
  const researchIdx = args.indexOf("--research");
  const researchDir = (researchIdx >= 0 ? args[researchIdx + 1] : undefined) ?? join(process.cwd(), "research", "v7", "input");
  const outIdx = args.indexOf("--out");
  const outRoot = (outIdx >= 0 ? args[outIdx + 1] : undefined) ?? process.cwd();

  if (!target) {
    console.error("Usage: judgments:v7:build <judgment-packet-dir> --batch <BATCH> [--research <research-packet-dir>] [--out <dir>]");
    process.exit(2);
  }
  if (!["CALIBRATION", "VALIDATION", "FINAL_TEST", "SYNTHETIC"].includes(batch)) {
    console.error(`Invalid --batch "${batch}".`);
    process.exit(2);
  }

  const files = collectYamlFiles(target);
  const inputs: JudgmentCompileInput[] = files.map((f) => ({
    label: f,
    raw: yaml.load(readFileSync(f, "utf8")),
  }));

  const researchByEntityId = loadResearchByEntityId(researchDir);
  const runAt = process.env.JUDGMENTS_V7_RUN_AT;
  const now = runAt ? new Date(runAt) : undefined;
  const result = compileJudgmentBatch(inputs, { batch, researchByEntityId, now });

  printIssues(result.issues);

  if (!result.ok || !result.files) {
    console.log(`\nCompilation failed. No files written.`);
    process.exit(1);
  }

  for (const [relPath, text] of Object.entries(result.files)) {
    const absPath = join(outRoot, relPath);
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, text, "utf8");
  }

  console.log(`\nCompiled ${files.length} judgment packet(s) into ${Object.keys(result.files).length} file(s) under data/v7-analytical-inputs/.`);
  process.exit(0);
}

main();
