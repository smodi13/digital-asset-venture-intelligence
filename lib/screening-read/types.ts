/**
 * Application-facing read contract for the production Screening analytical read
 * path. These types are what a future frontend (Phase 6D-C) consumes.
 *
 * Layer separation (do not collapse):
 *   - canonical research records .......... lib/schemas/*  (Company, EvidenceClaim, ...)
 *   - human analytical inputs ............. data/analytical-inputs/screening-assessments.json
 *   - deterministic scoring results ...... lib/scoring/*   (CriterionResult, DimensionResult, ...)
 *   - application read model .............. THIS FILE
 *
 * No Priority field. No ranking field. No recommendation field. No Trust field.
 * No Fit band. Mandate status is honest (NOT_ASSESSED); full Screening evidence
 * eligibility stays null until a real mandate assessment exists.
 */

import type { ThesisDimension } from "@/lib/schemas/thesis-configuration";

export type ScreeningDisplayState = "SCREENED" | "INSUFFICIENT_EVIDENCE";

/** Honest application-level mandate state. Not the canonical scoring enum. */
export type ApplicationMandateStatus = "NOT_ASSESSED";

/* -------------------------------------------------------------------------- */
/* Provenance references (identifiers + light hydration, never raw bodies)    */
/* -------------------------------------------------------------------------- */

export interface SourceRef {
  sourceId: string;
  publisher: string | null;
  title: string | null;
  url: string | null;
  sourceType: string;
  publishedAt: string | null;
  originatesFrom: string | null;
}

export interface ClaimRef {
  claimId: string;
  companyId: string;
  claim: string;
  topic: string | null;
  provenance: string;
  sourceSubtype: string | null;
  publicationDate: string | null;
  metricAsOfDate: string | null;
  sourceId: string | null;
  supportingSourceIds: string[];
  contradicts: string[];
  contradictedBy: string[];
  contradictionNote: string | null;
  diligenceQuestion: string | null;
}

/* -------------------------------------------------------------------------- */
/* Evidence bar mechanics (non-mandate). See SCREENING_EVIDENCE_SUFFICIENCY.  */
/* -------------------------------------------------------------------------- */

export interface EvidenceBarMechanics {
  /** overall Evidence Coverage >= 0.50 */
  overallCoveragePass: boolean;
  overallCoverage: number;
  /** overall Evidence Confidence >= 0.60 */
  overallConfidencePass: boolean;
  overallConfidence: number;
  /** at least 4 of 7 dimensions with coverage >= 0.50 */
  dimensionsAtFloorPass: boolean;
  dimensionsAtFloor: number;
  /** capital_efficiency and growth_momentum both have coverage > 0 (zero-only guard) */
  criticalDimensionsNonZeroCoveragePass: boolean;
  criticalDimensionCoverage: Record<"capital_efficiency" | "growth_momentum", number>;
  /** no material blocking conflict represented */
  noMaterialBlockingConflictPass: boolean;
  /** Screening display state === SCREENED */
  displayStatePass: boolean;
  /**
   * All non-mandate preconditions pass. This is NOT full Screening evidence
   * eligibility: mandate status is unknown for the current corpus, so
   * screeningEvidenceEligibility stays null.
   */
  nonMandateEvidenceBarPass: boolean;
  /** Every non-mandate precondition that failed, verbatim from the calibrated evaluator. */
  failedPreconditions: string[];
}

/* -------------------------------------------------------------------------- */
/* Dimension + criterion read views                                           */
/* -------------------------------------------------------------------------- */

export interface DimensionReadResult {
  dimension: ThesisDimension;
  score: number;
  coverage: number;
  confidence: number;
  displayState: "INSUFFICIENT_EVIDENCE" | "PROVISIONAL" | "SCORED";
  /** capital_efficiency and growth_momentum are the two critical Screening dimensions. */
  isCritical: boolean;
  coverageFlag: "covered" | "thin" | "missing";
}

export interface CriterionReadResult {
  criterionId: string;
  dimension: ThesisDimension;
  /** Raw human rubric anchor (0 / 25 / 50 / 75 / 100 / null). */
  rawAnchor: 0 | 25 | 50 | 75 | 100 | null;
  coverage: 0 | 0.5 | 1;
  /** Evidence-adjusted score used inside the dimension roll-up. */
  adjustedScore: number;
  confidence: number;
  /** True when the criterion contributes only the neutral-50 prior (null anchor). */
  neutralFill: boolean;
  displayStatus: "SCORED" | "INSUFFICIENT_EVIDENCE";
  contradiction: "none" | "minor" | "material";
  supportingClaims: ClaimRef[];
  reviewedButExcludedClaims: ClaimRef[];
  rationale: string;
}

/* -------------------------------------------------------------------------- */
/* Evidence gaps: "what information is missing or weak?" (never a priority)    */
/* -------------------------------------------------------------------------- */

