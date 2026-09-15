import type { ThesisDimension } from "@/lib/schemas/thesis-configuration";
import type { EntityType, AssetType, DigitalAssetCategory, DigitalAssetLifecycle } from "@/lib/schemas/v7/company";
import type { ApplicabilityState } from "@/lib/scoring/digital-asset/applicability";
import type { ScreeningDisplayState } from "@/lib/scoring/digital-asset/screening-aggregate";
import type { SignalTypeV7, SignalCategoryV7, SignalDirection, SubjectType } from "@/lib/schemas/v7/signal-event";
import type { SourceTypeV7, SourceTier, SourceSupportRoleV7 } from "@/lib/schemas/v7/source-record";
import type { EventStatus } from "@/lib/schemas/signal-event";
import type { EvidenceStatus } from "@/lib/schemas/evidence-claim";
import type { ProvenanceKind } from "@/lib/provenance/classification";

/**
 * The production digital-asset product read model (Phase 4A).
 *
 * This is the ONE shape the generated corpus (data/v7-product/companies.v7.json)
 * and the read layer (./index.ts) agree on. It preserves every analytical
 * distinction the frozen v7 scoring engine produces: Thesis Fit, evidence
 * coverage, evidence confidence, display state, mandate status, rank
 * eligibility, per-dimension and per-criterion results, evidence gaps, and
 * provenance. Nothing here is collapsed into a single opaque score, and
 * cohort is audit metadata only - never a display or ranking input.
 */

export interface ProductCitedClaim {
  claimId: string;
  claim: string;
  topic: string;
  provenance: ProvenanceKind;
  sourceId: string | null;
  publicationDate: string | null;
  evidenceStatus: EvidenceStatus | null;
  contradicts: string[];
  contradictedBy: string[];
  contradictionNote: string | null;
  diligenceQuestion: string | null;
}

export interface ProductCriterion {
  criterionId: string;
  dimension: ThesisDimension;
  applicability: ApplicabilityState;
  /** null when not_applicable or unknown. */
  rawAnchor: number | null;
  /** null when not_applicable or unknown. */
  coverage: number | null;
  /** Deterministic evidence confidence, 0-1. Never analyst-entered. */
  confidence: number;
  rationale: string;
  evidenceGapNote: string | null;
  acknowledgedContradictionIds: string[];
  citedClaims: ProductCitedClaim[];
}

export interface ProductDimension {
  dimension: ThesisDimension;
  score: number;
  coverage: number;
  confidence: number;
  excludedNotApplicable: string[];
  unresolvedApplicability: string[];
}

export interface ProductEvidenceGaps {
  criticalDimensionGaps: Array<{ dimension: ThesisDimension; coverage: number; blocksEvidenceBar: boolean }>;
  missingDimensions: ThesisDimension[];
  thinDimensions: Array<{ dimension: ThesisDimension; coverage: number }>;
  criterionGapNotes: Array<{ criterionId: string; dimension: ThesisDimension; note: string }>;
  unresolvedConflicts: Array<{ claimId: string; against: string[]; note: string | null }>;
  researchQuestions: string[];
}

export interface ProductSource {
  sourceId: string;
  publisher: string;
  title: string;
  url: string | null;
  sourceType: SourceTypeV7;
  tier: SourceTier;
  publishedAt: string | null;
  availabilityDate: string | null;
  isIndependent: boolean;
  canCorroborate: boolean;
  originatesFrom: string | null;
  supportRole: SourceSupportRoleV7 | null;
  /** Number of cited claims (across this company's criteria) that rely on this source. */
  claimCount: number;
  /** Criteria ids whose cited claims rely on this source, deterministically derived. */
  linkedCriteriaIds: string[];
}

export interface ProductSignalEvent {
  eventId: string;
  subjectType: SubjectType;
  signalType: SignalTypeV7;
  signalCategory: SignalCategoryV7;
  signalDirection: SignalDirection;
  eventDate: string | null;
  publicationDate: string | null;
  eventStatus: EventStatus;
  unconfirmedNote: string | null;
  evidenceSummary: string;
  sourceId: string;
  sourceUrl: string | null;
}

export interface ProductPersonTenure {
  companyName: string;
  role: string;
  startDate: string | null;
  endDate: string | null;
  isFounder: boolean;
}

export interface ProductPerson {
  personId: string;
  name: string;
  currentRole: string | null;
  isFounder: boolean;
  tenures: ProductPersonTenure[];
  priorCompanies: string[];
}

export type ProductCohort = "CALIBRATION" | "VALIDATION" | "FINAL_TEST";

export interface ProductCompany {
  entityId: string;
  candidateId: string;
  /** Historical evaluation metadata only. Never surfaced as an investment attribute or used to order/filter the primary UI. */
  cohort: ProductCohort;
  slug: string;
  name: string;
  description: string;
  domain: string | null;
  category: DigitalAssetCategory | null;
  entityType: EntityType;
  assetType: AssetType;
  institutionalOrientation: boolean | null;
  digitalAssetLifecycle: DigitalAssetLifecycle | null;
  financingStage: string | null;
  firstObservedAt: string;

  mandateStatus: "NOT_ASSESSED";
  rankEligibility: "NOT_ASSESSED";

