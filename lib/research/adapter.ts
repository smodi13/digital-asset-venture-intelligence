import type { AvailabilityEvidence } from "@/lib/schemas/availability";
import type { SourceType } from "@/lib/schemas/source-record";
import type {
  SignalCategory,
  SignalDirection,
  SignalType,
} from "@/lib/schemas/signal-event";

/**
 * The SourceAdapter contract.
 *
 * Every discovery source produces the same shape, so the pipeline downstream
 * of an adapter cannot tell which source a record came from. That is what
 * makes a failing source a missing row rather than a broken page, and it is
 * what will let the X Sourcing Engine, Builder Radar, and Company Change Radar
 * be added later without touching a canonical schema.
 *
 * FOUR CONCERNS, KEPT APART
 *
 *   transport      getting bytes: fetch, a file, or an API call
 *   parsing        turning those bytes into source-specific records
 *   normalisation  turning those records into CandidateRecord
 *   interpretation what any of it means for an investment
 *
 * An adapter does the first three. It never does the fourth. An adapter that
 * computed a score would put investment judgement inside a transport layer,
 * where it could not be configured, tested against a thesis, or audited. The
 * type below has no score field, so the separation is structural rather than a
 * convention someone could drift away from.
 */

/** How an adapter obtains its input. Recorded so a run is reproducible. */
export type AdapterTransport =
  /** Read from a committed research input file. No network. */
  | "research_file"
  /** Fetched over HTTP at research time. */
  | "http_fetch"
  /** Supplied by an authenticated API, for future adapters. */
  | "api"
  /** Read from a local private cache that is never committed. */
  | "local_cache";

/**
 * The normalised output of any adapter.
 *
 * Deliberately not a SignalEvent. A candidate has not been resolved to a
 * company, has not passed the ingestion boundary, and has no id. Producing a
 * finished SignalEvent inside an adapter would bypass both, so the type stops
 * short on purpose.
 */
export interface CandidateRecord {
  /** The adapter that produced this. */
  adapterId: string;
  transport: AdapterTransport;

  /** Company identity as the source expressed it. Resolution happens later. */
  companyHint: {
    id?: string | null;
    name?: string | null;
    domain?: string | null;
  };

  source: {
    url: string;
    publisher: string;
    title: string;
    sourceType: SourceType;
    publishedAt: string | null;
    isPressReleaseReproduction: boolean;
    originatesFromUrl: string | null;
    /** The source's own identifier, so re-ingestion is idempotent. */
    sourceRecordId: string | null;
  };

  temporal: {
    publicationDate: string | null;
    availabilityDate: string | null;
    availabilityEvidence: AvailabilityEvidence;
    eventDate: string | null;
  };

  /** The proposed classification. A proposal, never a conclusion. */
  classification: {
    signalType: SignalType;
    category: SignalCategory;
    direction: SignalDirection;
    /** How confident the adapter is in its own classification, 0 to 1. */
    classificationConfidence: number;
    /** What the adapter matched on, for audit. */
    matchedOn: string | null;
  } | null;

  /** A paraphrased factual summary. Never an article body. */
  evidenceSummary: string;
  /** A short verbatim quotation where the wording is the point. Capped. */
  excerpt: string | null;

  /** Anything the adapter could not settle, routed to the review queue. */
  problems: string[];
}

/**
 * A research-time source adapter.
 *
 * collect() is the whole interface. An adapter is given its configuration and
 * returns candidates; it does not write files, resolve companies, or decide
 * what anything is worth.
 */
export interface SourceAdapter<TConfig = unknown> {
  /** Stable identifier, recorded on every candidate this adapter produces. */
  readonly id: string;
  readonly description: string;
  readonly transport: AdapterTransport;
  /**
   * Whether this adapter reaches the network.
   *
   * The corpus build asserts that an offline run uses only adapters where this
   * is false, so a build cannot silently become network dependent.
   */
  readonly requiresNetwork: boolean;

  collect(config: TConfig): Promise<AdapterResult> | AdapterResult;
}

export interface AdapterResult {
  adapterId: string;
  candidates: CandidateRecord[];
  /** Records the adapter declined to emit at all, with the reason. */
  rejected: Array<{ reason: string; detail: string }>;
}

/**
 * An adapter that reaches nothing and returns synchronously.
 *
 * Every research-file adapter is one of these. Naming the synchronous case
 * keeps the corpus build free of needless await, and makes "this adapter
 * cannot touch the network" visible in its type.
 */
export interface SyncSourceAdapter<TConfig = unknown>
  extends Omit<SourceAdapter<TConfig>, "collect"> {
  readonly requiresNetwork: false;
  collect(config: TConfig): AdapterResult;
}

/** Helper for adapters: an empty result, so a failure returns rather than throws. */
export function emptyResult(adapterId: string, reason?: string): AdapterResult {
  return {
    adapterId,
    candidates: [],
    rejected: reason ? [{ reason: "adapter_unavailable", detail: reason }] : [],
  };
}
