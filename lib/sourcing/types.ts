/**
 * Sourcing V1 types.
 *
 * A sourcing candidate is a company surfaced by a discovery engine from public
 * data. It is NOT a researched company: it has discovery provenance only, no
 * EvidenceClaims, no SignalEvents, and no Screening result. The types here keep
 * that separation structural. Nothing in this file carries a score, a rank, a
 * Priority, or a quality judgement, and nothing here can produce one.
 *
 * See docs/sourcing-v1.md.
 */

/**
 * How a discovery engine reached its input. Recorded so a run is reproducible.
 *
 * - public_feed:        a configured public RSS/Atom feed, no credential
 * - x_api_search:        the X API v2 recent-search endpoint, run with a
 *                        user-supplied bearer token (never stored; see docs/sourcing-v1.md)
 * - structured_funding:  a configured structured private-market funding-record
 *                        source (e.g. Datapile), no credential
 * - cryptorank_api:      the CryptoRank funding-rounds API, run with a
 *                        user-supplied API key (never stored)
 */
export type DiscoveryTransport = "public_feed" | "x_api_search" | "structured_funding" | "cryptorank_api";

/**
 * A structured private-market funding record, as reported by a structured
 * funding source (never a news headline). Preserves the source's own fields;
 * a field the source did not state stays null, never invented or estimated.
 * Discovery only: never underwritten, never screened, never a score.
 */
export interface StructuredFundingSummary {
  /** Round / stage label as the source stated it (e.g. "Seed", "Series A"). */
  round: string | null;
  /** Amount raised as the source displayed it (e.g. "$1.3M"). */
  amountDisplay: string | null;
  /** Amount raised in USD, when the source gave a parseable figure. */
  amountUsd: number | null;
  currency: string | null;
  /** Valuation as the source displayed it, when available. */
  valuationDisplay: string | null;
  leadInvestors: string[];
  otherInvestors: string[];
  /** Funding announcement date (not discoveredAt), ISO, or null if unknown. */
  announcementDate: string | null;
  /** Name of the structured funding source (e.g. "Datapile", "CryptoRank"). */
  sourceName: string;
}

/**
 * One discovery provenance record: the full chain from engine to source item.
 *
 * Every surfaced candidate carries at least one of these. A candidate seen in
 * more than one story keeps one record per story; provenance is never discarded
 * when duplicates merge.
 */
export interface DiscoveryProvenance {
  /** The engine that surfaced this. */
  engineId: string;
  engineName: string;
  transport: DiscoveryTransport;
  /** The configured feed the item came from. */
  feedId: string;
  feedName: string;
  feedUrl: string;
  /** The source story. */
  sourceTitle: string;
  sourceUrl: string;
  sourcePublisher: string;
  /** Publication timestamp as the feed stated it, ISO, or null. */
  sourcePublishedAt: string | null;
  /** When this engine run observed the item. ISO. */
  discoveredAt: string;
  /** The feed item's own id / guid, so re-runs are idempotent. */
  sourceItemId: string;
  /** Why this item surfaced: a short factual phrase, never a quality claim. */
  discoveryReason: string;
  /** Feed categories / matched terms that put this item in scope. */
  matchedTerms: string[];
}

/** How confident the deterministic extractor is about the candidate's identity. */
export type IdentityConfidence = "confirmed" | "probable" | "needs_review";

/** Whether a candidate corresponds to a company already in the canonical corpus. */
export interface ExistingCompanyMatch {
  /** Non-null when the candidate matches a researched company. */
  companyId: string | null;
  /** How the match was made. */
  method: "domain" | "exact_name" | "alias" | "name_similarity" | "none";
  /** Human-readable basis, for display. */
  detail: string;
}

/**
 * A deduplicated discovered candidate.
 *
 * Unknown fields stay null. The extractor never invents a domain, a founder, a
 * funding figure, or a description that the source did not state.
 */
export interface Candidate {
  /** Stable id derived from the strongest identity available. */
  id: string;
  /** Company name as extracted. */
  name: string;
  /** Registrable domain, or null when the source did not provide one. */
  domain: string | null;
  /** Normalised domain for dedup / matching, or null. */
  normalizedDomain: string | null;
  /** A short factual description drawn from the source, or null. */
  description: string | null;
  identityConfidence: IdentityConfidence;
  /** Earliest discovery timestamp across all provenance records. ISO. */
  discoveredAt: string;
  /** Every discovery provenance record for this candidate. At least one. */
  provenance: DiscoveryProvenance[];
  /** Match against the 39 canonical researched companies. */
  existing: ExistingCompanyMatch;
  /** Deterministic digital-asset relevance strength. Never "not_relevant" here: weaker items are filtered before a Candidate is built. */
  relevance: "strong" | "moderate";
  /** Vocabulary terms that established relevance, for display. */
  relevanceTerms: string[];
  /** Workflow usefulness to a sourcing analyst. NOT an investment score. */
  discoveryUtility: "high" | "medium";
  /** Best-effort tag into one of the 11 canonical categories, or null. Never authoritative. */
  category: string | null;
  /** Short factual explanation of why this candidate was surfaced. */
  whySurfaced: string;
  /**
   * Source-reported funding data, when this candidate came from (or was also
   * seen in) a structured funding source. Null for a candidate seen only in
   * news/X discovery. A discovery lead, not underwritten evidence: confirm
   * through primary evidence before analytical screening.
   */
  funding: StructuredFundingSummary | null;
}

