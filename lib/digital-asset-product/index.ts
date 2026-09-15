/**
 * Digital-asset product read layer (Phase 4A, server-only).
 *
 * The one sanctioned way for the frontend to read the v7 product corpus.
 * Loads the committed, deterministically generated
 * data/v7-product/companies.v7.json (built by
 * scripts/product/build-corpus.ts from frozen research + judgment packets and
 * the unchanged lib/scoring/digital-asset engine) and exposes typed,
 * purpose-built views. No scoring, no file parsing, and no YAML reading
 * happens in a React component - it all happens here or in the build script.
 *
 * Cohort membership rides along on ProductCompany for methodology/audit
 * purposes only. Every function below that returns a UI-facing list orders
 * deterministically by name or id, never by cohort, and never implies a
 * ranking.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DIGITAL_ASSET_CATEGORIES } from "@/lib/schemas/v7/company";
import type {
  MarketMapCategoryGroup,
  MarketMapCompanyRow,
  MarketMapData,
  ProductCompany,
  ProductCorpusDocument,
  ProductDirectoryEntry,
  ProductReadModelMeta,
  RelationshipIntelligenceData,
  RelationshipPersonRow,
  RelationshipRepeatConnection,
  SignalIntelligenceRow,
  SourceIntelligenceRow,
  SourcingWorklistRow,
  ValueCount,
} from "./types";

export * from "./types";

const CORPUS_PATH = join(process.cwd(), "data", "v7-product", "companies.v7.json");

let cached: ProductCorpusDocument | null = null;

function loadCorpus(): ProductCorpusDocument {
  if (cached) return cached;
  cached = JSON.parse(readFileSync(CORPUS_PATH, "utf8")) as ProductCorpusDocument;
  return cached;
}

/** Test-only: drop the in-process memoisation of the immutable committed corpus. */
export function __resetDigitalAssetProductCache(): void {
  cached = null;
}

/** All 44 companies, sorted alphabetically. */
export function listCompanies(): ProductCompany[] {
  return [...loadCorpus().companies].sort((a, b) => a.name.localeCompare(b.name));
}

export function getCompanyBySlug(slug: string): ProductCompany | null {
  return loadCorpus().companies.find((c) => c.slug === slug) ?? null;
}

/** Lightweight directory for navigation and search. */
export function getCompanyDirectory(): ProductDirectoryEntry[] {
  return listCompanies().map((c) => ({
    entityId: c.entityId,
    slug: c.slug,
    name: c.name,
    category: c.category,
    description: c.description,
  }));
}

export function getReadModelMeta(): ProductReadModelMeta {
  const doc = loadCorpus();
  return {
    asOf: doc.generatedAt.slice(0, 10),
    generatedAt: doc.generatedAt,
    companyCount: doc.companyCount,
    researchBaselineCommit: doc.researchBaselineCommit,
  };
}

/**
 * Sourcing Worklist rows, default neutral order (alphabetical by name). The
 * caller may re-sort client-side; this function never orders by Fit,
 * Coverage, or Confidence, and rankEligibility is always NOT_ASSESSED, so no
 * ordering here can be mistaken for an investment ranking.
 */
export function getSourcingWorklist(): SourcingWorklistRow[] {
  return listCompanies().map((c) => ({
    entityId: c.entityId,
    slug: c.slug,
    name: c.name,
    category: c.category,
    entityType: c.entityType,
    assetType: c.assetType,
    institutionalOrientation: c.institutionalOrientation,
    digitalAssetLifecycle: c.digitalAssetLifecycle,
    thesisFit: c.thesisFit,
    overallCoverage: c.overallCoverage,
    overallConfidence: c.overallConfidence,
    displayState: c.displayState,
    recentSignal: c.recentSignal,
    majorEvidenceGap: c.majorEvidenceGap,
    rankEligibility: c.rankEligibility,
  }));
}

/**
 * Every signal event across the corpus, bound to its company. Default order
 * is most-recent-first by event date - explicitly chronological, never an
 * investment ranking, since no signal count or recency here feeds Thesis Fit.
 */
