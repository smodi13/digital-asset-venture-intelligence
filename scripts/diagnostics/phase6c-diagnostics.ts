/**
 * DESCRIPTIVE_DIAGNOSTIC_ONLY
 *
 * Phase 6C real-corpus descriptive diagnostics.
 *
 * This runner applies the EXISTING, UNCHANGED analytical engines
 * (lib/scoring/*) to the real 39-company corpus and the three locked Phase 5C
 * human judgment packets, purely to inspect distributions and detect
 * structural / double-counting defects before any frontend or Priority layer.
 *
 *   - It is NOT calibration, validation, a final test, ranking, or Priority.
 *   - It persists NO ScoreSnapshot and creates NO production scoring state.
 *   - It MUST NOT be imported by production app code. It lives under scripts/
 *     and reads only committed corpus JSON in data/generated + local packets.
 *   - Company ordering is canonical (company id ascending), never by score.
 *
 * The 39 companies are treated as CONSUMED for any new threshold calibration,
 * weighting, half-life, Priority rule, or Fit cutoff. Nothing here justifies
 * any of those.
 *
 * Run with:  npx tsx scripts/diagnostics/phase6c-diagnostics.ts
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  scoreScreeningCriterion,
  scoreScreeningDimension,
  scoreScreeningThesisFit,
  SCREENING_CRITERIA_WEIGHTS,
} from "@/lib/scoring/screening";
import {
  adaptCriterionEvidence,
  type AdapterClaim,
} from "@/lib/scoring/evidence-adapter";
import { evaluateScreeningEvidenceEligibility } from "@/lib/scoring/screening-eligibility";
import { scoreMomentum, type MomentumEvent } from "@/lib/scoring/momentum";
import {
  scoreConvergence,
  familyStrengthsFromPropositions,
  type AtomicProposition,
} from "@/lib/scoring/convergence";
import { thesisDimensionSchema, type ThesisDimension } from "@/lib/schemas/thesis-configuration";
import type { CriterionResult } from "@/lib/scoring/criterion";
import type { DimensionResult } from "@/lib/scoring/dimension";
import type { EvidenceClaim } from "@/lib/schemas/evidence-claim";
import type { SourceRecord } from "@/lib/schemas/source-record";
import type { SignalEvent } from "@/lib/schemas/signal-event";

export const DIAGNOSTIC_BANNER = "DESCRIPTIVE_DIAGNOSTIC_ONLY" as const;

/** Single scoring as-of date for the whole phase. */
export const AS_OF = "2026-09-08";

const ROOT = process.cwd();
const GENERATED = join(ROOT, "data", "generated");

const PACKET_FILES = [
  { cohort: "calibration", file: "originationiq_phase5c_c_screening_calibration_v2.json" },
  { cohort: "validation", file: "originationiq_phase5c_f_validation_screening_judgments.json" },
  { cohort: "final_test", file: "originationiq_phase5c_g_final_test_screening_judgments.json" },
] as const;

const DIMENSION_ORDER = thesisDimensionSchema.options as readonly ThesisDimension[];

/* -------------------------------------------------------------------------- */
/* Corpus + packet loading                                                    */
/* -------------------------------------------------------------------------- */

function loadRecords<T>(name: string): T[] {
  return JSON.parse(readFileSync(join(GENERATED, name), "utf8")).records as T[];
}

interface PacketCriterion {
  rawAnchor: number | null;
  coverage: number;
  claimIds: string[];
  reviewedButExcludedClaimIds: string[];
  rationale: string;
}
interface PacketCompany {
  cohort: string;
  domain: string;
  name: string;
  criteria: Record<string, PacketCriterion>;
}

