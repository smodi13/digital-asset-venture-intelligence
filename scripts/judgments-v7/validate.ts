/**
 * Validate v7 judgment packets (Phase 3C-0, PARALLEL / DORMANT).
 *
 * Run with:
 *   npm run judgments:v7:validate -- <judgment-packet-file-or-dir> [--research <research-packet-dir>]
 *
 * Validates each judgment packet's own shape and the exactly-14-criteria /
 * forbidden-field firewall, then binds every packet against the frozen
 * research packets it claims to have been judged from (default:
 * research/v7/input/). Writes nothing.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import yaml from "js-yaml";
import { validatePacket as validateResearchPacket } from "@/lib/research-v7/validate";
import type { Packet as ResearchPacket } from "@/lib/research-v7/packet-schema";
import { compileJudgmentBatch, type JudgmentCompileInput } from "@/lib/judgments-v7/compile";
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
  for (const i of [...issues].sort((a, b) => a.severity.localeCompare(b.severity))) {
    const loc = [i.packetId, i.path].filter(Boolean).join(" ");
    console.log(`[${i.severity}] ${i.code}: ${i.message}${loc ? ` (${loc})` : ""}`);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--"));
  const researchIdx = args.indexOf("--research");
  const researchDir = (researchIdx >= 0 ? args[researchIdx + 1] : undefined) ?? join(process.cwd(), "research", "v7", "input");

  if (!target) {
    console.error("Usage: judgments:v7:validate <judgment-packet-file-or-dir> [--research <research-packet-dir>]");
    process.exit(2);
  }

  const files = collectYamlFiles(target);
  const inputs: JudgmentCompileInput[] = files.map((f) => ({
    label: f,
    raw: yaml.load(readFileSync(f, "utf8")),
  }));

  const researchByEntityId = loadResearchByEntityId(researchDir);
  const result = compileJudgmentBatch(inputs, { batch: "SYNTHETIC", researchByEntityId });

  printIssues(result.issues);
  const errorCount = result.issues.filter((i) => i.severity === "ERROR").length;
  const warningCount = result.issues.filter((i) => i.severity === "WARNING").length;
  console.log(`\n${files.length} judgment packet(s), ${errorCount} error(s), ${warningCount} warning(s).`);
  process.exit(result.ok ? 0 : 1);
}

main();