export function getSignalIntelligence(): SignalIntelligenceRow[] {
  return listCompanies()
    .flatMap((c) =>
      c.signalEvents.map((e) => ({
        ...e,
        entityId: c.entityId,
        candidateId: c.candidateId,
        slug: c.slug,
        companyName: c.name,
        category: c.category,
      })),
    )
    .sort((a, b) => (b.eventDate ?? b.publicationDate ?? "").localeCompare(a.eventDate ?? a.publicationDate ?? ""));
}

/**
 * Every source cited across the corpus, bound to the company it was cited
 * for. Default order is availability date then title - a provenance-neutral
 * order, never a reliability or investment ranking.
 */
export function getSourceIntelligence(): SourceIntelligenceRow[] {
  return listCompanies()
    .flatMap((c) =>
      c.sources.map((s) => ({
        ...s,
        entityId: c.entityId,
        candidateId: c.candidateId,
        slug: c.slug,
        companyName: c.name,
        category: c.category,
      })),
    )
    .sort((a, b) => (a.availabilityDate ?? a.publishedAt ?? "").localeCompare(b.availabilityDate ?? b.publishedAt ?? "") || a.title.localeCompare(b.title));
}

export interface PartnerHomeData {
  meta: ProductReadModelMeta;
  totalCompanies: number;
  provisionalCount: number;
  insufficientEvidenceCount: number;
  categoryCoverage: Array<{ category: string; count: number }>;
  recentSignals: Array<{ company: ProductDirectoryEntry; signal: ProductCompany["recentSignal"] }>;
  companiesWithCriticalGaps: Array<{ company: ProductDirectoryEntry; gap: string }>;
  companiesToReview: Array<{ company: ProductDirectoryEntry; reason: string }>;
}

/** Editorial data for the Partner Home landing page. No KPI-card dashboard: sections answer specific analyst questions. */
export function getPartnerHomeData(): PartnerHomeData {
  const companies = listCompanies();
  const toDirectoryEntry = (c: ProductCompany): ProductDirectoryEntry => ({
    entityId: c.entityId,
    slug: c.slug,
    name: c.name,
    category: c.category,
    description: c.description,
  });

  const categoryCounts = new Map<string, number>();
  for (const c of companies) {
    const key = c.category ?? "uncategorized";
    categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1);
  }

  const recentSignals = companies
    .filter((c) => c.recentSignal !== null)
    .sort((a, b) => (b.recentSignal!.eventDate ?? "").localeCompare(a.recentSignal!.eventDate ?? ""))
    .slice(0, 8)
    .map((c) => ({ company: toDirectoryEntry(c), signal: c.recentSignal }));

  const companiesWithCriticalGaps = companies
    .filter((c) => c.evidenceGaps.criticalDimensionGaps.some((g) => g.blocksEvidenceBar))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 10)
    .map((c) => ({ company: toDirectoryEntry(c), gap: c.majorEvidenceGap ?? "Critical evidence gap" }));

  const companiesToReview = companies
    .filter((c) => c.displayState === "INSUFFICIENT_EVIDENCE")
    .sort((a, b) => a.overallCoverage - b.overallCoverage)
    .slice(0, 10)
    .map((c) => ({
      company: toDirectoryEntry(c),
      reason: c.majorEvidenceGap ?? `Overall evidence coverage ${Math.round(c.overallCoverage * 100)}%`,
    }));

  return {
    meta: getReadModelMeta(),
    totalCompanies: companies.length,
    provisionalCount: companies.filter((c) => c.displayState === "PROVISIONAL").length,
    insufficientEvidenceCount: companies.filter((c) => c.displayState === "INSUFFICIENT_EVIDENCE").length,
    categoryCoverage: [...categoryCounts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    recentSignals,
    companiesWithCriticalGaps,
    companiesToReview,
  };
}

