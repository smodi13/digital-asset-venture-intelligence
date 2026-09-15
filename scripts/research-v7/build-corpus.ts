/**
 * Compile a v7 research batch (Phase 3B-0, PARALLEL / DORMANT).
 *
 * Run with:
 *   npm run research:v7:build -- <packet-dir> --batch CALIBRATION|VALIDATION|FINAL_TEST|SYNTHETIC [--universe <contract-dir>] [--out <dir>]
 *
 * Validates every packet, runs cross-packet integrity, and ONLY IF the whole
 * batch is error-free writes the compiled data/v7-generated collections and
 * the separate v7 manifest. One bad packet fails loudly with no output
 * written at all: never a partially valid corpus.
 *
 * Never writes to data/generated/ (the active v6 corpus) or touches
 * data/generated/MANIFEST.json.
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import yaml from "js-yaml";
import { compileBatch, type CompileInput, type CompileOptions } from "@/lib/research-v7/compile";
import { loadUniverseContract } from "@/lib/research-v7/universe-contract";
import type { Issue } from "@/lib/research-v7/validate";

function collectPacketFiles(target: string): string[] {
  const stat = statSync(target);
  if (stat.isFile()) return [target];
  return readdirSync(target)
    .filter((f) => extname(f) === ".yaml" || extname(f) === ".yml")
    .map((f) => join(target, f))
    .sort();
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
  const batch = (batchIdx >= 0 ? args[batchIdx + 1] : "SYNTHETIC") as CompileOptions["batch"];
  const universeIdx = args.indexOf("--universe");
  const universeDir = universeIdx >= 0 ? args[universeIdx + 1] : undefined;
  const outIdx = args.indexOf("--out");
  const outRoot = (outIdx >= 0 ? args[outIdx + 1] : undefined) ?? process.cwd();

  if (!target) {
    console.error("Usage: research:v7:build <packet-dir> --batch <BATCH> [--universe <contract-dir>] [--out <dir>]");
    process.exit(2);
  }
  if (!["CALIBRATION", "VALIDATION", "FINAL_TEST", "SYNTHETIC"].includes(batch)) {
    console.error(`Invalid --batch "${batch}".`);
    process.exit(2);
  }

  const files = collectPacketFiles(target);
  const inputs: CompileInput[] = files.map((f) => ({
    label: f,
    raw: yaml.load(readFileSync(f, "utf8")),
  }));

  const contract = universeDir ? loadUniverseContract(universeDir) : undefined;
  const runAt = process.env.RESEARCH_V7_RUN_AT;
  const now = runAt ? new Date(runAt) : undefined;
  const result = compileBatch(inputs, { batch, contract, now });

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

  console.log(`\nCompiled ${files.length} packet(s) into ${Object.keys(result.files).length} file(s) under data/v7-generated/.`);
  process.exit(0);
}

main();