function loadPackets(): PacketCompany[] {
  const out: PacketCompany[] = [];
  for (const { cohort, file } of PACKET_FILES) {
    const path = join(ROOT, file);
    if (!existsSync(path)) {
      throw new Error(`missing local judgment packet: ${file} (Phase 5C audit artifact, git-ignored)`);
    }
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      companies: Record<string, { name: string; criteria: Record<string, PacketCriterion> }>;
    };
    for (const [domain, co] of Object.entries(parsed.companies)) {
      out.push({ cohort, domain, name: co.name, criteria: co.criteria });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Reconciliation                                                             */
/* -------------------------------------------------------------------------- */

export interface Reconciliation {
  companies: number;
  criterionJudgments: number;
  criteriaPerCompany: number[];
  byCohort: Record<string, { companies: number; judgments: number }>;
  coverageValues: number[];
  anchorValues: (number | null)[];
  unresolvedClaimIds: string[];
  ok: boolean;
}

function reconcile(packets: PacketCompany[], claimIds: ReadonlySet<string>): Reconciliation {
  const byCohort: Record<string, { companies: number; judgments: number }> = {};
  const criteriaPerCompany: number[] = [];
  const coverageValues = new Set<number>();
  const anchorValues = new Set<number | null>();
  const unresolvedClaimIds = new Set<string>();
  let criterionJudgments = 0;

  for (const p of packets) {
    const cohort = (byCohort[p.cohort] ??= { companies: 0, judgments: 0 });
    cohort.companies += 1;
    const n = Object.keys(p.criteria).length;
    criteriaPerCompany.push(n);
    for (const j of Object.values(p.criteria)) {
      criterionJudgments += 1;
      cohort.judgments += 1;
      coverageValues.add(j.coverage);
      anchorValues.add(j.rawAnchor);
      for (const id of [...(j.claimIds ?? []), ...(j.reviewedButExcludedClaimIds ?? [])]) {
        if (!claimIds.has(id)) unresolvedClaimIds.add(id);
      }
    }
  }

  const companies = new Set(packets.map((p) => p.domain)).size;
  const ok =
    companies === 39 &&
    criterionJudgments === 546 &&
    criteriaPerCompany.every((n) => n === 14) &&
    unresolvedClaimIds.size === 0;

  return {
    companies,
    criterionJudgments,
    criteriaPerCompany: [...new Set(criteriaPerCompany)],
    byCohort,
    coverageValues: [...coverageValues].sort((a, b) => a - b),
    anchorValues: [...anchorValues].sort((a, b) => (a ?? -1) - (b ?? -1)),
    unresolvedClaimIds: [...unresolvedClaimIds],
    ok,
  };
}

/* -------------------------------------------------------------------------- */
/* Screening Thesis Fit                                                       */
/* -------------------------------------------------------------------------- */

const CRITERION_TO_DIMENSION: Record<string, ThesisDimension> = Object.fromEntries(
  Object.entries(SCREENING_CRITERIA_WEIGHTS).flatMap(([dim, weights]) =>
    Object.keys(weights).map((crit) => [crit, dim as ThesisDimension]),
  ),
);

export interface CompanyScreening {
  companyId: string;
  companyName: string;
  domain: string;
  cohort: string;
  analyticalMode: "screening";
  screeningThesisFit: number;
  overallEvidenceCoverage: number;
  overallEvidenceConfidence: number;
  displayState: string;
  screeningEvidenceEligible: boolean;
  failedGates: string[];
  dimensions: Array<{
    dimension: ThesisDimension;
    score: number;
    coverage: number;
    confidence: number;
    displayState: string;
  }>;
  evidence: { sources: number; evidenceClaims: number; signalEvents: number; citedClaims: number };
}

function runScreening(
  packets: PacketCompany[],
  companyByDomain: Map<string, { id: string; name: string }>,
  claimById: Map<string, EvidenceClaim>,
  sources: SourceRecord[],
  claimsPerCompany: Map<string, number>,
  sourcesPerCompany: Map<string, number>,
  eventsPerCompany: Map<string, number>,
): CompanyScreening[] {
  const results: CompanyScreening[] = [];

  for (const p of packets) {
    const corpusCo = companyByDomain.get(p.domain);
    if (!corpusCo) throw new Error(`packet company ${p.domain} not in corpus`);

    const critResults: CriterionResult[] = [];
    let citedClaims = 0;

    for (const [criterionId, j] of Object.entries(p.criteria)) {
      const claims: AdapterClaim[] = (j.claimIds ?? []).map((id) => {
        const c = claimById.get(id);
        if (!c) throw new Error(`claim ${id} not found`);
        return c as AdapterClaim;
      });
      citedClaims += claims.length;

      const adapted = adaptCriterionEvidence({
        criterionId,
        claims,
        sources,
        asOfDate: AS_OF,
      });

      const result = scoreScreeningCriterion(
        {
          criterionId,
          rawAnchor: j.rawAnchor as 0 | 25 | 50 | 75 | 100 | null,
          rubricAnchorUsed: j.rawAnchor !== null,
          supportingClaimIds: j.claimIds ?? [],
          opposingClaimIds: [],
          unknowns: [],
          coverage: j.coverage as 0 | 0.5 | 1,
          analystRationale: j.rationale,
        },
        adapted.resolutionInput,
      );
      critResults.push(result);
    }

    const dimResults: DimensionResult[] = DIMENSION_ORDER.map((dim) => {
      const forDim = critResults.filter((c) => CRITERION_TO_DIMENSION[c.criterionId] === dim);
      return scoreScreeningDimension(dim, forDim);
    });

    const fit = scoreScreeningThesisFit(dimResults);
    const dimensionCoverages = DIMENSION_ORDER.map(
      (dim) => dimResults.find((d) => d.dimension === dim)?.coverage ?? 0,
    );
    // Phase 6C DIAGNOSTIC ASSUMPTION: mandate eligibility is NOT independently
    // evaluated here. We hard-code "ELIGIBLE" (matching the Phase 5C-D
    // assumption) so the evaluator exercises only the Screening
    // evidence-sufficiency mechanics. A `screeningEvidenceEligible: true`
    // result therefore means "passes evidence-sufficiency under
    // mandateEligibility=ELIGIBLE", NOT "is a mandate-qualified opportunity".
    const elig = evaluateScreeningEvidenceEligibility({
      mandateEligibility: "ELIGIBLE",
      overallEvidenceCoverage: fit.coverage,
      overallScoringConfidence: fit.confidence,
      dimensionCoverages,
    });

    results.push({
      companyId: corpusCo.id,
      companyName: corpusCo.name,
      domain: p.domain,
      cohort: p.cohort,
      analyticalMode: "screening",
      screeningThesisFit: fit.score,
      overallEvidenceCoverage: fit.coverage,
      overallEvidenceConfidence: fit.confidence,
      displayState: fit.displayState,
      screeningEvidenceEligible: elig.screeningEvidenceEligible,
      failedGates: elig.failedGates,
      dimensions: dimResults.map((d) => ({
        dimension: d.dimension,
        score: d.score,
        coverage: d.coverage,
        confidence: d.confidence,
        displayState: d.displayState,
      })),
      evidence: {
        sources: sourcesPerCompany.get(corpusCo.id) ?? 0,
        evidenceClaims: claimsPerCompany.get(corpusCo.id) ?? 0,
        signalEvents: eventsPerCompany.get(corpusCo.id) ?? 0,
        citedClaims,
      },
    });
  }

  results.sort((a, b) => a.companyId.localeCompare(b.companyId));
  return results;
}

/* -------------------------------------------------------------------------- */
/* Temporal Momentum + Signal Convergence (diagnostic event mapping)          */
/*                                                                            */
/* The canonical SignalEvent carries no momentum family / impact anchor /     */
/* convergence proposition. There is deliberately NO production adapter (the  */
/* real-corpus firewall forbids a scoring module importing research). The     */
/* mapping below is a DIAGNOSTIC ASSUMPTION, documented in the report, not a  */
/* calibrated methodology and not to be promoted to production without its    */
/* own review. The engines themselves (weights, anchors, half-lives, decay,   */
/* dedup, direction, activation threshold, breadth target) are consumed       */
/* completely unchanged.                                                      */
/* -------------------------------------------------------------------------- */

const MS_PER_DAY = 86_400_000;

const MOMENTUM_FAMILY_BY_TYPE: Record<string, MomentumEvent["family"]> = {
  customer_momentum: "customer_adoption",
  enterprise_expansion: "customer_adoption",
  product_launch: "product_technical",
  technical_adoption: "product_technical",
  pricing_change: "product_technical",
  partnership: "gtm_ecosystem",
  funding: "gtm_ecosystem",
  executive_hire: "gtm_ecosystem",
  regulatory_milestone: "gtm_ecosystem",
  security_incident: "risk_deterioration",
};

const CONVERGENCE_FAMILY_BY_TYPE: Record<string, AtomicProposition["primaryFamily"] | null> = {
  customer_momentum: "customer_adoption",
  enterprise_expansion: "customer_adoption",
  product_launch: "product_usage",
  technical_adoption: "product_usage",
  pricing_change: "unit_economics",
  partnership: "gtm_distribution",
  security_incident: "risk_deterioration",
  // funding / executive_hire / regulatory_milestone: no distinct convergence
  // proposition family (funding is a forbidden automatic-positive signal).
  funding: null,
  executive_hire: null,
  regulatory_milestone: null,
};

function directionOf(e: SignalEvent): -1 | 0 | 1 {
  if (e.signalDirection === "positive") return 1;
  if (e.signalDirection === "negative") return -1;
  return 0;
}

function impactOf(rawStrength: number): MomentumEvent["impact"] {
  if (rawStrength < 0.4) return "minor";
  if (rawStrength < 0.6) return "meaningful";
  if (rawStrength < 0.8) return "major";
  return "exceptional";
}

function evidenceConfidenceOf(level: string): number {
  return { high: 0.9, medium_high: 0.8, medium: 0.7, low: 0.5, unknown: 0.5 }[level] ?? 0.5;
}

function ageDaysOf(e: SignalEvent): number {
  const obs = e.eventDate ?? e.availabilityDate ?? e.publicationDate;
  if (!obs) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.parse(AS_OF) - Date.parse(obs)) / MS_PER_DAY);
}