/**
 * A digital-asset-relevant, discovery-worthy item whose entity extraction
 * could not confidently resolve a company/protocol name. Never a Candidate:
 * no Screening, no Thesis Fit, no investment score. Shown as a quieter
 * secondary "Needs Identity Review" section so a promising signal is not
 * silently dropped, but never mistaken for a resolved sourcing lead.
 */
export interface ReviewSignal {
  /** Stable id derived from the source item, for dedup across a run. */
  id: string;
  headline: string;
  source: string;
  sourceUrl: string;
  publishedAt: string | null;
  discoveredAt: string;
  /** Vocabulary terms that established digital-asset relevance. */
  whyRelevant: string;
  /** The positive discovery-utility signal that made this worth a human look. */
  whyUseful: string;
  /** Why the deterministic extractor could not resolve a name. */
  identityIssue: string;
  transport: DiscoveryTransport;
}

/** Aggregate counts proving a run fetched and filtered live data. Never a score. */
export interface FilteredBuckets {
  nonDigitalAsset: number;
  editorialEventPromotional: number;
  outsideRecencyWindow: number;
  /** Relevant, but a negative discovery-utility signal (e.g. Series D+, IPO, mega valuation) was present. */
  lowDiscoveryUtility: number;
  /**
   * Relevant, resolved-or-resolvable, but no genuinely early-stage discovery
   * signal (seed/Series A-B/stealth/new-protocol/mainnet/testnet) was
   * present - a routine product launch, partnership, integration, or
   * expansion by an already-operating entity. Not "irrelevant": this is
   * real digital-asset news, just not a sourcing lead (section 1-3).
   */
  mediumDiscoveryUtility: number;
  unresolvedEntity: number;
}

export interface RunSummary {
  sourcesFetched: number;
  itemsInspected: number;
  /** Items inside the recency window (before any relevance/noise decision). */
  withinRecency: number;
  /** Items whose relevance was strong, or moderate with sufficient utility. */
  digitalAssetRelevant: number;
  /** digitalAssetRelevant items that also cleared the discovery-utility bar. */
  candidateWorthinessPassed: number;
  /** candidateWorthinessPassed items whose entity extraction confidently resolved a name. */
  entitiesResolved: number;
  newCandidates: number;
  alreadyTracked: number;
  /** candidateWorthinessPassed items that could not resolve an identity but were high-utility enough to keep for analyst review. */
  needsIdentityReview: number;
  filteredCount: number;
  filteredBuckets: FilteredBuckets;
  lookbackDays: number;
}

/** Per-feed health for one engine run. No secrets, no stack traces. */
export interface FeedHealth {
  feedId: string;
  feedName: string;
  feedUrl: string;
  ok: boolean;
  /** Feed items parsed from the response. */
  itemsInspected: number;
  /** Items that produced a candidate (after in-feed dedup). */
  itemsAccepted: number;
  /** Items that produced a Needs Identity Review signal. */
  itemsNeedingReview: number;
  /** A short error class when ok is false, never raw error text. */
  error: string | null;
}

/** The outcome of running one engine. */
export type EngineRunStatus = "completed" | "partial_failure" | "failed";

export interface EngineRunResult {
  engineId: string;
  engineName: string;
  /** ISO timestamp the run started. */
  runAt: string;
  status: EngineRunStatus;
  feeds: FeedHealth[];
  /**
   * Deduplicated candidates, ordered by relevance strength, then discovery
   * utility, then recency, then identity confidence (see RunSummary /
   * lib/sourcing/relevance.ts). Not an investment ranking.
   */
  candidates: Candidate[];
  /**
   * High-quality discovery signals whose entity identity could not be
   * resolved (section 7). Never a Candidate, never scored, ordered
   * newest-published-first.
   */
  reviewSignals: ReviewSignal[];
  /** Non-fatal warnings surfaced to the analyst. */
  warnings: string[];
  /** Live-run proof: fetch, inspection, and filtering counts for this run. */
  summary: RunSummary;
}

/* -------------------------------------------------------------------------- */
/* Research queue                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Candidate workflow state. Deliberately NOT an investment status: there is no
 * PASS, ESCALATE, MONITOR, REJECT, or INVEST. These states answer "where is
 * this candidate in the research workflow", nothing more.
 */
export const QUEUE_STATES = [
  "DISCOVERED",
  "QUEUED_FOR_RESEARCH",
  "RESEARCH_IN_PROGRESS",
  "RESEARCH_HANDOFF_READY",
  "ALREADY_RESEARCHED",
  "ARCHIVED",
] as const;

export type QueueState = (typeof QUEUE_STATES)[number];

export interface QueueEntry {
  candidateId: string;
  /** A snapshot of the candidate at queue time, so the queue survives a re-run. */
  candidate: Candidate;
  state: QueueState;
  /** ISO timestamp of the last state change. */
  updatedAt: string;
}