export interface EvidenceGaps {
  /** capital_efficiency / growth_momentum with zero or thin (<0.50) coverage. */
  criticalDimensionGaps: Array<{ dimension: ThesisDimension; coverage: number; blocksEvidenceBar: boolean }>;
  /** Any of the 7 dimensions with exactly zero coverage. */
  missingDimensions: ThesisDimension[];
  /** Dimensions with coverage > 0 but below the 0.50 evidence-bar floor. */
  thinDimensions: Array<{ dimension: ThesisDimension; coverage: number }>;
  /** Criteria with zero coverage or filled only by the neutral prior. */
  criterionCoverageGaps: Array<{ criterionId: string; dimension: ThesisDimension; coverage: number; neutralFill: boolean }>;
  /** Cited claims carrying an unresolved contradiction (contradicts/contradictedBy, no note). */
  unresolvedConflicts: Array<{ claimId: string; against: string[]; note: string | null }>;
  /** Claims the analyst reviewed but excluded from scored evidence. */
  reviewedButExcludedEvidence: Array<{ criterionId: string; claimId: string }>;
  /** Concrete next-research prompts derived from the gaps above. */
  researchQuestions: string[];
}

/* -------------------------------------------------------------------------- */
/* Temporal events (canonical, read-only; NO Momentum / Convergence)          */
/* -------------------------------------------------------------------------- */

export interface SignalEventReadView {
  eventId: string;
  eventDate: string | null;
  publicationDate: string | null;
  signalType: string;
  signalCategory: string;
  signalDirection: string;
  eventStatus: string;
  summary: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
}

/* -------------------------------------------------------------------------- */
/* Company identity                                                           */
/* -------------------------------------------------------------------------- */

export interface CompanyIdentity {
  companyId: string;
  name: string;
  domain: string | null;
  description: string | null;
  sector: string | null;
  subsector: string | null;
  stage: string | null;
  hqLocation: string | null;
  isPrivate: boolean;
  lastResearchUpdate: string | null;
  /** Reviewer-facing research notes / diligence flags, verbatim from the corpus. */
  notes: string | null;
}

/* -------------------------------------------------------------------------- */
/* Worklist row + company detail                                              */
/* -------------------------------------------------------------------------- */

export interface ScreeningWorklistRow {
  analyticalMode: "screening";
  identity: CompanyIdentity;
  displayState: ScreeningDisplayState;
  /** Full internal precision. The UI rounds for presentation; the engine never rounds. */
  screeningThesisFit: number;
  overallEvidenceCoverage: number;
  overallEvidenceConfidence: number;
  evidenceBar: EvidenceBarMechanics;
  mandateStatus: ApplicationMandateStatus;
  /** null until a real Mandate Eligibility assessment exists for this company. */
  screeningEvidenceEligibility: null;
  /** Single most material evidence gap, or null. A research pointer, not a score. */
  majorEvidenceGap: string | null;
  sourceCount: number;
  /**
   * The company's most recent canonical SignalEvent, summarised. `eventStatus`
   * ("completed" | "reported_unconfirmed") is carried through so the frontend
   * cannot present a reported-but-unconfirmed event as an established fact. Not
   * a Momentum score, not a signal score.
   */
  recentSignal: {
    eventDate: string | null;
    signalType: string;
    signalDirection: string;
    eventStatus: string;
  } | null;
}

/** Canonical Person identity for the company People section. No invented biography. */
export interface PersonReadView {
  personId: string;
  name: string;
  currentRole: string | null;
  isFounder: boolean;
  /** Roles held at this company, from canonical dated tenures. */
  companyRoles: Array<{ role: string; startDate: string | null; endDate: string | null }>;
  priorCompanies: string[];
}

export interface CompanyScreeningDetail {
  analyticalMode: "screening";
  identity: CompanyIdentity;
  founderIds: string[];
  founderNames: string[];
  people: PersonReadView[];

  screeningThesisFit: number;
  overallEvidenceCoverage: number;
  overallEvidenceConfidence: number;
  displayState: ScreeningDisplayState;
  displayStateReason: string;

  evidenceBar: EvidenceBarMechanics;

  mandateStatus: ApplicationMandateStatus;
  mandateNote: string;
  screeningEvidenceEligibility: null;
  screeningEvidenceEligibilityNote: string;

  dimensions: DimensionReadResult[];
  criteria: CriterionReadResult[];
  evidenceGaps: EvidenceGaps;

  /** De-duplicated provenance for everything cited above. */
  citedClaims: ClaimRef[];
  citedSources: SourceRef[];

  signalEvents: SignalEventReadView[];
}

export interface ScreeningReadModelMeta {
  analyticalMode: "screening";
  asOf: string;
  assessmentDatasetVersion: number;
  corpusGeneratedAt: string;
  /** Always 0. The read path persists no ScoreSnapshot. */
  persistedScoreSnapshots: 0;
  companies: number;
  criterionAssessments: number;
}
