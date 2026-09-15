/**
 * Production Screening analytical read path (server-only).
 *
 * canonical research corpus (data/generated/*.json)
 *   + sanctioned human Screening inputs (data/analytical-inputs/screening-assessments.json)
 *   -> the EXISTING deterministic Screening engine (lib/scoring/*), unchanged
 *   -> this application read model
 *   -> future Worklist / Company Detail frontend (Phase 6D-C)
 *
 * HARD CONSTRAINTS (enforced by tests/screening-read/firewall.test.ts):
 *   - No import of the Phase 6C descriptive-diagnostic runner under scripts.
 *   - No consumption of that runner's committed JSON output under docs.
 *   - No ScoreSnapshot persisted. No score cache written. Computed on read.
 *   - Mandate Eligibility is NOT defaulted to ELIGIBLE. It is honestly
 *     NOT_ASSESSED, and full Screening evidence eligibility stays null.
 *   - Scoring uses ONLY lib/scoring/* (the calibrated, tested modules). No
 *     parallel implementation, no copied formulas, no frontend recalculation.
 *
 * This module reads files with node:fs and must only be used server-side
 * (route handlers, server components, server actions, scripts).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import {
  scoreScreeningCriterion,
  scoreScreeningDimension,
  scoreScreeningThesisFit,
  SCREENING_CRITERIA_WEIGHTS,
  SCREENING_CRITERION_IDS,
} from "@/lib/scoring/screening";
import { adaptCriterionEvidence, type AdapterClaim } from "@/lib/scoring/evidence-adapter";
import { evaluateScreeningEvidenceBarPreconditions } from "@/lib/scoring/screening-eligibility";
import { SCREENING_EVIDENCE_SUFFICIENCY } from "@/lib/scoring/config";
import { thesisDimensionSchema, type ThesisDimension } from "@/lib/schemas/thesis-configuration";
import type { CriterionResult } from "@/lib/scoring/criterion";
import type { DimensionResult } from "@/lib/scoring/dimension";
import type { EvidenceClaim } from "@/lib/schemas/evidence-claim";
import type { SourceRecord } from "@/lib/schemas/source-record";
import type { SignalEvent } from "@/lib/schemas/signal-event";
import type { Company } from "@/lib/schemas/company";
import type { Person } from "@/lib/schemas/person";

import type {
  ClaimRef,
  CompanyIdentity,
  PersonReadView,
  CompanyScreeningDetail,
  CriterionReadResult,
  DimensionReadResult,
  EvidenceBarMechanics,
  EvidenceGaps,
  ScreeningReadModelMeta,
  ScreeningWorklistRow,
  SignalEventReadView,
  SourceRef,
} from "./types";

export * from "./types";

/** The single scoring as-of date for Screening (matches the analytical inputs and Phase 5C-D / 6C). */
export const SCREENING_READ_AS_OF = "2026-09-08";

const ROOT = process.cwd();
const GENERATED = join(ROOT, "data", "generated");
const ASSESSMENTS = join(ROOT, "data", "analytical-inputs", "screening-assessments.json");

const CRITICAL_DIMENSIONS: readonly ThesisDimension[] = ["capital_efficiency", "growth_momentum"];
const DIMENSION_ORDER = thesisDimensionSchema.options as readonly ThesisDimension[];

const CRITERION_TO_DIMENSION: Record<string, ThesisDimension> = Object.fromEntries(
  Object.entries(SCREENING_CRITERIA_WEIGHTS).flatMap(([dim, weights]) =>
    Object.keys(weights).map((crit) => [crit, dim as ThesisDimension]),
  ),
);

/* -------------------------------------------------------------------------- */
/* Analytical input schema                                                    */
/* -------------------------------------------------------------------------- */

const criterionInputSchema = z
  .object({
    rawAnchor: z.union([z.literal(0), z.literal(25), z.literal(50), z.literal(75), z.literal(100), z.null()]),
    coverage: z.union([z.literal(0), z.literal(0.5), z.literal(1)]),
    qualifyingClaimIds: z.array(z.string().min(1)),
    reviewedButExcludedClaimIds: z.array(z.string().min(1)),
    rationale: z.string().min(1),
  })
  .strict();