export interface CompanyTemporal {
  companyId: string;
  companyName: string;
  domain: string;
  totalEvents: number;
  scoredEvents: number;
  excludedUnconfirmed: number;
  excludedNeutralDirection: number;
  dedupedEventCount: number;
  momentum: ReturnType<typeof scoreMomentum>;
  contributingMomentumEvents: number;
  convergence: ReturnType<typeof scoreConvergence>;
  convergencePropositions: number;
  ageBuckets: Record<string, number>;
}

function runTemporal(
  eventsByCompany: Map<string, SignalEvent[]>,
  companyById: Map<string, { name: string; domain: string }>,
): CompanyTemporal[] {
  const out: CompanyTemporal[] = [];

  for (const [companyId, events] of eventsByCompany) {
    const meta = companyById.get(companyId);
    if (!meta) continue;

    let excludedUnconfirmed = 0;
    let excludedNeutralDirection = 0;
    const momentumEvents: MomentumEvent[] = [];
    const propositions: AtomicProposition[] = [];
    const ageBuckets: Record<string, number> = {
      "0-30": 0,
      "31-90": 0,
      "91-180": 0,
      "181-365": 0,
      "365+": 0,
    };

    for (const e of events) {
      if (e.eventStatus === "reported_unconfirmed") {
        excludedUnconfirmed += 1;
        continue;
      }
      const direction = directionOf(e);
      const family = MOMENTUM_FAMILY_BY_TYPE[e.signalType];
      const age = ageDaysOf(e);
      const conf = evidenceConfidenceOf(e.claimConfidence);
      const eventKey = `${companyId}|${e.signalType}|${e.eventDate ?? "?"}`;

      if (direction === 0) excludedNeutralDirection += 1;

      if (family) {
        momentumEvents.push({
          eventKey,
          family,
          direction,
          impact: impactOf(e.rawStrength),
          evidenceConfidence: conf,
          ageDays: Number.isFinite(age) ? age : 3650,
        });
        const contribution = Math.abs(direction) * conf;
        if (contribution > 0) {
          const bucket =
            age <= 30 ? "0-30" : age <= 90 ? "31-90" : age <= 180 ? "91-180" : age <= 365 ? "181-365" : "365+";
          ageBuckets[bucket] = (ageBuckets[bucket] ?? 0) + contribution;
        }
      }

      const convFamily = CONVERGENCE_FAMILY_BY_TYPE[e.signalType];
      if (convFamily && direction !== 0) {
        propositions.push({
          propositionKey: `${companyId}|${e.signalType}|${e.eventDate ?? "?"}`,
          originKey: e.sourceId,
          primaryFamily: convFamily,
          value: direction * e.rawStrength,
        });
      }
    }

    const dedupedKeys = new Set(momentumEvents.map((m) => m.eventKey));
    const momentum = scoreMomentum(momentumEvents);
    const convergence = scoreConvergence(familyStrengthsFromPropositions(propositions));

    out.push({
      companyId,
      companyName: meta.name,
      domain: meta.domain,
      totalEvents: events.length,
      scoredEvents: momentumEvents.length,
      excludedUnconfirmed,
      excludedNeutralDirection,
      dedupedEventCount: dedupedKeys.size,
      momentum,
      contributingMomentumEvents: momentumEvents.filter((m) => m.direction !== 0).length,
      convergence,
      convergencePropositions: propositions.length,
      ageBuckets,
    });
  }

  out.sort((a, b) => a.companyId.localeCompare(b.companyId));
  return out;
}