function toMarketMapCompanyRow(c: ProductCompany): MarketMapCompanyRow {
  return {
    entityId: c.entityId,
    slug: c.slug,
    name: c.name,
    entityType: c.entityType,
    assetType: c.assetType,
    institutionalOrientation: c.institutionalOrientation,
    digitalAssetLifecycle: c.digitalAssetLifecycle,
    displayState: c.displayState,
    overallCoverage: c.overallCoverage,
    overallConfidence: c.overallConfidence,
    thesisFit: c.thesisFit,
  };
}

function countBy<T>(items: T[], key: (item: T) => string | null): ValueCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item) ?? "unknown";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

/**
 * Market Map: the 44-company universe grouped by the eleven canonical
 * categories, in schema order (never by company count - that would read as a
 * ranking of category importance). Every category appears even when empty,
 * so the page can render a complete index. No TAM claim and no market-size
 * figure is computed here; every field traces to an existing product field.
 */
export function getMarketMap(): MarketMapData {
  const companies = listCompanies();
  const categories: MarketMapCategoryGroup[] = DIGITAL_ASSET_CATEGORIES.map((category) => {
    const inCategory = companies.filter((c) => c.category === category);
    const rows = inCategory.map(toMarketMapCompanyRow).sort((a, b) => a.name.localeCompare(b.name));
    return {
      category,
      companyCount: rows.length,
      entityTypeCounts: countBy(inCategory, (c) => c.entityType),
      assetTypeCounts: countBy(inCategory, (c) => c.assetType),
      lifecycleCounts: countBy(inCategory, (c) => c.digitalAssetLifecycle),
      provisionalCount: inCategory.filter((c) => c.displayState === "PROVISIONAL").length,
      insufficientEvidenceCount: inCategory.filter((c) => c.displayState === "INSUFFICIENT_EVIDENCE").length,
      averageCoverage: rows.length === 0 ? 0 : inCategory.reduce((sum, c) => sum + c.overallCoverage, 0) / rows.length,
      companies: rows,
    };
  });

  const uncategorized = companies
    .filter((c) => c.category === null)
    .map(toMarketMapCompanyRow)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    meta: getReadModelMeta(),
    totalCompanies: companies.length,
    categories,
    uncategorized,
  };
}

/**
 * Every person record in the frozen research corpus, bound to the researched
 * company it was recorded against. Sorted alphabetically by name - never by
 * role seniority or company, which would imply a ranking.
 */
export function getPeopleDirectory(): RelationshipPersonRow[] {
  return listCompanies()
    .flatMap((c) =>
      c.people.map((p) => ({
        personId: p.personId,
        name: p.name,
        currentRole: p.currentRole,
        isFounder: p.isFounder,
        tenures: p.tenures,
        priorCompanies: p.priorCompanies,
        entityId: c.entityId,
        candidateId: c.candidateId,
        slug: c.slug,
        companyName: c.name,
        category: c.category,
      })),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Relationship Intelligence: the people directory plus deterministic
 * repeat-connection detection. A "repeat connection" is a normalized person
 * name that appears against more than one researched company's people
 * records in the frozen corpus - never an inferred social or professional
 * link, and never derived from priorCompanies (external, unresearched
 * employers, not bound to a company record in this universe).
 */
export function getRelationshipIntelligence(): RelationshipIntelligenceData {
  const people = getPeopleDirectory();
  const byNormalizedName = new Map<string, RelationshipPersonRow[]>();
  for (const p of people) {
    const key = p.name.trim().toLowerCase();
    const list = byNormalizedName.get(key) ?? [];
    list.push(p);
    byNormalizedName.set(key, list);
  }

  const repeatConnections: RelationshipRepeatConnection[] = [...byNormalizedName.entries()]
    .filter(([, rows]) => new Set(rows.map((r) => r.slug)).size > 1)
    .map(([normalizedName, rows]) => ({
      normalizedName,
      name: rows[0]!.name,
      companies: rows.map((r) => ({ slug: r.slug, companyName: r.companyName, role: r.currentRole })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    meta: getReadModelMeta(),
    totalPeople: people.length,
    companiesWithPeople: new Set(people.map((p) => p.slug)).size,
    people,
    repeatConnections,
  };
}
