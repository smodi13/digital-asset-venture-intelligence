/**
 * Validate v7 research packets (Phase 3B-0, PARALLEL / DORMANT).
 *
 * Run with:
 *   npm run research:v7:validate -- <packet-file-or-dir> [--universe <contract-dir>]
 *
 * Reads one packet file or every *.yaml file in a directory, validates each,
 * runs cross-packet integrity checks, and prints every issue. Exits non-zero
 * if any ERROR is found. Writes nothing.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import yaml from "js-yaml";
import { compileBatch, type CompileInput } from "@/lib/research-v7/compile";
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
  for (const i of [...issues].sort((a, b) => a.severity.localeCompare(b.severity))) {
    const loc = [i.packetId, i.path].filter(Boolean).join(" ");
    console.log(`[${i.severity}] ${i.code}: ${i.message}${loc ? ` (${loc})` : ""}`);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--"));
  const universeIdx = args.indexOf("--universe");
  const universeDir = universeIdx >= 0 ? args[universeIdx + 1] : undefined;

  if (!target) {
    console.error("Usage: research:v7:validate <packet-file-or-dir> [--universe <contract-dir>]");
    process.exit(2);
  }

  const files = collectPacketFiles(target);
  const inputs: CompileInput[] = files.map((f) => ({
    label: f,
    raw: yaml.load(readFileSync(f, "utf8")),
  }));

  const contract = universeDir ? loadUniverseContract(universeDir) : undefined;
  const result = compileBatch(inputs, { batch: "SYNTHETIC", contract });

  printIssues(result.issues);
  const errorCount = result.issues.filter((i) => i.severity === "ERROR").length;
  const warningCount = result.issues.filter((i) => i.severity === "WARNING").length;
  console.log(`\n${files.length} packet(s), ${errorCount} error(s), ${warningCount} warning(s).`);
  process.exit(result.ok ? 0 : 1);
}

main();
