/**
 * Digital-asset product corpus builder (Phase 4A).
 *
 * Deterministically derives the production read model for the full 44-company
 * v7 corpus from tracked, frozen inputs only:
 *
 *   research/v7/input/**                 (44 frozen research packets)
 *   judgments/v7/{calibration,validation,final_test}/**  (44 frozen judgment packets)
 *   lib/scoring/digital-asset/*           (frozen, unchanged scoring engine)
 *
 * Reuses the exact compile + score path already proven in
 * scripts/judgments-v7/build.ts and scripts/judgments-v7/score.ts, run once per
 * cohort directory and merged, so the product corpus covers all three
 * historical cohorts as one demonstration universe. Cohort membership is
 * carried through as audit metadata only; it is never used to order or filter
 * the product UI.
 *
 * Writes data/v7-product/companies.v7.json (tracked) and
 * its manifest. Never writes to judgments/v7, research/v7/input,
 * data/v7-analytical-inputs, or data/v7-score-results (those stay frozen).
 *
 * Run with: npm run product:build
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import yaml from "js-yaml";
import { sha256Hex } from "@/lib/hash/canonical";
import { validatePacket as validateResearchPacket } from "@/lib/research-v7/validate";
import type { Packet as ResearchPacket } from "@/lib/research-v7/packet-schema";
import { validateJudgmentPacket, type Issue } from "@/lib/judgments-v7/validate";
import type { JudgmentPacket, CriterionJudgment } from "@/lib/judgments-v7/packet-schema";
import { compileJudgmentBatch } from "@/lib/judgments-v7/compile";
import type { CompiledEntityAnalyticalInput } from "@/lib/judgments-v7/compile";
import { scoreScreeningEntity } from "@/lib/scoring/digital-asset/screening-aggregate";
import { computeCriterionConfidence } from "@/lib/scoring/digital-asset/evidence-confidence";
import { DA_SCREENING_CRITERIA_WEIGHTS } from "@/lib/scoring/digital-asset/screening";
import { DA_CRITICAL_DIMENSION_EVIDENCE_GUARD } from "@/lib/scoring/digital-asset/config";
import { DA_CALIBRATION_CONFIG_FREEZE_FINGERPRINT } from "@/lib/judgments-v7/methodology-fingerprint";
import type { EvidenceClaim } from "@/lib/schemas/evidence-claim";
import type { SourceRecordV7 } from "@/lib/schemas/v7/source-record";
import type { ThesisDimension } from "@/lib/schemas/thesis-configuration";
import type {
  ProductCompany,
  ProductCriterion,
  ProductDimension,
  ProductEvidenceGaps,
  ProductManifest,
  ProductSource,
  ProductSignalEvent,
  ProductPerson,
} from "@/lib/digital-asset-product/types";

const ROOT = process.cwd();
const RESEARCH_DIR = join(ROOT, "research", "v7", "input");
const JUDGMENT_COHORT_DIRS: Array<{ dir: string; batch: "CALIBRATION" | "VALIDATION" | "FINAL_TEST" }> = [
  { dir: join(ROOT, "judgments", "v7", "calibration"), batch: "CALIBRATION" },
  { dir: join(ROOT, "judgments", "v7", "validation"), batch: "VALIDATION" },
  { dir: join(ROOT, "judgments", "v7", "final_test"), batch: "FINAL_TEST" },
];
/** Override for tests only, so a determinism check never writes into the tracked corpus. */
const OUT_ROOT = process.env.PRODUCT_BUILD_OUT_ROOT ?? ROOT;
const OUT_DIR = join(OUT_ROOT, "data", "v7-product");

const CRITERION_TO_DIMENSION: Record<string, ThesisDimension> = Object.fromEntries(
  Object.entries(DA_SCREENING_CRITERIA_WEIGHTS).flatMap(([dim, weights]) =>
    Object.keys(weights).map((crit) => [crit, dim as ThesisDimension]),
  ),
);
const DIMENSION_COVERAGE_FLOOR = 0.5;

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
    if (!result.ok || !result.packet) {
      throw new Error(`Refusing to build product corpus: research packet "${f}" failed validation.`);
    }
    byId.set(result.packet.canonicalId, result.packet);
  }
  return byId;
}

