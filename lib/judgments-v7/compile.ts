import type { JudgmentPacket } from "./packet-schema";
import type { Packet as ResearchPacket } from "@/lib/research-v7/packet-schema";
import type { CriterionScoreInput } from "@/lib/scoring/digital-asset/applicability";
import { validateJudgmentPacket, issue, type Issue } from "./validate";
import {
  checkResearchAndMethodologyBinding,
  checkContradictionAcknowledgment,
  checkEvidenceCoverageBinding,
  checkJudgmentBatchDedupe,
} from "./integrity";
import { buildJudgmentManifestEntry, type JudgmentManifestV7, type JudgmentManifestV7Entry } from "./manifest";

/**
 * Deterministic validate-all-then-compile pipeline for judgments (Phase
 * 3C-0, PARALLEL / DORMANT).
 *
 * Mirrors lib/research-v7/compile.ts: one bad packet fails loudly and
 * produces zero files, never a partial analytical-input corpus. Output is
 * separate from both research/v7/input/** (research) and
 * data/analytical-inputs/** (active v6): it lands under
 * data/v7-analytical-inputs/**, and contains only the CriterionScoreInput
 * shape lib/scoring/digital-asset/applicability.ts already defines as its
 * scoring contract -- no fabricated fields, no rationale text, no evidence
 * ids (those stay in the human judgment packet, which is the audit trail;
 * the analytical input is only what a future dormant scorer consumes).
 */

export interface CompiledEntityAnalyticalInput {
  entityId: string;
  candidateId: string;
  cohort: JudgmentPacket["cohort"];
  mandateStatus: JudgmentPacket["mandateStatus"];
  researchBaselineCommit: string;
  researchPacketSha256: string;
  methodologyConfigFingerprint: string;
  criteria: CriterionScoreInput[];
}

export interface CompiledJudgmentCorpus {
  entities: CompiledEntityAnalyticalInput[];
}

export interface JudgmentCompileInput {
  label: string;
  raw: unknown;
}

export interface JudgmentCompileOptions {
  batch: "CALIBRATION" | "VALIDATION" | "FINAL_TEST" | "SYNTHETIC";
  /** The frozen research packets to bind against, keyed by canonicalId (== judgment entityId). */
  researchByEntityId: Map<string, ResearchPacket>;
  now?: Date;
}

export interface JudgmentCompileResult {
  ok: boolean;
  issues: Issue[];
  corpus: CompiledJudgmentCorpus | null;
  manifest: JudgmentManifestV7 | null;
  files: Record<string, string> | null;
}

function toCriterionScoreInputs(judgment: JudgmentPacket): CriterionScoreInput[] {
  return [...judgment.criterionJudgments]
    .sort((a, b) => a.criterionId.localeCompare(b.criterionId))
    .map((c) => ({
      criterionId: c.criterionId,
      applicability: c.applicability,
      rawAnchor: c.rawAnchor,
      coverage: c.coverage ?? 0,
    }));
}

/** Validate a batch of raw judgment packets, run cross-record integrity, and compile a deterministic analytical-input corpus. Writes nothing itself. */
export function compileJudgmentBatch(inputs: readonly JudgmentCompileInput[], options: JudgmentCompileOptions): JudgmentCompileResult {
  const issues: Issue[] = [];
  const packets: JudgmentPacket[] = [];

  for (const input of inputs) {
    const result = validateJudgmentPacket(input.raw, input.label);
    issues.push(...result.issues);
    if (result.ok && result.packet) packets.push(result.packet);
  }

  if (issues.some((i) => i.severity === "ERROR")) {
    return { ok: false, issues, corpus: null, manifest: null, files: null };
  }

  issues.push(...checkJudgmentBatchDedupe(packets));
  for (const p of packets) {
    if (p.cohort !== options.batch && options.batch !== "SYNTHETIC") {
      issues.push(
        issue("ERROR", "wrong_cohort", `Judgment for "${p.entityId}" declares cohort "${p.cohort}", but this build targets batch "${options.batch}".`, {
          packetId: p.entityId,
          path: "cohort",
        }),
      );
    }
    issues.push(...checkResearchAndMethodologyBinding(p, options.researchByEntityId));
    issues.push(...checkContradictionAcknowledgment(p, options.researchByEntityId));
    issues.push(...checkEvidenceCoverageBinding(p));
  }

  if (issues.some((i) => i.severity === "ERROR")) {
    return { ok: false, issues, corpus: null, manifest: null, files: null };
  }

  const now = (options.now ?? new Date()).toISOString();

  const corpus: CompiledJudgmentCorpus = {
    entities: [...packets]
      .sort((a, b) => a.entityId.localeCompare(b.entityId))
      .map((p) => ({
        entityId: p.entityId,
        candidateId: p.candidateId,
        cohort: p.cohort,
        mandateStatus: p.mandateStatus,
        researchBaselineCommit: p.researchBaselineCommit,
        researchPacketSha256: p.researchPacketSha256,
        methodologyConfigFingerprint: p.methodologyConfigFingerprint,
        criteria: toCriterionScoreInputs(p),
      })),
  };

  const files: Record<string, string> = {
    "data/v7-analytical-inputs/entities.v7.json": JSON.stringify(corpus.entities, null, 2) + "\n",
  };

  const generator = "scripts/judgments-v7/build.ts";
  const entries: JudgmentManifestV7Entry[] = [
    buildJudgmentManifestEntry({
      path: "data/v7-analytical-inputs/entities.v7.json",
      text: files["data/v7-analytical-inputs/entities.v7.json"]!,
      generatedAt: now,
      generator,
      recordCount: corpus.entities.length,
    }),
  ];

  const manifest: JudgmentManifestV7 = { schemaVersion: 7, generatedAt: now, batch: options.batch, entries };
  files["data/v7-analytical-inputs/MANIFEST.v7.json"] = JSON.stringify(manifest, null, 2) + "\n";

  return { ok: true, issues, corpus, manifest, files };
}
