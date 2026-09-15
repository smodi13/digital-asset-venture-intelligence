/**
 * Research-integrity audit for a v7 packet batch (Phase 3B-0, PARALLEL / DORMANT).
 *
 * Run with:
 *   npm run research:v7:audit -- <packet-dir> [--universe <contract-dir>] [--out <report.json>]
 *
 * Prints counts, source-class distribution, independence, origin chains,
 * unresolved references, duplicate warnings, cutoff violations,
 * reported_unconfirmed signals, metric coverage, and entityType/assetType/
 * category/cohort distributions. Never reports investment scores, ranks, or
 * recommendations: none exist at this stage.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import yaml from "js-yaml";
import { validatePacket } from "@/lib/research-v7/validate";
import { compileBatch, type CompileInput } from "@/lib/research-v7/compile";
import { buildAuditReport } from "@/lib/research-v7/audit";
import { loadUniverseContract } from "@/lib/research-v7/universe-contract";

function collectPacketFiles(target: string): string[] {
  const stat = statSync(target);
  if (stat.isFile()) return [target];
  return readdirSync(target)
    .filter((f) => extname(f) === ".yaml" || extname(f) === ".yml")
    .map((f) => join(target, f))
    .sort();
}

function main(): void {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--"));
  const universeIdx = args.indexOf("--universe");
  const universeDir = universeIdx >= 0 ? args[universeIdx + 1] : undefined;
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined;

  if (!target) {
    console.error("Usage: research:v7:audit <packet-dir> [--universe <contract-dir>] [--out <report.json>]");
    process.exit(2);
  }

  const files = collectPacketFiles(target);
  const inputs: CompileInput[] = files.map((f) => ({ label: f, raw: yaml.load(readFileSync(f, "utf8")) }));
  const contract = universeDir ? loadUniverseContract(universeDir) : undefined;

  const packets = inputs.map((i) => validatePacket(i.raw, i.label)).filter((r) => r.ok && r.packet).map((r) => r.packet!);
  const compiled = compileBatch(inputs, { batch: "SYNTHETIC", contract });

  const report = buildAuditReport(packets, compiled.corpus, contract ?? null);
  const text = JSON.stringify(report, null, 2) + "\n";

  console.log(text);
  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, text, "utf8");
    console.log(`Written to ${outPath}`);
  }
}

main();