/* -------------------------------------------------------------------------- */
/* Descriptive statistics helpers                                             */
/* -------------------------------------------------------------------------- */

export function quantiles(values: number[]): {
  n: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  mean: number;
} {
  if (values.length === 0) {
    return { n: 0, min: NaN, p25: NaN, median: NaN, p75: NaN, max: NaN, mean: NaN };
  }
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => {
    const idx = (s.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return s[lo]! + (s[hi]! - s[lo]!) * (idx - lo);
  };
  return {
    n: s.length,
    min: s[0]!,
    p25: q(0.25),
    median: q(0.5),
    p75: q(0.75),
    max: s[s.length - 1]!,
    mean: s.reduce((a, b) => a + b, 0) / s.length,
  };
}

/** Pearson correlation. Returns NaN when either series has zero variance. */
export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n === 0 || n !== ys.length) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return NaN;
  return sxy / Math.sqrt(sxx * syy);
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

export interface DiagnosticOutput {
  banner: typeof DIAGNOSTIC_BANNER;
  methodologicalCaveat: string;
  asOf: string;
  generatedAt: string;
  corpusCounts: Record<string, number>;
  reconciliation: Reconciliation;
  screening: CompanyScreening[];
  temporal: CompanyTemporal[];
  distributions: Record<string, unknown>;
}