/** Load and validate every judgment packet across all three cohort dirs, keyed by entityId. */
function loadJudgmentsByEntityId(): Map<string, JudgmentPacket> {
  const byId = new Map<string, JudgmentPacket>();
  const issues: Issue[] = [];
  for (const { dir } of JUDGMENT_COHORT_DIRS) {
    for (const f of collectYamlFiles(dir)) {
      const raw = yaml.load(readFileSync(f, "utf8"));
      const result = validateJudgmentPacket(raw, f);
      issues.push(...result.issues);
      if (result.ok && result.packet) byId.set(result.packet.entityId, result.packet);
    }
  }
  if (issues.some((i) => i.severity === "ERROR")) {
    for (const i of issues) console.error(`[${i.severity}] ${i.code}: ${i.message}`);
    throw new Error("Refusing to build product corpus: one or more frozen judgment packets failed validation.");
  }
  return byId;
}

/** Compile every cohort directory (reusing the frozen compile pipeline) and merge into one analytical-input list. */
function compileAllCohorts(researchByEntityId: Map<string, ResearchPacket>): CompiledEntityAnalyticalInput[] {
  const entities: CompiledEntityAnalyticalInput[] = [];
  for (const { dir, batch } of JUDGMENT_COHORT_DIRS) {
    const files = collectYamlFiles(dir);
    const inputs = files.map((f) => ({ label: f, raw: yaml.load(readFileSync(f, "utf8")) }));
    const result = compileJudgmentBatch(inputs, { batch, researchByEntityId });
    if (!result.ok || !result.corpus) {
      for (const i of result.issues) console.error(`[${i.severity}] ${i.code}: ${i.message}`);
      throw new Error(`Refusing to build product corpus: cohort "${batch}" failed to compile.`);
    }
    entities.push(...result.corpus.entities);
  }
  return entities;
}

