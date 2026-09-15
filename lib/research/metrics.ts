import type { Company } from "@/lib/schemas/company";
import type { EvidenceClaim } from "@/lib/schemas/evidence-claim";
import type { SignalEvent } from "@/lib/schemas/signal-event";
import type { SourceRecord, SourceType } from "@/lib/schemas/source-record";
import { isBacktestAdmissible } from "@/lib/backtest/cutoff";
import {
  buildIndependenceContext,
  countIndependentSources,
  originOf,
  type IndependenceContext,
} from "./independence";
import type { SourcesConfig } from "@/lib/config/schemas";

/**
 * Corpus quality metrics.
 *
 * These are RESEARCH QA metrics. They describe how well evidenced the corpus
 * is, not how attractive any company is. Nothing here is an investment
 * performance number and nothing here should ever be presented as one.
 *
 * They exist because the failure mode of a research corpus is uniform
 * plausibility: every record looks fine individually while the set as a whole
 * rests on one press release per company. Aggregate counts are what make that
 * visible.
 */

export interface CorpusMetrics {
  counts: {
    companies: number;
    people: number;
    sources: number;
    evidenceClaims: number;
    signalEvents: number;
    snapshots: number;
    reviewQueue: number;
  };
  evidenceCoverage: {
    /**
     * Companies with at least one first-party or direct source.
     *
     * A different question from independence. A company page establishes what
     * the company says, which is usually where research starts, and it never
     * independently confirms its own claim. Conflating the two made this
     * metric read 3 of 19 on a corpus where every company had a primary
     * source, which understated coverage and overstated nothing.
     */
    companiesWithPrimarySource: number;
    /**
     * Companies with two or more genuinely independent corroborating-capable
     * sources anywhere in their evidence.
     *
     * A company-level COVERAGE statistic only. It counts distinct source
     * origins, not claims, and says nothing about whether any single claim has
     * two independent origins. A company can score here because one financing
     * fact is reported by two outlets while every metric it reports is still
     * management-originated. Claim-level independent-origin support is a
     * separate question and is not derived from this number.
     */
    companiesWithTwoIndependentSources: number;
    /** Companies with no evidence at all. A gap, reported rather than hidden. */
    companiesWithNoEvidence: number;
    medianClaimsPerCompany: number;
    medianIndependentSourcesPerCompany: number;
  };
  /**
   * Claim-level support, computed with the conservative logic audited across
   * the Phase 3D Stage 2 correction and the Stage 4 claim-origin audit. These
   * are RESEARCH QA counts, never investment confidence, and their names are
   * chosen so they cannot be mistaken for one. Nothing here is "validated",
   * "verified", or "investment-grade".
   *
   * INDEPENDENT ORIGIN, strict definition. A claim has independent-origin
   * support only when its PRIMARY citation is independent journalism or a
   * regulatory record (not a press-release reproduction), AND its
   * sourceSubtype is reported_fact. That is the case where an outside party's
   * own reporting is the origin of a fact of record: a deal-structure detail
   * a journalist uncovered, a negotiation a journalist established, a
   * historical fact a journalist reported. It deliberately excludes:
   *   - company_reported metrics, however many outlets repeat them
   *   - third_party_estimate figures (the estimator's own number, still an estimate)
   *   - derived values (computed inside this project)
   *   - company-announced round headlines where an official-company source is
   *     the primary citation even if journalism repeats the amount
   *   - customer or vendor case studies (operating support, not journalism)
   */
  claimSupport: {
    /** Companies with >=1 independent-journalism source anywhere in their evidence or citations. */
    companiesWithIndependentJournalismSource: number;
    /** Companies with >=2 distinct independent-journalism sources. */
    companiesWithTwoIndependentJournalismSources: number;
    /** Claims meeting the strict independent-origin definition above. */
    claimsWithIndependentOriginSupport: number;
    /** Of those, claims with >=2 distinct independent-journalism/regulatory origins across all citations. */
    claimsWithTwoIndependentOriginSources: number;
    /** Claims whose fact is a third-party estimate carried by an external publication or data vendor. Still an estimate. */
    claimsWithThirdPartyEstimateSupport: number;
    /** company_reported claims that carry an independent publication as a citation but whose metric is still management-originated. */
    companyReportedClaimsWithExternalPublicationSupport: number;
  };
  claims: {
    byProvenance: Record<string, number>;
    byModelEligibility: Record<string, number>;
    byConfidence: Record<string, number>;
    withUrl: number;
    withMetricAsOfDate: number;
    /** Claims whose last verification is older than the configured threshold. */
    stale: number;
    staleThresholdDays: number | null;
  };
  events: {
    bySignalType: Record<string, number>;
    bySourceType: Record<string, number>;
    byDirection: Record<string, number>;
    withEstablishedAvailability: number;
    byAvailabilityMethod: Record<string, number>;
  };
  /**
   * How much of the corpus a historical test can use.
   *
   * Phase 2.1 established that the current screening population and the
   * historically admissible population are different sets. This measures the
   * gap, per source type, so we learn which sources are usable for a backtest
   * BEFORE building the Backtest Lab rather than after.
   *
   * A low rate is a property of the sources, not a model failure.
   */
  backtestAdmissibility: {
    historicallyAdmissibleEvents: number;
    totalEvents: number;
    historicalAdmissibilityRate: number;
    bySourceType: Record<string, { admissible: number; total: number; rate: number }>;
  };
  resolution: {
    resolvedEvents: number;
    unresolvedEvents: number;
    byMatchMethod: Record<string, number>;
  };
}