export function buildDiagnostics(): DiagnosticOutput {
  const companies = loadRecords<{ id: string; name: string; domain: string }>("companies.json");
  const evidence = loadRecords<EvidenceClaim>("evidence.json");
  const sources = loadRecords<SourceRecord>("sources.json");
  const events = loadRecords<SignalEvent>("signal-events.json");
  const people = loadRecords<unknown>("people.json");
  const snapshots = loadRecords<unknown>("snapshots.json");

  const companyByDomain = new Map(companies.map((c) => [c.domain, { id: c.id, name: c.name }]));
  const companyById = new Map(companies.map((c) => [c.id, { name: c.name, domain: c.domain }]));
  const claimById = new Map(evidence.map((c) => [c.id, c]));

  const claimsPerCompany = new Map<string, number>();
  for (const c of evidence) claimsPerCompany.set(c.companyId, (claimsPerCompany.get(c.companyId) ?? 0) + 1);
  const eventsPerCompany = new Map<string, number>();
  const eventsByCompany = new Map<string, SignalEvent[]>();
  for (const e of events) {
    if (!e.companyId) continue;
    eventsPerCompany.set(e.companyId, (eventsPerCompany.get(e.companyId) ?? 0) + 1);
    const list = eventsByCompany.get(e.companyId) ?? [];
    list.push(e);
    eventsByCompany.set(e.companyId, list);
  }
  const sourcesPerCompany = new Map<string, number>();
  {
    const seen = new Map<string, Set<string>>();
    for (const c of evidence) {
      const set = seen.get(c.companyId) ?? new Set<string>();
      if (c.sourceId) set.add(c.sourceId);
      for (const s of c.supportingSourceIds ?? []) set.add(s);
      seen.set(c.companyId, set);
    }
    for (const [k, v] of seen) sourcesPerCompany.set(k, v.size);
  }

  const packets = loadPackets();
  const reconciliation = reconcile(packets, new Set(claimById.keys()));
  if (!reconciliation.ok) {
    throw new Error(
      `judgment packet reconciliation FAILED: ${JSON.stringify(reconciliation, null, 2)}\n` +
        `Phase 6C requires exactly 39 companies, 546 criterion judgments, 14 per company, all claim ids resolvable. STOP.`,
    );
  }

  const screening = runScreening(
    packets,
    companyByDomain,
    claimById,
    sources,
    claimsPerCompany,
    sourcesPerCompany,
    eventsPerCompany,
  );
  const temporal = runTemporal(eventsByCompany, companyById);

  /* ---- distributions ---- */
  const screened = screening.filter((s) => s.displayState === "SCREENED");
  const eligible = screening.filter((s) => s.screeningEvidenceEligible);
  const byDomain = new Map(screening.map((s) => [s.domain, s]));
  const temporalByDomain = new Map(temporal.map((t) => [t.domain, t]));

  const fitVals = screening.map((s) => s.screeningThesisFit);
  const covVals = screening.map((s) => s.overallEvidenceCoverage);
  const confVals = screening.map((s) => s.overallEvidenceConfidence);
  const posMom = temporal.map((t) => t.momentum.positiveMomentum);
  const negMom = temporal.map((t) => t.momentum.negativeMomentum);
  const netMom = temporal.map((t) => t.momentum.netMomentum);
  const posConv = temporal.map((t) => t.convergence.positiveConvergence);
  const negConv = temporal.map((t) => t.convergence.negativeConvergence);
  const netConv = temporal.map((t) => t.convergence.netConvergence);

  // aligned series for correlation (screening companies, canonical order)
  const alignedFit: number[] = [];
  const alignedNetMom: number[] = [];
  const alignedNetConv: number[] = [];
  const alignedCov: number[] = [];
  const alignedSources: number[] = [];
  const alignedClaims: number[] = [];
  const alignedEvents: number[] = [];
  for (const s of screening) {
    const t = temporalByDomain.get(s.domain);
    alignedFit.push(s.screeningThesisFit);
    alignedCov.push(s.overallEvidenceCoverage);
    alignedNetMom.push(t?.momentum.netMomentum ?? 0);
    alignedNetConv.push(t?.convergence.netConvergence ?? 0);
    alignedSources.push(s.evidence.sources);
    alignedClaims.push(s.evidence.evidenceClaims);
    alignedEvents.push(s.evidence.signalEvents);
  }

  const momFamilyTotals: Record<string, number> = {};
  for (const t of temporal) {
    for (const [fam, score] of Object.entries(t.momentum.familyScores)) {
      momFamilyTotals[fam] = (momFamilyTotals[fam] ?? 0) + score;
    }
  }

  const ageBucketTotals: Record<string, number> = { "0-30": 0, "31-90": 0, "91-180": 0, "181-365": 0, "365+": 0 };
  for (const t of temporal) {
    for (const [k, v] of Object.entries(t.ageBuckets)) ageBucketTotals[k] = (ageBucketTotals[k] ?? 0) + v;
  }
  const ageTotal = Object.values(ageBucketTotals).reduce((a, b) => a + b, 0) || 1;
  const ageBucketShare = Object.fromEntries(
    Object.entries(ageBucketTotals).map(([k, v]) => [k, v / ageTotal]),
  );

  const distributions = {
    diagnosticAssumptions: {
      mandateEligibility:
        "Phase 6C did NOT independently evaluate Mandate Eligibility. The runner supplies mandateEligibility='ELIGIBLE' for every company. 'evidenceEligible' / 'screeningEvidenceEligible' therefore mean ONLY 'passes the Screening evidence-sufficiency mechanics under the Phase 6C diagnostic assumption mandateEligibility=ELIGIBLE'. They are NOT a mandate-qualified or ranked opportunity set, and no company mandate status is inferred.",
      criticalDimensionGuard:
        "The calibrated Screening critical-dimension guard is ZERO-ONLY: a company fails it only when capital_efficiency coverage = 0 OR growth_momentum coverage = 0 (see the guard reason strings in `screening[].failedGates`). There is NO 0.30 critical-dimension coverage floor. The dimensionCoverage medians below are descriptive observations about corpus evidence thinness, not thresholds.",
      crossLayerDoubleCount:
        "Section 15 identifies real proposition overlap (growth / ARR / customer / usage) across Screening EvidenceClaims, Momentum, and Convergence. Because Priority is inactive, no Fit+Momentum+Convergence composite exists, and no production decision co-weights these layers, the system contains NO active mathematical double-counting defect. This is a LATENT cross-layer double-counting risk: overlap that would become double counting if the layers were co-weighted without de-duplication.",
    },
    counts: {
      all: screening.length,
      screened: screened.length,
      evidenceEligible: eligible.length,
    },
    screeningFit: {
      all: quantiles(fitVals),
      screened: quantiles(screened.map((s) => s.screeningThesisFit)),
      eligible: quantiles(eligible.map((s) => s.screeningThesisFit)),
    },
    evidenceCoverage: {
      all: quantiles(covVals),
      screened: quantiles(screened.map((s) => s.overallEvidenceCoverage)),
    },
    evidenceConfidence: {
      all: quantiles(confVals),
      screened: quantiles(screened.map((s) => s.overallEvidenceConfidence)),
    },
    dimensionCoverage: {
      note: "Descriptive medians/quantiles of dimension-level Evidence Coverage across all 39 companies. NOT guard thresholds. See distributions.diagnosticAssumptions.criticalDimensionGuard: the critical-dimension guard is zero-only.",
      byDimension: Object.fromEntries(
        DIMENSION_ORDER.map((dim) => [
          dim,
          quantiles(screening.map((s) => s.dimensions.find((d) => d.dimension === dim)!.coverage)),
        ]),
      ),
    },
    momentum: {
      positive: quantiles(posMom),
      negative: quantiles(negMom),
      net: quantiles(netMom),
      eligibleSubsetNet: quantiles(
        eligible.map((s) => temporalByDomain.get(s.domain)?.momentum.netMomentum ?? 0),
      ),
      familyScoreTotals: momFamilyTotals,
      companiesWithAnyPositive: temporal.filter((t) => t.momentum.positiveMomentum > 0).length,
      companiesWithAnyNegative: temporal.filter((t) => t.momentum.negativeMomentum > 0).length,
      companiesAllZero: temporal.filter((t) => t.momentum.netMomentum === 0).length,
    },
    convergence: {
      positive: quantiles(posConv),
      negative: quantiles(negConv),
      net: quantiles(netConv),
      companiesWithNonzero: temporal.filter((t) => t.convergence.netConvergence !== 0).length,
      activeFamilyCounts: temporal.map((t) => ({
        domain: t.domain,
        positive: t.convergence.positiveActiveFamilies.length,
        negative: t.convergence.negativeActiveFamilies.length,
      })),
    },
    correlations: {
      note:
        "Descriptive only on a consumed 39-company corpus. Correlation is not causation and MUST NOT justify any threshold, weight, half-life, Fit cutoff, or Priority rule.",
      fit_vs_coverage: pearson(alignedFit, alignedCov),
      fit_vs_sources: pearson(alignedFit, alignedSources),
      fit_vs_evidenceClaims: pearson(alignedFit, alignedClaims),
      coverage_vs_sources: pearson(alignedCov, alignedSources),
      coverage_vs_evidenceClaims: pearson(alignedCov, alignedClaims),
      confidence_vs_sources: pearson(confVals, alignedSources),
      netMomentum_vs_signalEvents: pearson(alignedNetMom, alignedEvents),
      netConvergence_vs_signalEvents: pearson(alignedNetConv, alignedEvents),
      netMomentum_vs_netConvergence: pearson(alignedNetMom, alignedNetConv),
      fit_vs_netMomentum: pearson(alignedFit, alignedNetMom),
      fit_vs_netConvergence: pearson(alignedFit, alignedNetConv),
    },
    halfLife: {
      note: "Contribution proxy = |direction| * evidenceConfidence bucketed by event age. Half-lives UNCHANGED.",
      contributionShareByAge: ageBucketShare,
      contributionTotalsByAge: ageBucketTotals,
    },
    coverageVsFit: {
      highFitLowCoverage: screening
        .filter((s) => s.screeningThesisFit >= 55 && s.overallEvidenceCoverage < 0.4)
        .map((s) => s.domain),
      lowFitHighCoverage: screening
        .filter((s) => s.screeningThesisFit < 50 && s.overallEvidenceCoverage >= 0.5)
        .map((s) => s.domain),
      highConfidenceLowCoverage: screening
        .filter((s) => s.overallEvidenceConfidence >= 0.7 && s.overallEvidenceCoverage < 0.35)
        .map((s) => s.domain),
      highCoverageLowConfidence: screening
        .filter((s) => s.overallEvidenceCoverage >= 0.5 && s.overallEvidenceConfidence < 0.65)
        .map((s) => s.domain),
    },
    evidenceDensity: {
      note: "Median split on source count. Consumed corpus; descriptive only.",
      sourceCountMedian: quantiles(alignedSources).median,
      byGroup: (() => {
        const med = quantiles(alignedSources).median;
        const hi = screening.filter((s) => s.evidence.sources > med);
        const lo = screening.filter((s) => s.evidence.sources <= med);
        const summarize = (g: CompanyScreening[]) => ({
          n: g.length,
          medianFit: quantiles(g.map((s) => s.screeningThesisFit)).median,
          medianCoverage: quantiles(g.map((s) => s.overallEvidenceCoverage)).median,
          medianConfidence: quantiles(g.map((s) => s.overallEvidenceConfidence)).median,
          eligibleShare: g.filter((s) => s.screeningEvidenceEligible).length / (g.length || 1),
          medianNetMomentum: quantiles(
            g.map((s) => temporalByDomain.get(s.domain)?.momentum.netMomentum ?? 0),
          ).median,
        });
        return { highSourceCount: summarize(hi), lowSourceCount: summarize(lo) };
      })(),
    },
    sparseCompanies: temporal
      .filter((t) => t.totalEvents <= 2 || (byDomain.get(t.domain)?.evidence.evidenceClaims ?? 99) < 10)
      .map((t) => ({
        domain: t.domain,
        signalEvents: t.totalEvents,
        evidenceClaims: byDomain.get(t.domain)?.evidence.evidenceClaims ?? null,
        netMomentum: t.momentum.netMomentum,
        netConvergence: t.convergence.netConvergence,
        singleFamilyMomentum:
          Object.values(t.momentum.familyScores).filter((v) => Math.abs(v) > 0).length <= 1,
      })),
    negativeSignals: temporal
      .filter((t) => t.momentum.negativeMomentum > 0 || t.convergence.negativeConvergence > 0)
      .map((t) => ({
        domain: t.domain,
        negativeMomentum: t.momentum.negativeMomentum,
        positiveMomentum: t.momentum.positiveMomentum,
        netMomentum: t.momentum.netMomentum,
        negativeConvergence: t.convergence.negativeConvergence,
        riskFamilyScore: t.momentum.familyScores.risk_deterioration,
      })),
  };

  return {
    banner: DIAGNOSTIC_BANNER,
    methodologicalCaveat:
      "Phase 6C is descriptive diagnostics only. The 39 companies are CONSUMED for calibration/validation/final-test. Nothing here justifies new thresholds, weights, half-lives, Priority rules, Fit cutoffs, Fit bands, or investment recommendations. No ScoreSnapshot is persisted. No production scoring behavior changed. Companies are listed in canonical (company id) order, never ranked. Mandate Eligibility was NOT evaluated; the runner assumes mandateEligibility=ELIGIBLE (see distributions.diagnosticAssumptions).",
    asOf: AS_OF,
    generatedAt: new Date().toISOString(),
    corpusCounts: {
      companies: companies.length,
      sources: sources.length,
      evidenceClaims: evidence.length,
      people: people.length,
      signalEvents: events.length,
      persistedSnapshots: snapshots.length,
    },
    reconciliation,
    screening,
    temporal,
    distributions,
  };
}

function main(): void {
  const out = buildDiagnostics();
  const target = join(ROOT, "docs", "phase6c-descriptive-diagnostics.data.json");
  writeFileSync(target, JSON.stringify(out, null, 2) + "\n", "utf8");
  // Console summary.
  console.log(DIAGNOSTIC_BANNER);
  console.log("as-of:", out.asOf);
  console.log("corpus:", JSON.stringify(out.corpusCounts));
  console.log("reconciliation ok:", out.reconciliation.ok, JSON.stringify(out.reconciliation.byCohort));
  console.log("screened:", out.distributions.counts, "\n");
  console.log("wrote", target);
}

if (process.argv[1] && process.argv[1].endsWith("phase6c-diagnostics.ts")) {
  main();
}