const assessmentsSchema = z
  .object({
    dataset: z.literal("screening-analytical-inputs"),
    datasetVersion: z.number().int().positive(),
    asOf: z.string(),
    description: z.string(),
    ownership: z.string(),
    reconciledFrom: z.record(z.string(), z.string()),
    counts: z.object({
      companies: z.number().int(),
      criterionAssessments: z.number().int(),
      criteriaPerCompany: z.number().int(),
    }),
    companies: z.record(
      z.string(),
      z.object({
        companyId: z.string(),
        domain: z.string(),
        name: z.string(),
        criteria: z.record(z.string(), criterionInputSchema),
      }),
    ),
  })
  .strict();

export type ScreeningAssessments = z.infer<typeof assessmentsSchema>;

/* -------------------------------------------------------------------------- */
/* Corpus loading (committed generated JSON only)                             */
/* -------------------------------------------------------------------------- */

interface Corpus {
  companies: Company[];
  companyById: Map<string, Company>;
  claims: EvidenceClaim[];
  claimById: Map<string, EvidenceClaim>;
  sources: SourceRecord[];
  sourceById: Map<string, SourceRecord>;
  people: Person[];
  personById: Map<string, Person>;
  events: SignalEvent[];
  eventsByCompany: Map<string, SignalEvent[]>;
  generatedAt: string;
}

function loadRecords<T>(name: string): { records: T[]; generatedAt: string } {
  const parsed = JSON.parse(readFileSync(join(GENERATED, name), "utf8"));
  return { records: parsed.records as T[], generatedAt: parsed.generatedAt as string };
}

let cachedCorpus: Corpus | null = null;
let cachedAssessments: ScreeningAssessments | null = null;

/**
 * In-process memoisation of the immutable committed inputs. This is NOT a score
 * cache: nothing computed is stored, and every read recomputes the scoring.
 */
function loadCorpus(): Corpus {
  if (cachedCorpus) return cachedCorpus;
  const companies = loadRecords<Company>("companies.json");
  const claims = loadRecords<EvidenceClaim>("evidence.json");
  const sources = loadRecords<SourceRecord>("sources.json");
  const people = loadRecords<Person>("people.json");
  const events = loadRecords<SignalEvent>("signal-events.json");

  const eventsByCompany = new Map<string, SignalEvent[]>();
  for (const e of events.records) {
    if (!e.companyId) continue;
    const list = eventsByCompany.get(e.companyId) ?? [];
    list.push(e);
    eventsByCompany.set(e.companyId, list);
  }

  cachedCorpus = {
    companies: companies.records,
    companyById: new Map(companies.records.map((c) => [c.id, c])),
    claims: claims.records,
    claimById: new Map(claims.records.map((c) => [c.id, c])),
    sources: sources.records,
    sourceById: new Map(sources.records.map((s) => [s.id, s])),
    people: people.records,
    personById: new Map(people.records.map((p) => [p.id, p])),
    events: events.records,
    eventsByCompany,
    generatedAt: companies.generatedAt,
  };
  return cachedCorpus;
}

function loadAssessments(): ScreeningAssessments {
  if (cachedAssessments) return cachedAssessments;
  const parsed = assessmentsSchema.parse(JSON.parse(readFileSync(ASSESSMENTS, "utf8")));
  cachedAssessments = parsed;
  return parsed;
}

/** Test-only: drop the in-process input memoisation. */
export function __resetScreeningReadCache(): void {
  cachedCorpus = null;
  cachedAssessments = null;
}

/* -------------------------------------------------------------------------- */
/* Provenance hydration                                                       */
/* -------------------------------------------------------------------------- */

function toClaimRef(c: EvidenceClaim): ClaimRef {
  return {
    claimId: c.id,
    companyId: c.companyId,
    claim: c.claim,
    topic: c.topic ?? null,
    provenance: c.provenance,
    sourceSubtype: c.sourceSubtype ?? null,
    publicationDate: c.publicationDate ?? null,
    metricAsOfDate: c.metricAsOfDate ?? null,
    sourceId: c.sourceId ?? null,
    supportingSourceIds: c.supportingSourceIds ?? [],
    contradicts: c.contradicts ?? [],
    contradictedBy: c.contradictedBy ?? [],
    contradictionNote: c.contradictionNote ?? null,
    diligenceQuestion: c.diligenceQuestion ?? null,
  };
}