function tally<T extends string>(values: readonly T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  // Sorted so the JSON output is deterministic.
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return Math.round((((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2) * 100) / 100;
}

function rate(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 1000) / 1000;
}

function daysBetween(laterIso: string, earlierIso: string): number {
  const later = Date.parse(laterIso);
  const earlier = Date.parse(earlierIso);
  if (!Number.isFinite(later) || !Number.isFinite(earlier)) return 0;
  return Math.floor((later - earlier) / 86_400_000);
}

export interface MetricsInput {
  companies: readonly Company[];
  peopleCount: number;
  sources: readonly SourceRecord[];
  claims: readonly EvidenceClaim[];
  events: readonly SignalEvent[];
  snapshotCount: number;
  reviewQueueCount: number;
  sourcesConfig: SourcesConfig;
  /** As-of date for staleness, so the metric is reproducible. */
  asOf: string;
  staleThresholdDays?: number | null;
}

export function computeCorpusMetrics(input: MetricsInput): CorpusMetrics {
  const context: IndependenceContext = buildIndependenceContext(
    input.sources,
    input.sourcesConfig,
  );
  const sourceById = new Map(input.sources.map((s) => [s.id, s]));

  const claimsByCompany = new Map<string, EvidenceClaim[]>();
  for (const claim of input.claims) {
    const list = claimsByCompany.get(claim.companyId) ?? [];
    list.push(claim);
    claimsByCompany.set(claim.companyId, list);
  }

  /** Source classes that are first party or direct rather than independent. */
  const PRIMARY_SOURCE_TYPES: readonly string[] = [
    "official_company",
    "founder_or_executive",
    "regulatory",
  ];

  /** Every source a claim rests on: the primary citation plus its supports. */
  const claimSourceIds = (claim: EvidenceClaim): string[] =>
    [claim.sourceId, ...claim.supportingSourceIds].filter(
      (id): id is string => id !== null,
    );

  let companiesWithPrimarySource = 0;
  let companiesWithTwoIndependentSources = 0;
  let companiesWithNoEvidence = 0;
  const claimCounts: number[] = [];
  const independentCounts: number[] = [];

  for (const company of input.companies) {
    const claims = claimsByCompany.get(company.id) ?? [];
    claimCounts.push(claims.length);
    if (claims.length === 0) {
      companiesWithNoEvidence += 1;
      independentCounts.push(0);
      continue;
    }
    // Independence reads the supporting citations too. Real research routinely
    // establishes one claim from several places, and counting only the primary
    // citation would understate corroboration.
    const summary = countIndependentSources(claims.flatMap(claimSourceIds), context);
    independentCounts.push(summary.independentSourceCount);
    if (summary.independentSourceCount >= 2) companiesWithTwoIndependentSources += 1;

    const hasPrimary = claims
      .flatMap(claimSourceIds)
      .some((id) => {
        const source = sourceById.get(id);
        return source !== undefined && PRIMARY_SOURCE_TYPES.includes(source.sourceType);
      });
    if (hasPrimary) companiesWithPrimarySource += 1;
  }

  /* ---------------------------------------------------------------------- */
  /* Claim-level support (Phase 3D)                                          */
  /* ---------------------------------------------------------------------- */

  const INDEPENDENT_ORIGIN_TYPES: readonly string[] = ["independent_journalism", "regulatory"];

  /** A citation that is a defensible independent origin, regardless of the claim. */
  const isIndependentCitation = (id: string | null): boolean => {
    if (id === null) return false;
    const s = sourceById.get(id);
    return (
      s !== undefined &&
      INDEPENDENT_ORIGIN_TYPES.includes(s.sourceType) &&
      s.isPressReleaseReproduction === false
    );
  };

  /** Distinct origins among a claim's independent citations. */
  const independentOrigins = (claim: EvidenceClaim): Set<string> => {
    const origins = new Set<string>();
    for (const id of claimSourceIds(claim)) {
      if (isIndependentCitation(id)) origins.add(originOf(id, context));
    }
    return origins;
  };

  let claimsWithIndependentOriginSupport = 0;
  let claimsWithTwoIndependentOriginSources = 0;
  let claimsWithThirdPartyEstimateSupport = 0;
  let companyReportedClaimsWithExternalPublicationSupport = 0;

  for (const claim of input.claims) {
    const hasExternalPublication = claimSourceIds(claim).some(isIndependentCitation);
    if (claim.sourceSubtype === "company_reported") {
      // The metric itself is management-originated even if a journalist repeats it.
      if (hasExternalPublication) companyReportedClaimsWithExternalPublicationSupport += 1;
      continue;
    }
    if (claim.sourceSubtype === "third_party_estimate") {
      if (hasExternalPublication) claimsWithThirdPartyEstimateSupport += 1;
      continue;
    }
    // Strict independent origin: reported_fact whose PRIMARY citation is an
    // independent outlet. A company-announced round headline cited primarily
    // to the company's own page does not qualify even when journalism repeats
    // the amount.
    if (claim.sourceSubtype !== "reported_fact" || !isIndependentCitation(claim.sourceId)) continue;
    claimsWithIndependentOriginSupport += 1;
    if (independentOrigins(claim).size >= 2) claimsWithTwoIndependentOriginSources += 1;
  }

  const journalismByCompany = new Map<string, Set<string>>();
  const addJournalism = (companyId: string, id: string): void => {
    const s = sourceById.get(id);
    if (!s || s.sourceType !== "independent_journalism" || s.isPressReleaseReproduction) return;
    const set = journalismByCompany.get(companyId) ?? new Set<string>();
    set.add(originOf(id, context));
    journalismByCompany.set(companyId, set);
  };
  for (const claim of input.claims) {
    for (const id of claimSourceIds(claim)) addJournalism(claim.companyId, id);
  }
  for (const company of input.companies) {
    for (const id of company.sourceIds) addJournalism(company.id, id);
  }
  let companiesWithIndependentJournalismSource = 0;
  let companiesWithTwoIndependentJournalismSources = 0;
  for (const company of input.companies) {
    const n = journalismByCompany.get(company.id)?.size ?? 0;
    if (n >= 1) companiesWithIndependentJournalismSource += 1;
    if (n >= 2) companiesWithTwoIndependentJournalismSources += 1;
  }

  const staleThresholdDays = input.staleThresholdDays ?? null;
  const stale =
    staleThresholdDays === null
      ? 0
      : input.claims.filter((claim) => {
          if (!claim.lastVerified) return true;
          return daysBetween(input.asOf, claim.lastVerified) > staleThresholdDays;
        }).length;

  const eventSourceTypes = input.events.map(
    (event) => (sourceById.get(event.sourceId)?.sourceType ?? "unknown") as SourceType | "unknown",
  );

  const admissibleBySourceType: Record<string, { admissible: number; total: number; rate: number }> = {};
  input.events.forEach((event, index) => {
    const sourceType = eventSourceTypes[index] ?? "unknown";
    const bucket = admissibleBySourceType[sourceType] ?? { admissible: 0, total: 0, rate: 0 };
    bucket.total += 1;
    if (isBacktestAdmissible(event)) bucket.admissible += 1;
    admissibleBySourceType[sourceType] = bucket;
  });
  for (const bucket of Object.values(admissibleBySourceType)) {
    bucket.rate = rate(bucket.admissible, bucket.total);
  }

  const admissibleEvents = input.events.filter(isBacktestAdmissible).length;

  return {
    counts: {
      companies: input.companies.length,
      people: input.peopleCount,
      sources: input.sources.length,
      evidenceClaims: input.claims.length,
      signalEvents: input.events.length,
      snapshots: input.snapshotCount,
      reviewQueue: input.reviewQueueCount,
    },
    evidenceCoverage: {
      companiesWithPrimarySource,
      companiesWithTwoIndependentSources,
      companiesWithNoEvidence,
      medianClaimsPerCompany: median(claimCounts),
      medianIndependentSourcesPerCompany: median(independentCounts),
    },
    claimSupport: {
      companiesWithIndependentJournalismSource,
      companiesWithTwoIndependentJournalismSources,
      claimsWithIndependentOriginSupport,
      claimsWithTwoIndependentOriginSources,
      claimsWithThirdPartyEstimateSupport,
      companyReportedClaimsWithExternalPublicationSupport,
    },
    claims: {
      byProvenance: tally(input.claims.map((c) => c.provenance)),
      byModelEligibility: tally(input.claims.map((c) => c.modelEligibility)),
      byConfidence: tally(input.claims.map((c) => c.confidence)),
      withUrl: input.claims.filter((c) => c.sourceUrl !== null).length,
      withMetricAsOfDate: input.claims.filter((c) => c.metricAsOfDate !== null).length,
      stale,
      staleThresholdDays,
    },
    events: {
      bySignalType: tally(input.events.map((e) => e.signalType)),
      bySourceType: tally(eventSourceTypes),
      byDirection: tally(input.events.map((e) => e.signalDirection)),
      withEstablishedAvailability: input.events.filter((e) => e.availabilityDate !== null).length,
      byAvailabilityMethod: tally(input.events.map((e) => e.availabilityEvidence.method)),
    },
    backtestAdmissibility: {
      historicallyAdmissibleEvents: admissibleEvents,
      totalEvents: input.events.length,
      historicalAdmissibilityRate: rate(admissibleEvents, input.events.length),
      bySourceType: Object.fromEntries(
        Object.entries(admissibleBySourceType).sort(([a], [b]) => a.localeCompare(b)),
      ),
    },
    resolution: {
      resolvedEvents: input.events.filter((e) => e.companyId !== null).length,
      unresolvedEvents: input.events.filter((e) => e.companyId === null).length,
      byMatchMethod: tally(input.events.map((e) => e.entityMatchMethod)),
    },
  };
}
