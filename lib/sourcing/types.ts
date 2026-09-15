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
 * - public_feed:   a configured public RSS/Atom feed, no credential
 * - x_api_search:  the X API v2 recent-search endpoint, run with a
 *                  user-supplied bearer token (never stored; see docs/sourcing-v1.md)
 */
export type DiscoveryTransport = "public_feed" | "x_api_search";

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
  /** Deduplicated candidates, newest discovery first. */
  candidates: Candidate[];
  /** Non-fatal warnings surfaced to the analyst. */
  warnings: string[];
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
