/**
 * Aggregate v7 Screening scorer (Phase 3C-2 / 3C-2.1, PARALLEL / DORMANT).
 *
 * Run with:
 *   npm run judgments:v7:score -- [--input <entities.v7.json>] [--judgments <dir>] [--research <dir>] [--out <dir>]
 *
 * Score and coverage come only from the frozen, already-validated
 * data/v7-analytical-inputs/ output. Evidence confidence (Phase 3C-2.1) is a
 * separate analytical dimension computed deterministically from the frozen
 * judgment packets' citedEvidenceClaimIds / acknowledgedContradictionIds,
 * resolved against the frozen research corpus, via
 * lib/scoring/digital-asset/evidence-confidence.ts. Both judgments/v7/** and
 * research/v7/input/** are read only, never modified: this is a frozen,
 * audited, git-committed batch, not an in-progress judgment session.
 *
 * Writes a dormant result collection under data/v7-score-results/. Never
 * writes to data/generated/, data/analytical-inputs/, or any active v6 path.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import yaml from "js-yaml";
import { sha256Hex } from "@/lib/hash/canonical";
import { scoreScreeningEntity } from "@/lib/scoring/digital-asset/screening-aggregate";
import { computeCriterionConfidence } from "@/lib/scoring/digital-asset/evidence-confidence";
import { DA_CALIBRATION_CONFIG_FREEZE_FINGERPRINT } from "@/lib/judgments-v7/methodology-fingerprint";
import { validateJudgmentPacket, type Issue } from "@/lib/judgments-v7/validate";
import type { JudgmentPacket } from "@/lib/judgments-v7/packet-schema";
import { validatePacket as validateResearchPacket } from "@/lib/research-v7/validate";
import type { Packet as ResearchPacket } from "@/lib/research-v7/packet-schema";
import type { EvidenceClaim } from "@/lib/schemas/evidence-claim";
import type { CompiledEntityAnalyticalInput } from "@/lib/judgments-v7/compile";

function collectYamlFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => extname(f) === ".yaml" || extname(f) === ".yml")
    .map((f) => join(dir, f))
    .sort();
}

function loadResearchByCanonicalId(dir: string): Map<string, ResearchPacket> {
  const byId = new Map<string, ResearchPacket>();
  for (const f of collectYamlFiles(dir)) {
    const raw = yaml.load(readFileSync(f, "utf8"));
    const result = validateResearchPacket(raw, f);
    if (result.ok && result.packet) byId.set(result.packet.canonicalId, result.packet);
  }
  return byId;
}

function loadJudgmentsByEntityId(dir: string): Map<string, JudgmentPacket> {
  const byId = new Map<string, JudgmentPacket>();
  const issues: Issue[] = [];
  for (const f of collectYamlFiles(dir)) {
    const raw = yaml.load(readFileSync(f, "utf8"));
    const result = validateJudgmentPacket(raw, f);
    issues.push(...result.issues);
    if (result.ok && result.packet) byId.set(result.packet.entityId, result.packet);
  }
  if (issues.some((i) => i.severity === "ERROR")) {
    for (const i of issues) console.error(`[${i.severity}] ${i.code}: ${i.message}`);
    throw new Error("Refusing to score: one or more frozen judgment packets failed validation.");
  }
  return byId;
}

/** Attach deterministic confidence to each entity's criteria, from its frozen judgment packet + research packet. Score/coverage/applicability are untouched. */
function withConfidence(
  entity: CompiledEntityAnalyticalInput,
  judgments: ReadonlyMap<string, JudgmentPacket>,
  research: ReadonlyMap<string, ResearchPacket>,
): CompiledEntityAnalyticalInput {
  const judgment = judgments.get(entity.entityId);
  const packet = research.get(entity.entityId);
  if (!judgment || !packet) {
    throw new Error(`Refusing to score "${entity.entityId}": no frozen judgment or research packet found for confidence resolution.`);
  }
  const claimsById = new Map<string, EvidenceClaim>(packet.evidenceClaims.map((c) => [c.id, c]));
  const judgmentByCriterion = new Map(judgment.criterionJudgments.map((c) => [c.criterionId, c]));

  return {
    ...entity,
    criteria: entity.criteria.map((c) => {
      const cj = judgmentByCriterion.get(c.criterionId);
      const confidence = cj
        ? computeCriterionConfidence(cj.citedEvidenceClaimIds, cj.acknowledgedContradictionIds.length > 0, claimsById, packet.sources)
        : 0;
      return { ...c, confidence };
    }),
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const flag = (name: string, fallback: string) => {
    const idx = args.indexOf(name);
    return idx >= 0 ? args[idx + 1]! : fallback;
  };
  const inputPath = flag("--input", join(process.cwd(), "data", "v7-analytical-inputs", "entities.v7.json"));
  const judgmentsDir = flag("--judgments", join(process.cwd(), "judgments", "v7", "calibration"));
  const researchDir = flag("--research", join(process.cwd(), "research", "v7", "input"));
  const outRoot = flag("--out", process.cwd());
  const runAt = process.env.JUDGMENTS_V7_SCORE_RUN_AT;
  const generatedAt = (runAt ? new Date(runAt) : new Date()).toISOString();

  const raw = readFileSync(inputPath, "utf8");
  const entities: CompiledEntityAnalyticalInput[] = JSON.parse(raw);
  if (entities.length === 0) {
    console.error(`No entities found in ${inputPath}.`);
    process.exit(2);
  }

  const researchBaselineCommits = new Set(entities.map((e) => e.researchBaselineCommit));
  const methodologyFingerprints = new Set(entities.map((e) => e.methodologyConfigFingerprint));
  if (researchBaselineCommits.size !== 1) {
    console.error(`Refusing to score: ${researchBaselineCommits.size} distinct researchBaselineCommit values found (expected exactly 1).`);
    process.exit(1);
  }
  if (methodologyFingerprints.size !== 1) {
    console.error(`Refusing to score: ${methodologyFingerprints.size} distinct methodologyConfigFingerprint values found (expected exactly 1).`);
    process.exit(1);
  }

  if (statSync(judgmentsDir, { throwIfNoEntry: false }) === undefined) {
    console.error(`Judgment directory not found: ${judgmentsDir}`);
    process.exit(2);
  }
  const research = loadResearchByCanonicalId(researchDir);
  const judgments = loadJudgmentsByEntityId(judgmentsDir);

  const scores = [...entities]
    .sort((a, b) => a.entityId.localeCompare(b.entityId))
    .map((e) => scoreScreeningEntity(withConfidence(e, judgments, research)));

  const cohorts = new Set(entities.map((e) => e.cohort));
  const resultDoc = {
    schemaVersion: 7,
    generatedAt,
    batch: cohorts.size === 1 ? [...cohorts][0] : null,
    entityCount: scores.length,
    researchBaselineCommit: [...researchBaselineCommits][0],
    judgmentAnalyticalInputSha256: `sha256:${sha256Hex(raw)}`,
    methodologyConfigFingerprint: [...methodologyFingerprints][0],
    calibrationConfigFreezeFingerprint: DA_CALIBRATION_CONFIG_FREEZE_FINGERPRINT,
    scores,
  };

  const outPath = join(outRoot, "data", "v7-score-results", "screening-scores.v7.json");
  const text = JSON.stringify(resultDoc, null, 2) + "\n";
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, text, "utf8");

  const manifest = {
    schemaVersion: 7,
    generatedAt,
    batch: resultDoc.batch,
    entries: [
      {
        path: "data/v7-score-results/screening-scores.v7.json",
        schemaVersion: 7,
        generatedAt,
        generator: "scripts/judgments-v7/score.ts",
        recordCount: scores.length,
        sha256: sha256Hex(text),
      },
    ],
  };
  const manifestPath = join(outRoot, "data", "v7-score-results", "MANIFEST.v7.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(`Scored ${scores.length} entit${scores.length === 1 ? "y" : "ies"} into ${outPath}.`);
  process.exit(0);
}

main();