function toSourceRef(s: SourceRecord): SourceRef {
  return {
    sourceId: s.id,
    publisher: s.publisher ?? null,
    title: s.title ?? null,
    url: s.url ?? null,
    sourceType: s.sourceType,
    publishedAt: s.publishedAt ?? null,
    originatesFrom: s.originatesFrom ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Core per-company computation (the ONE authoritative calculation path)      */
/* -------------------------------------------------------------------------- */

interface ComputedCompany {
  criterionResults: CriterionResult[];
  dimensionResults: DimensionResult[];
  fit: ReturnType<typeof scoreScreeningThesisFit>;
  contradictionByCriterion: Map<string, "none" | "minor" | "material">;
}

function computeCompany(
  companyEntry: ScreeningAssessments["companies"][string],
  corpus: Corpus,
): ComputedCompany {
  const criterionResults: CriterionResult[] = [];
  const contradictionByCriterion = new Map<string, "none" | "minor" | "material">();

  for (const criterionId of SCREENING_CRITERION_IDS) {
    const j = companyEntry.criteria[criterionId];
    if (!j) throw new Error(`company ${companyEntry.companyId} is missing criterion ${criterionId}`);

    const claims: AdapterClaim[] = j.qualifyingClaimIds.map((id) => {
      const c = corpus.claimById.get(id);
      if (!c) throw new Error(`criterion ${criterionId}: claim ${id} not in corpus`);
      return c as AdapterClaim;
    });

    const adapted = adaptCriterionEvidence({
      criterionId,
      claims,
      sources: corpus.sources,
      asOfDate: SCREENING_READ_AS_OF,
    });
    contradictionByCriterion.set(criterionId, adapted.contradiction);

    criterionResults.push(
      scoreScreeningCriterion(
        {
          criterionId,
          rawAnchor: j.rawAnchor,
          rubricAnchorUsed: j.rawAnchor !== null,
          supportingClaimIds: j.qualifyingClaimIds,
          opposingClaimIds: [],
          unknowns: [],
          coverage: j.coverage,
          analystRationale: j.rationale,
        },
        adapted.resolutionInput,
      ),
    );
  }

  const dimensionResults: DimensionResult[] = DIMENSION_ORDER.map((dim) =>
    scoreScreeningDimension(
      dim,
      criterionResults.filter((c) => CRITERION_TO_DIMENSION[c.criterionId] === dim),
    ),
  );

  return {
    criterionResults,
    dimensionResults,
    fit: scoreScreeningThesisFit(dimensionResults),
    contradictionByCriterion,
  };
}

/* -------------------------------------------------------------------------- */
/* Evidence bar mechanics (non-mandate). Calibrated evaluator, unchanged.     */
/* -------------------------------------------------------------------------- */

function evidenceBarMechanics(computed: ComputedCompany): EvidenceBarMechanics {
  const { fit, dimensionResults } = computed;
  const dimensionCoverages = DIMENSION_ORDER.map(
    (dim) => dimensionResults.find((d) => d.dimension === dim)?.coverage ?? 0,
  );

  // Non-mandate evidence-bar mechanics via the explicit deterministic helper.
  // Production mandate status is NOT_ASSESSED: no mandate value, real or
  // synthetic, is involved in computing this read model.
  const preconditions = evaluateScreeningEvidenceBarPreconditions({
    overallEvidenceCoverage: fit.coverage,
    overallScoringConfidence: fit.confidence,
    dimensionCoverages,
    conflicts: [],
  });

  const C = SCREENING_EVIDENCE_SUFFICIENCY;
  const dimensionsAtFloor = dimensionCoverages.filter((c) => c >= C.dimensionCoverageFloor).length;
  const criticalCoverage = {
    capital_efficiency: dimensionCoverages[DIMENSION_ORDER.indexOf("capital_efficiency")] ?? 0,
    growth_momentum: dimensionCoverages[DIMENSION_ORDER.indexOf("growth_momentum")] ?? 0,
  } as const;

  return {
    overallCoveragePass: fit.coverage >= C.minOverallCoverage,
    overallCoverage: fit.coverage,
    overallConfidencePass: fit.confidence >= C.minOverallConfidence,
    overallConfidence: fit.confidence,
    dimensionsAtFloorPass: dimensionsAtFloor >= C.minDimensionsAtFloor,
    dimensionsAtFloor,
    criticalDimensionsNonZeroCoveragePass:
      criticalCoverage.capital_efficiency > 0 && criticalCoverage.growth_momentum > 0,
    criticalDimensionCoverage: criticalCoverage,
    noMaterialBlockingConflictPass: !preconditions.materialBlockingConflict,
    displayStatePass: preconditions.displayState === "SCREENED",
    nonMandateEvidenceBarPass: preconditions.nonMandateEvidenceBarPass,
    failedPreconditions: preconditions.failedPreconditions,
  };
}

/* -------------------------------------------------------------------------- */
/* Dimension / criterion read views                                           */
/* -------------------------------------------------------------------------- */

function coverageFlag(coverage: number): "covered" | "thin" | "missing" {
  if (coverage <= 0) return "missing";
  if (coverage < SCREENING_EVIDENCE_SUFFICIENCY.dimensionCoverageFloor) return "thin";
  return "covered";
}

function toDimensionViews(computed: ComputedCompany): DimensionReadResult[] {
  return computed.dimensionResults.map((d) => ({
    dimension: d.dimension,
    score: d.score,
    coverage: d.coverage,
    confidence: d.confidence,
    displayState: d.displayState,
    isCritical: CRITICAL_DIMENSIONS.includes(d.dimension),
    coverageFlag: coverageFlag(d.coverage),
  }));
}

function toCriterionViews(
  computed: ComputedCompany,
  companyEntry: ScreeningAssessments["companies"][string],
  corpus: Corpus,
): CriterionReadResult[] {
  return computed.criterionResults.map((r) => {
    const j = companyEntry.criteria[r.criterionId]!;
    const hydrate = (ids: string[]): ClaimRef[] =>
      ids.map((id) => toClaimRef(corpus.claimById.get(id)!));
    return {
      criterionId: r.criterionId,
      dimension: CRITERION_TO_DIMENSION[r.criterionId]!,
      rawAnchor: j.rawAnchor,
      coverage: j.coverage,
      adjustedScore: r.internalAdjustedScore,
      confidence: r.confidence,
      neutralFill: j.rawAnchor === null,
      displayStatus: r.displayStatus,
      contradiction: computed.contradictionByCriterion.get(r.criterionId) ?? "none",
      supportingClaims: hydrate(j.qualifyingClaimIds),
      reviewedButExcludedClaims: hydrate(j.reviewedButExcludedClaimIds),
      rationale: j.rationale,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Evidence gaps                                                              */
/* -------------------------------------------------------------------------- */

function deriveEvidenceGaps(
  dimensions: DimensionReadResult[],
  criteria: CriterionReadResult[],
  companyEntry: ScreeningAssessments["companies"][string],
  corpus: Corpus,
): EvidenceGaps {
  const floor = SCREENING_EVIDENCE_SUFFICIENCY.dimensionCoverageFloor;

  const criticalDimensionGaps = dimensions
    .filter((d) => d.isCritical && d.coverage < floor)
    .map((d) => ({ dimension: d.dimension, coverage: d.coverage, blocksEvidenceBar: d.coverage <= 0 }));

  const missingDimensions = dimensions.filter((d) => d.coverage <= 0).map((d) => d.dimension);

  const thinDimensions = dimensions
    .filter((d) => d.coverage > 0 && d.coverage < floor)
    .map((d) => ({ dimension: d.dimension, coverage: d.coverage }));

  const criterionCoverageGaps = criteria
    .filter((c) => c.coverage <= 0 || c.neutralFill)
    .map((c) => ({
      criterionId: c.criterionId,
      dimension: c.dimension,
      coverage: c.coverage,
      neutralFill: c.neutralFill,
    }));

  const citedClaimIds = new Set<string>();
  for (const c of criteria) {
    for (const cl of c.supportingClaims) citedClaimIds.add(cl.claimId);
    for (const cl of c.reviewedButExcludedClaims) citedClaimIds.add(cl.claimId);
  }
  const unresolvedConflicts = [...citedClaimIds]
    .map((id) => corpus.claimById.get(id)!)
    .filter((c) => (c.contradicts?.length || c.contradictedBy?.length) && !c.contradictionNote)
    .map((c) => ({
      claimId: c.id,
      against: [...(c.contradicts ?? []), ...(c.contradictedBy ?? [])],
      note: c.contradictionNote ?? null,
    }));

  const reviewedButExcludedEvidence: EvidenceGaps["reviewedButExcludedEvidence"] = [];
  for (const [criterionId, j] of Object.entries(companyEntry.criteria)) {
    for (const claimId of j.reviewedButExcludedClaimIds) {
      reviewedButExcludedEvidence.push({ criterionId, claimId });
    }
  }

  const researchQuestions: string[] = [];
  for (const g of criticalDimensionGaps) {
    researchQuestions.push(
      g.blocksEvidenceBar
        ? `Find any public operating evidence for the critical dimension "${g.dimension}" (currently zero coverage, blocking the Screening evidence bar).`
        : `Deepen evidence for the critical dimension "${g.dimension}" (coverage ${g.coverage}, below the ${floor} evidence-bar floor).`,
    );
  }
  for (const d of thinDimensions) {
    if (!CRITICAL_DIMENSIONS.includes(d.dimension)) {
      researchQuestions.push(`Add evidence for "${d.dimension}" (coverage ${d.coverage}, below ${floor}).`);
    }
  }
  for (const id of citedClaimIds) {
    const q = corpus.claimById.get(id)?.diligenceQuestion;
    if (q) researchQuestions.push(q);
  }
  for (const c of unresolvedConflicts) {
    researchQuestions.push(`Resolve the unrecorded contradiction on claim ${c.claimId} (conflicts with ${c.against.join(", ")}).`);
  }

  return {
    criticalDimensionGaps,
    missingDimensions,
    thinDimensions,
    criterionCoverageGaps,
    unresolvedConflicts,
    reviewedButExcludedEvidence,
    researchQuestions: [...new Set(researchQuestions)],
  };
}

/** The single most material gap for the worklist row, or null. A research pointer, never a score. */
function majorEvidenceGap(gaps: EvidenceGaps, dimensions: DimensionReadResult[]): string | null {
  const blocking = gaps.criticalDimensionGaps.find((g) => g.blocksEvidenceBar);
  if (blocking) return `${blocking.dimension}: no evidence`;
  const thinCritical = gaps.criticalDimensionGaps[0];
  if (thinCritical) return `${thinCritical.dimension}: thin evidence (${thinCritical.coverage})`;
  if (gaps.missingDimensions.length > 0) return `${gaps.missingDimensions[0]}: no evidence`;
  if (gaps.thinDimensions.length > 0) {
    const t = [...gaps.thinDimensions].sort((a, b) => a.coverage - b.coverage)[0]!;
    return `${t.dimension}: thin evidence (${t.coverage})`;
  }
  if (gaps.unresolvedConflicts.length > 0) return `unresolved evidence conflict`;
  const thinnest = [...dimensions].sort((a, b) => a.coverage - b.coverage)[0];
  if (thinnest && thinnest.coverage < 1) return `${thinnest.dimension}: partial evidence (${thinnest.coverage})`;
  return null;
}

/* -------------------------------------------------------------------------- */
/* Identity + events                                                          */
/* -------------------------------------------------------------------------- */

function toIdentity(c: Company): CompanyIdentity {
  return {
    companyId: c.id,
    name: c.name,
    domain: c.domain,
    description: c.description ?? null,
    sector: c.sector ?? null,
    subsector: c.subsector ?? null,
    stage: c.stage ?? null,
    hqLocation: c.hqLocation ?? null,
    isPrivate: c.isPrivate ?? true,
    lastResearchUpdate: c.lastUpdatedAt ?? null,
    notes: c.notes ?? null,
  };
}

function eventSortKey(e: SignalEvent): string {
  return e.eventDate ?? e.availabilityDate ?? e.publicationDate ?? "";
}

function toSignalEventViews(events: SignalEvent[]): SignalEventReadView[] {
  return [...events]
    .sort((a, b) => eventSortKey(b).localeCompare(eventSortKey(a)))
    .map((e) => ({
      eventId: e.id,
      eventDate: e.eventDate ?? null,
      publicationDate: e.publicationDate ?? null,
      signalType: e.signalType,
      signalCategory: e.signalCategory,
      signalDirection: e.signalDirection,
      eventStatus: e.eventStatus,
      summary: e.evidenceSummary ?? null,
      sourceId: e.sourceRecordId ?? null,
      sourceUrl: e.sourceUrl ?? null,
    }));
}

function distinctSourceCount(criteria: CriterionReadResult[]): number {
  const ids = new Set<string>();
  for (const c of criteria) {
    for (const cl of c.supportingClaims) {
      if (cl.sourceId) ids.add(cl.sourceId);
      for (const s of cl.supportingSourceIds) ids.add(s);
    }
  }
  return ids.size;
}

/* -------------------------------------------------------------------------- */
/* Public read operations                                                     */
/* -------------------------------------------------------------------------- */

const MANDATE_NOTE =
  "Mandate Eligibility has not been independently evaluated for this company. It is " +
  "not inferred, not defaulted to ELIGIBLE, and not derived from any diagnostic assumption.";

const EVIDENCE_ELIGIBILITY_NOTE =
  "Full Screening evidence eligibility is unresolved (null) because it requires a Mandate " +
  "Eligibility assessment, which does not yet exist for this company. The non-mandate " +
  "evidence-bar mechanics are exposed separately in evidenceBar.";

function buildRow(company: Company, corpus: Corpus, computed: ComputedCompany): ScreeningWorklistRow {
  const assessments = loadAssessments();
  const entry = assessments.companies[company.id]!;
  const dimensions = toDimensionViews(computed);
  const criteria = toCriterionViews(computed, entry, corpus);
  const gaps = deriveEvidenceGaps(dimensions, criteria, entry, corpus);
  const events = toSignalEventViews(corpus.eventsByCompany.get(company.id) ?? []);
  const recent = events[0];

  return {
    analyticalMode: "screening",
    identity: toIdentity(company),
    displayState: computed.fit.displayState,
    screeningThesisFit: computed.fit.score,
    overallEvidenceCoverage: computed.fit.coverage,
    overallEvidenceConfidence: computed.fit.confidence,
    evidenceBar: evidenceBarMechanics(computed),
    mandateStatus: "NOT_ASSESSED",
    screeningEvidenceEligibility: null,
    majorEvidenceGap: majorEvidenceGap(gaps, dimensions),
    sourceCount: distinctSourceCount(criteria),
    recentSignal: recent
      ? {
          eventDate: recent.eventDate,
          signalType: recent.signalType,
          signalDirection: recent.signalDirection,
          eventStatus: recent.eventStatus,
        }
      : null,
  };
}

/**
 * Worklist analytical read: all 39 companies in a deterministic neutral order
 * (canonical company id ascending). NEVER ordered by Fit / Coverage / Confidence
 * / Momentum / Convergence. No Priority. No ranking.
 */
export function getScreeningWorklist(): ScreeningWorklistRow[] {
  const corpus = loadCorpus();
  const assessments = loadAssessments();
  const ids = Object.keys(assessments.companies).sort((a, b) => a.localeCompare(b));
  return ids.map((id) => {
    const company = corpus.companyById.get(id);
    if (!company) throw new Error(`analytical input company ${id} is not in the corpus`);
    return buildRow(company, corpus, computeCompany(assessments.companies[id]!, corpus));
  });
}

/**
 * Company analytical detail read: one company by stable company id. Full
 * Screening summary, dimensions, criteria, evidence references, excluded
 * evidence, research gaps, provenance, canonical SignalEvents. No Priority,
 * no ranking, no Underwriting result.
 */
export function getCompanyScreeningDetail(companyId: string): CompanyScreeningDetail | null {
  const corpus = loadCorpus();
  const assessments = loadAssessments();
  const entry = assessments.companies[companyId];
  const company = corpus.companyById.get(companyId);
  if (!entry || !company) return null;

  const computed = computeCompany(entry, corpus);
  const dimensions = toDimensionViews(computed);
  const criteria = toCriterionViews(computed, entry, corpus);
  const gaps = deriveEvidenceGaps(dimensions, criteria, entry, corpus);

  const citedClaimIds = new Set<string>();
  for (const c of criteria) {
    for (const cl of [...c.supportingClaims, ...c.reviewedButExcludedClaims]) citedClaimIds.add(cl.claimId);
  }
  const citedClaims = [...citedClaimIds].sort().map((id) => toClaimRef(corpus.claimById.get(id)!));
  const citedSourceIds = new Set<string>();
  for (const c of citedClaims) {
    if (c.sourceId) citedSourceIds.add(c.sourceId);
    for (const s of c.supportingSourceIds) citedSourceIds.add(s);
  }
  const citedSources = [...citedSourceIds]
    .sort()
    .map((id) => corpus.sourceById.get(id))
    .filter((s): s is SourceRecord => Boolean(s))
    .map(toSourceRef);

  const founderIds = company.founderIds ?? [];
  const founderNames = founderIds
    .map((id) => corpus.personById.get(id)?.name)
    .filter((n): n is string => Boolean(n));

  // People: canonical Person records that reference this company, either as a
  // listed founder or through a dated tenure. Identity and role only.
  const peopleById = new Map<string, PersonReadView>();
  for (const p of corpus.people) {
    const tenures = p.companyTenures.filter((t) => t.companyId === companyId);
    if (!founderIds.includes(p.id) && tenures.length === 0) continue;
    peopleById.set(p.id, {
      personId: p.id,
      name: p.name,
      currentRole: p.currentRole ?? null,
      isFounder: founderIds.includes(p.id) || tenures.some((t) => t.isFounder),
      companyRoles: tenures.map((t) => ({
        role: t.role,
        startDate: t.startDate ?? null,
        endDate: t.endDate ?? null,
      })),
      priorCompanies: p.priorCompanies ?? [],
    });
  }
  const people = [...peopleById.values()].sort(
    (a, b) => Number(b.isFounder) - Number(a.isFounder) || a.name.localeCompare(b.name),
  );

  const displayStateReason =
    computed.fit.displayState === "SCREENED"
      ? "Overall evidence coverage and dimensional breadth meet the Screening display sufficiency rule."
      : "Below 0.30 overall evidence coverage, or fewer than 2 of 7 dimensions at 0.40 coverage.";

  return {
    analyticalMode: "screening",
    identity: toIdentity(company),
    founderIds,
    founderNames,
    people,
    screeningThesisFit: computed.fit.score,
    overallEvidenceCoverage: computed.fit.coverage,
    overallEvidenceConfidence: computed.fit.confidence,
    displayState: computed.fit.displayState,
    displayStateReason,
    evidenceBar: evidenceBarMechanics(computed),
    mandateStatus: "NOT_ASSESSED",
    mandateNote: MANDATE_NOTE,
    screeningEvidenceEligibility: null,
    screeningEvidenceEligibilityNote: EVIDENCE_ELIGIBILITY_NOTE,
    dimensions,
    criteria,
    evidenceGaps: gaps,
    citedClaims,
    citedSources,
    signalEvents: toSignalEventViews(corpus.eventsByCompany.get(companyId) ?? []),
  };
}

/**
 * Lightweight company directory for navigation and search (name / aliases /
 * description / sector). No scoring is computed. Ordered by name.
 */
export function getCompanyDirectory(): Array<{
  companyId: string;
  name: string;
  aliases: string[];
  description: string | null;
  sector: string | null;
}> {
  const corpus = loadCorpus();
  const assessments = loadAssessments();
  return Object.keys(assessments.companies)
    .map((id) => {
      const c = corpus.companyById.get(id)!;
      return {
        companyId: c.id,
        name: c.name,
        aliases: c.aliases ?? [],
        description: c.description ?? null,
        sector: c.sector ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getScreeningReadModelMeta(): ScreeningReadModelMeta {
  const corpus = loadCorpus();
  const assessments = loadAssessments();
  return {
    analyticalMode: "screening",
    asOf: SCREENING_READ_AS_OF,
    assessmentDatasetVersion: assessments.datasetVersion,
    corpusGeneratedAt: corpus.generatedAt,
    persistedScoreSnapshots: 0,
    companies: assessments.counts.companies,
    criterionAssessments: assessments.counts.criterionAssessments,
  };
}