  thesisFit: number;
  overallCoverage: number;
  overallConfidence: number;
  displayState: ScreeningDisplayState;

  dimensions: ProductDimension[];
  criteria: ProductCriterion[];
  evidenceGaps: ProductEvidenceGaps;
  /** The single most material gap, for compact display. Never a priority score. */
  majorEvidenceGap: string | null;

  signalEvents: ProductSignalEvent[];
  recentSignal: ProductSignalEvent | null;

  sources: ProductSource[];
  sourceCount: number;
  independentSourceCount: number;

  people: ProductPerson[];
}

export interface ProductManifest {
  schemaVersion: 7;
  generatedAt: string;
  generator: string;
  companyCount: number;
  cohortCounts: Record<ProductCohort, number>;
  sha256: string;
}

export interface ProductCorpusDocument {
  schemaVersion: 7;
  generatedAt: string;
  companyCount: number;
  researchBaselineCommit: string;
  methodologyConfigFingerprint: string;
  calibrationConfigFreezeFingerprint: string;
  companies: ProductCompany[];
}

export interface ProductReadModelMeta {
  asOf: string;
  generatedAt: string;
  companyCount: number;
  researchBaselineCommit: string;
}

/** A compact directory entry for navigation and search. */
export interface ProductDirectoryEntry {
  entityId: string;
  slug: string;
  name: string;
  category: DigitalAssetCategory | null;
  description: string;
}

/** One row of the Signal Engine: a signal event bound to its company, for cross-company chronological review. */
export interface SignalIntelligenceRow extends ProductSignalEvent {
  entityId: string;
  candidateId: string;
  slug: string;
  companyName: string;
  category: DigitalAssetCategory | null;
}

/** One row of Source Intelligence: a source bound to the company it was cited for. */
export interface SourceIntelligenceRow extends ProductSource {
  entityId: string;
  candidateId: string;
  slug: string;
  companyName: string;
  category: DigitalAssetCategory | null;
}

/** One row of the Sourcing Worklist. */
export interface SourcingWorklistRow {
  entityId: string;
  slug: string;
  name: string;
  category: DigitalAssetCategory | null;
  entityType: EntityType;
  assetType: AssetType;
  institutionalOrientation: boolean | null;
  digitalAssetLifecycle: DigitalAssetLifecycle | null;
  thesisFit: number;
  overallCoverage: number;
  overallConfidence: number;
  displayState: ScreeningDisplayState;
  recentSignal: ProductSignalEvent | null;
  majorEvidenceGap: string | null;
  rankEligibility: "NOT_ASSESSED";
}

/* -------------------------------------------------------------------------- */
/* Market Map (Phase 4C)                                                       */
/* -------------------------------------------------------------------------- */

/** A count broken out by a categorical value, for compact distribution display. */
export interface ValueCount {
  value: string;
  count: number;
}

/** One company row within a Market Map category lane. */
export interface MarketMapCompanyRow {
  entityId: string;
  slug: string;
  name: string;
  entityType: EntityType;
  assetType: AssetType;
  institutionalOrientation: boolean | null;
  digitalAssetLifecycle: DigitalAssetLifecycle | null;
  displayState: ScreeningDisplayState;
  overallCoverage: number;
  overallConfidence: number;
  /** Analytical context only - the Market Map never orders or renders as a ranking. */
  thesisFit: number;
}

/** One canonical category lane, with compact coverage and composition metadata. */
export interface MarketMapCategoryGroup {
  category: DigitalAssetCategory;
  companyCount: number;
  entityTypeCounts: ValueCount[];
  assetTypeCounts: ValueCount[];
  lifecycleCounts: ValueCount[];
  provisionalCount: number;
  insufficientEvidenceCount: number;
  averageCoverage: number;
  companies: MarketMapCompanyRow[];
}

export interface MarketMapData {
  meta: ProductReadModelMeta;
  totalCompanies: number;
  /** Every one of the eleven canonical categories, in schema order, even when empty. */
  categories: MarketMapCategoryGroup[];
  /** Companies with no assigned category. Empty when every company is categorized. */
  uncategorized: MarketMapCompanyRow[];
}

/* -------------------------------------------------------------------------- */
/* Relationship Intelligence (Phase 4C)                                        */
/* -------------------------------------------------------------------------- */

/** One person bound to the researched company they are associated with. */
export interface RelationshipPersonRow {
  personId: string;
  name: string;
  currentRole: string | null;
  isFounder: boolean;
  tenures: ProductPersonTenure[];
  priorCompanies: string[];
  entityId: string;
  candidateId: string;
  slug: string;
  companyName: string;
  category: DigitalAssetCategory | null;
}

/** A person whose normalized name appears in more than one researched company's people records. */
export interface RelationshipRepeatConnection {
  normalizedName: string;
  name: string;
  companies: Array<{ slug: string; companyName: string; role: string | null }>;
}

export interface RelationshipIntelligenceData {
  meta: ProductReadModelMeta;
  totalPeople: number;
  companiesWithPeople: number;
  people: RelationshipPersonRow[];
  repeatConnections: RelationshipRepeatConnection[];
}
