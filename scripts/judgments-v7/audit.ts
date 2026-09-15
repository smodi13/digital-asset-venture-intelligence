/**
 * Judgment-integrity audit for a v7 judgment packet batch (Phase 3C-0,
 * PARALLEL / DORMANT).
 *
 * Run with:
 *   npm run judgments:v7:audit -- <judgment-packet-dir> [--research <research-packet-dir>] [--out <report.json>]
 *
 * Prints packet/entity/criterion completion, applicability distribution,
 * anchors by criterion, missing evidence links, contradictions, and every
 * provenance/binding issue. Never reports company rankings, aggregate Thesis
 * Fit, or recommendations: those require aggregate scoring, which is a
 * separate, later stage (docs/digital-asset-v7-judgment-protocol.md).
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import yaml from "js-yaml";
import { validatePacket as validateResearchPacket } from "@/lib/research-v7/validate";
import type { Packet as ResearchPacket } from "@/lib/research-v7/packet-schema";
import { validateJudgmentPacket } from "@/lib/judgments-v7/validate";
import { compileJudgmentBatch, type JudgmentCompileInput } from "@/lib/judgments-v7/compile";
import { buildJudgmentAuditReport } from "@/lib/judgments-v7/audit";

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

function main(): void {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--"));
  const researchIdx = args.indexOf("--research");
  const researchDir = (researchIdx >= 0 ? args[researchIdx + 1] : undefined) ?? join(process.cwd(), "research", "v7", "input");
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined;

  if (!target) {
    console.error("Usage: judgments:v7:audit <judgment-packet-dir> [--research <research-packet-dir>] [--out <report.json>]");
    process.exit(2);
  }

  const files = collectYamlFiles(target);
  const inputs: JudgmentCompileInput[] = files.map((f) => ({ label: f, raw: yaml.load(readFileSync(f, "utf8")) }));
  const researchByEntityId = loadResearchByEntityId(researchDir);

  const packets = inputs.map((i) => validateJudgmentPacket(i.raw, i.label)).filter((r) => r.ok && r.packet).map((r) => r.packet!);
  const compiled = compileJudgmentBatch(inputs, { batch: "SYNTHETIC", researchByEntityId });

  const report = buildJudgmentAuditReport(packets, compiled.issues);
  const text = JSON.stringify(report, null, 2) + "\n";

  console.log(text);
  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, text, "utf8");
    console.log(`Written to ${outPath}`);
  }
}

main();