function withConfidence(
  entity: CompiledEntityAnalyticalInput,
  judgments: ReadonlyMap<string, JudgmentPacket>,
  research: ReadonlyMap<string, ResearchPacket>,
): CompiledEntityAnalyticalInput {
  const judgment = judgments.get(entity.entityId);
  const packet = research.get(entity.entityId);
  if (!judgment || !packet) {
    throw new Error(`Refusing to build product corpus: no frozen judgment or research packet for "${entity.entityId}".`);
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

function toProductSource(s: SourceRecordV7, claimCount: number, linkedCriteriaIds: string[]): ProductSource {
  return {
    sourceId: s.id,
    publisher: s.publisher,
    title: s.title,
    url: s.url,
    sourceType: s.sourceType,
    tier: s.tier,
    publishedAt: s.publishedAt,
    availabilityDate: s.availabilityDate,
    isIndependent: s.isIndependent,
    canCorroborate: s.canCorroborate,
    originatesFrom: s.originatesFrom,
    supportRole: s.supportRole,
    claimCount,
    linkedCriteriaIds,
  };
}

function buildCriteria(
  judgment: JudgmentPacket,
  research: ResearchPacket,
  scoredCriteria: Map<string, { rawAnchor: number | null; coverage: number; confidence: number; applicability: string }>,
): ProductCriterion[] {
  const claimsById = new Map(research.evidenceClaims.map((c) => [c.id, c]));
  return judgment.criterionJudgments
    .map((cj: CriterionJudgment): ProductCriterion => {
      const scored = scoredCriteria.get(cj.criterionId);
      const citedClaims = cj.citedEvidenceClaimIds
        .map((id) => claimsById.get(id))
        .filter((c): c is EvidenceClaim => Boolean(c))
        .map((c) => ({
          claimId: c.id,
          claim: c.claim,
          topic: c.topic,
          provenance: c.provenance,
          sourceId: c.sourceId,
          publicationDate: c.publicationDate,
          evidenceStatus: c.evidenceStatus,
          contradicts: c.contradicts,
          contradictedBy: c.contradictedBy,
          contradictionNote: c.contradictionNote,
          diligenceQuestion: c.diligenceQuestion,
        }));
      return {
        criterionId: cj.criterionId,
        dimension: CRITERION_TO_DIMENSION[cj.criterionId]!,
        applicability: cj.applicability,
        rawAnchor: cj.rawAnchor,
        coverage: cj.coverage,
        confidence: scored?.confidence ?? 0,
        rationale: cj.rationale,
        evidenceGapNote: cj.evidenceGapNote,
        acknowledgedContradictionIds: cj.acknowledgedContradictionIds,
        citedClaims,
      };
    })
    .sort((a, b) => a.criterionId.localeCompare(b.criterionId));
}

function deriveEvidenceGaps(dimensions: ProductDimension[], criteria: ProductCriterion[]): ProductEvidenceGaps {
  const criticalDimensionGaps = dimensions
    .filter((d) => (DA_CRITICAL_DIMENSION_EVIDENCE_GUARD.dimensions as readonly string[]).includes(d.dimension) && d.coverage < DIMENSION_COVERAGE_FLOOR)
    .map((d) => ({ dimension: d.dimension, coverage: d.coverage, blocksEvidenceBar: d.coverage <= 0 }));
  const missingDimensions = dimensions.filter((d) => d.coverage <= 0).map((d) => d.dimension);
  const thinDimensions = dimensions
    .filter((d) => d.coverage > 0 && d.coverage < DIMENSION_COVERAGE_FLOOR)
    .map((d) => ({ dimension: d.dimension, coverage: d.coverage }));
  const criterionGapNotes = criteria
    .filter((c) => c.evidenceGapNote !== null)
    .map((c) => ({ criterionId: c.criterionId, dimension: c.dimension, note: c.evidenceGapNote! }));
  const unresolvedConflicts = criteria
    .flatMap((c) => c.citedClaims)
    .filter((c) => (c.contradicts.length > 0 || c.contradictedBy.length > 0) && !c.contradictionNote)
    .map((c) => ({ claimId: c.claimId, against: [...c.contradicts, ...c.contradictedBy], note: c.contradictionNote }));
  const researchQuestions = new Set<string>();
  for (const g of criticalDimensionGaps) {
    researchQuestions.add(
      g.blocksEvidenceBar
        ? `Find any public operating evidence for the critical dimension "${humanDimension(g.dimension)}" (currently zero coverage).`
        : `Deepen evidence for the critical dimension "${humanDimension(g.dimension)}" (coverage ${g.coverage}, below ${DIMENSION_COVERAGE_FLOOR}).`,
    );
  }
  for (const c of criteria) {
    for (const cl of c.citedClaims) if (cl.diligenceQuestion) researchQuestions.add(cl.diligenceQuestion);
  }
  for (const n of criterionGapNotes) researchQuestions.add(n.note);
  return {
    criticalDimensionGaps,
    missingDimensions,
    thinDimensions,
    criterionGapNotes,
    unresolvedConflicts,
    researchQuestions: [...researchQuestions],
  };
}

/** Human-readable dimension label, matching lib/ui/format.ts dimensionLabel exactly. */
function humanDimension(id: string): string {
  return id.replace(/_/g, " ").replace(/\bgtm\b/i, "GTM");
}

function majorEvidenceGap(gaps: ProductEvidenceGaps, dimensions: ProductDimension[]): string | null {
  const blocking = gaps.criticalDimensionGaps.find((g) => g.blocksEvidenceBar);
  if (blocking) return `${humanDimension(blocking.dimension)}: no evidence`;
  const thinCritical = gaps.criticalDimensionGaps[0];
  if (thinCritical) return `${humanDimension(thinCritical.dimension)}: thin evidence (${thinCritical.coverage})`;
  if (gaps.missingDimensions.length > 0) return `${humanDimension(gaps.missingDimensions[0]!)}: no evidence`;
  if (gaps.thinDimensions.length > 0) {
    const t = [...gaps.thinDimensions].sort((a, b) => a.coverage - b.coverage)[0]!;
    return `${humanDimension(t.dimension)}: thin evidence (${t.coverage})`;
  }
  if (gaps.unresolvedConflicts.length > 0) return "unresolved evidence conflict";
  const thinnest = [...dimensions].sort((a, b) => a.coverage - b.coverage)[0];
  if (thinnest && thinnest.coverage < 1) return `${humanDimension(thinnest.dimension)}: partial evidence (${thinnest.coverage})`;
  return null;
}

function toProductSignalEvents(research: ResearchPacket, sourcesById: Map<string, SourceRecordV7>): ProductSignalEvent[] {
  return [...research.signalEvents]
    .sort((a, b) => (b.eventDate ?? b.publicationDate ?? "").localeCompare(a.eventDate ?? a.publicationDate ?? ""))
    .map((e) => ({
      eventId: e.id,
      subjectType: e.subjectType,
      signalType: e.signalType,
      signalCategory: e.signalCategory,
      signalDirection: e.signalDirection,
      eventDate: e.eventDate,
      publicationDate: e.publicationDate,
      eventStatus: e.eventStatus,
      unconfirmedNote: e.unconfirmedNote,
      evidenceSummary: e.evidenceSummary,
      sourceId: e.sourceId,
      sourceUrl: sourcesById.get(e.sourceId)?.url ?? null,
    }));
}

function toProductPeople(research: ResearchPacket): ProductPerson[] {
  return [...research.people]
    .map((p) => ({
      personId: p.id,
      name: p.name,
      currentRole: p.currentRole,
      isFounder: p.companyTenures.some((t) => t.isFounder),
      tenures: p.companyTenures.map((t) => ({
        companyName: t.companyName,
        role: t.role,
        startDate: t.startDate,
        endDate: t.endDate,
        isFounder: t.isFounder,
      })),
      priorCompanies: p.priorCompanies,
    }))
    .sort((a, b) => Number(b.isFounder) - Number(a.isFounder) || a.name.localeCompare(b.name));
}

function main(): void {
  const runAt = process.env.PRODUCT_BUILD_RUN_AT;
  const generatedAt = (runAt ? new Date(runAt) : new Date()).toISOString();

  const researchByEntityId = loadResearchByCanonicalId(RESEARCH_DIR);
  const judgmentsByEntityId = loadJudgmentsByEntityId();
  const compiledEntities = compileAllCohorts(researchByEntityId).sort((a, b) => a.entityId.localeCompare(b.entityId));

  const researchBaselineCommits = new Set(compiledEntities.map((e) => e.researchBaselineCommit));
  const methodologyFingerprints = new Set(compiledEntities.map((e) => e.methodologyConfigFingerprint));
  if (researchBaselineCommits.size !== 1) {
    throw new Error(`Refusing to build product corpus: ${researchBaselineCommits.size} distinct researchBaselineCommit values (expected 1).`);
  }
  if (methodologyFingerprints.size !== 1) {
    throw new Error(`Refusing to build product corpus: ${methodologyFingerprints.size} distinct methodologyConfigFingerprint values (expected 1).`);
  }

  const seenSlugs = new Set<string>();
  const companies: ProductCompany[] = compiledEntities.map((entity) => {
    const research = researchByEntityId.get(entity.entityId);
    const judgment = judgmentsByEntityId.get(entity.entityId);
    if (!research || !judgment) {
      throw new Error(`Refusing to build product corpus: missing research or judgment for "${entity.entityId}".`);
    }
    if (seenSlugs.has(research.slug)) {
      throw new Error(`Refusing to build product corpus: duplicate slug "${research.slug}".`);
    }
    seenSlugs.add(research.slug);

    const withConfidenceEntity = withConfidence(entity, judgmentsByEntityId, researchByEntityId);
    const score = scoreScreeningEntity(withConfidenceEntity);
    const scoredCriteria = new Map(
      withConfidenceEntity.criteria.map((c) => [
        c.criterionId,
        { rawAnchor: c.rawAnchor, coverage: c.coverage, confidence: c.confidence ?? 0, applicability: c.applicability },
      ]),
    );

    const criteria = buildCriteria(judgment, research, scoredCriteria);
    const dimensions: ProductDimension[] = score.dimensions.map((d) => ({
      dimension: d.dimension,
      score: d.score,
      coverage: d.coverage,
      confidence: d.confidence,
      excludedNotApplicable: d.excludedNotApplicable,
      unresolvedApplicability: d.unresolvedApplicability,
    }));
    const evidenceGaps = deriveEvidenceGaps(dimensions, criteria);

    const sourcesById = new Map(research.sources.map((s) => [s.id, s]));
    const claimCountBySourceId = new Map<string, number>();
    const criteriaIdsBySourceId = new Map<string, Set<string>>();
    for (const c of criteria) {
      for (const cl of c.citedClaims) {
        if (!cl.sourceId) continue;
        claimCountBySourceId.set(cl.sourceId, (claimCountBySourceId.get(cl.sourceId) ?? 0) + 1);
        const set = criteriaIdsBySourceId.get(cl.sourceId) ?? new Set<string>();
        set.add(c.criterionId);
        criteriaIdsBySourceId.set(cl.sourceId, set);
      }
    }
    const sources = [...claimCountBySourceId.keys()]
      .map((id) => sourcesById.get(id))
      .filter((s): s is SourceRecordV7 => Boolean(s))
      .map((s) => toProductSource(s, claimCountBySourceId.get(s.id) ?? 0, [...(criteriaIdsBySourceId.get(s.id) ?? [])].sort()))
      .sort((a, b) => a.sourceId.localeCompare(b.sourceId));

    const signalEvents = toProductSignalEvents(research, sourcesById);

    return {
      entityId: entity.entityId,
      candidateId: entity.candidateId,
      cohort: entity.cohort,
      slug: research.slug,
      name: research.canonicalName,
      description: research.description,
      domain: research.domain,
      category: research.category,
      entityType: research.entityType,
      assetType: research.assetType,
      institutionalOrientation: research.institutionalOrientation,
      digitalAssetLifecycle: research.digitalAssetLifecycle,
      financingStage: research.financingStage,
      firstObservedAt: research.firstObservedAt,
      mandateStatus: "NOT_ASSESSED",
      rankEligibility: score.rankEligibility,
      thesisFit: score.thesisFit,
      overallCoverage: score.overallCoverage,
      overallConfidence: score.overallConfidence,
      displayState: score.displayState,
      dimensions,
      criteria,
      evidenceGaps,
      majorEvidenceGap: majorEvidenceGap(evidenceGaps, dimensions),
      signalEvents,
      recentSignal: signalEvents[0] ?? null,
      sources,
      sourceCount: sources.length,
      independentSourceCount: sources.filter((s) => s.isIndependent).length,
      people: toProductPeople(research),
    };
  });

  const doc = {
    schemaVersion: 7,
    generatedAt,
    companyCount: companies.length,
    researchBaselineCommit: [...researchBaselineCommits][0],
    methodologyConfigFingerprint: [...methodologyFingerprints][0],
    calibrationConfigFreezeFingerprint: DA_CALIBRATION_CONFIG_FREEZE_FINGERPRINT,
    companies,
  };

  const text = JSON.stringify(doc, null, 2) + "\n";
  const outPath = join(OUT_DIR, "companies.v7.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, text, "utf8");

  const manifest: ProductManifest = {
    schemaVersion: 7,
    generatedAt,
    generator: "scripts/product/build-corpus.ts",
    companyCount: companies.length,
    cohortCounts: {
      CALIBRATION: companies.filter((c) => c.cohort === "CALIBRATION").length,
      VALIDATION: companies.filter((c) => c.cohort === "VALIDATION").length,
      FINAL_TEST: companies.filter((c) => c.cohort === "FINAL_TEST").length,
    },
    sha256: `sha256:${sha256Hex(text)}`,
  };
  writeFileSync(join(OUT_DIR, "MANIFEST.v7.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(`Built product corpus: ${companies.length} companies -> ${outPath}`);
}

main();
