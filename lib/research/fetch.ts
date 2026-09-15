/**
 * Minimal research-time fetching.
 *
 * RESEARCH TIME ONLY. Nothing here ever runs in the browser or in a build that
 * produces the public site. The corpus is generated from committed input, so a
 * fetch failure can never break the deployed application.
 *
 * This is deliberately not a crawler. Reconnaissance evaluated a full crawling
 * framework and concluded that for a few hundred known pages it was heavier
 * than the problem. What is needed is a polite, bounded, single-page fetch, and
 * that is what this is.
 *
 * The constraints below are limits, not defaults to be raised later. A tool
 * that can fetch ten thousand pages will eventually be pointed at ten thousand
 * pages by someone in a hurry.
 */

export interface FetchPolicy {
  /** Hard timeout per request. */
  timeoutMs: number;
  /** Minimum gap between requests to the same host. */
  minIntervalMs: number;
  /** Refuse a response larger than this, measured while reading. */
  maxBytes: number;
  /** Acceptable content types. Anything else is refused unread. */
  allowedContentTypes: string[];
  /** Total requests permitted in one process. A backstop against a loop. */
  maxRequestsPerRun: number;
  userAgent: string;
}

export const DEFAULT_FETCH_POLICY: FetchPolicy = {
  timeoutMs: 15_000,
  minIntervalMs: 1_000,
  maxBytes: 2_000_000,
  allowedContentTypes: ["text/html", "application/xhtml+xml", "text/plain", "application/json"],
  maxRequestsPerRun: 500,
  userAgent:
    "DigitalAssetVentureIntelligence-Research/0.1 (independent investment research; contact via repository)",
};

export type FetchFailureReason =
  | "invalid_url"
  | "disallowed_scheme"
  | "timeout"
  | "network_error"
  | "http_error"
  | "content_type_refused"
  | "too_large"
  | "run_limit_reached"
  | "authentication_required";

export interface FetchSuccess {
  ok: true;
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  bytes: number;
  fetchedAt: string;
}

export interface FetchFailure {
  ok: false;
  url: string;
  reason: FetchFailureReason;
  detail: string;
  status: number | null;
}

export type FetchResult = FetchSuccess | FetchFailure;

/**
 * A polite fetcher.
 *
 * Never throws. Every failure is a typed result, so a research script reports
 * a bad page to the review queue and carries on rather than aborting a run
 * over one unreachable URL.
 */
export class ResearchFetcher {
  private readonly policy: FetchPolicy;
  private readonly lastRequestByHost = new Map<string, number>();
  private requestCount = 0;

  constructor(policy: Partial<FetchPolicy> = {}) {
    this.policy = { ...DEFAULT_FETCH_POLICY, ...policy };
  }

  get requestsMade(): number {
    return this.requestCount;
  }

  async fetch(rawUrl: string): Promise<FetchResult> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return fail(rawUrl, "invalid_url", "the URL could not be parsed");
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fail(rawUrl, "disallowed_scheme", `scheme ${url.protocol} is not permitted`);
    }

    // No authenticated scraping and no access-control circumvention. A URL
    // carrying credentials is refused rather than stripped, because stripping
    // would quietly change what was requested.
    if (url.username || url.password) {
      return fail(
        rawUrl,
        "authentication_required",
        "credentials in a URL are not permitted; this project does not perform authenticated scraping",
      );
    }

    if (this.requestCount >= this.policy.maxRequestsPerRun) {
      return fail(
        rawUrl,
        "run_limit_reached",
        `the per-run request limit of ${this.policy.maxRequestsPerRun} was reached`,
      );
    }

    await this.pace(url.hostname);
    this.requestCount += 1;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.policy.timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "user-agent": this.policy.userAgent,
          accept: this.policy.allowedContentTypes.join(", "),
        },
      });

      if (!response.ok) {
        // No automatic retry. A retry loop on a research script is how a
        // polite fetcher becomes an accidental denial of service.
        return fail(rawUrl, "http_error", `HTTP ${response.status}`, response.status);
      }

      const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
      if (!this.policy.allowedContentTypes.includes(contentType)) {
        return fail(
          rawUrl,
          "content_type_refused",
          `content type "${contentType}" is not in the allowed list`,
          response.status,
        );
      }

      const declaredLength = Number(response.headers.get("content-length") ?? "0");
      if (declaredLength > this.policy.maxBytes) {
        return fail(
          rawUrl,
          "too_large",
          `declared length ${declaredLength} exceeds the ${this.policy.maxBytes} byte cap`,
          response.status,
        );
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > this.policy.maxBytes) {
        // Checked again after reading, because content-length is optional and
        // a server may understate it.
        return fail(
          rawUrl,
          "too_large",
          `body of ${buffer.byteLength} bytes exceeds the ${this.policy.maxBytes} byte cap`,
          response.status,
        );
      }

      return {
        ok: true,
        url: rawUrl,
        finalUrl: response.url || rawUrl,
        status: response.status,
        contentType,
        body: new TextDecoder("utf-8").decode(buffer),
        bytes: buffer.byteLength,
        fetchedAt: new Date().toISOString(),
      };
    } catch (cause) {
      const error = cause as Error;
      if (error.name === "AbortError") {
        return fail(rawUrl, "timeout", `no response within ${this.policy.timeoutMs}ms`);
      }
      return fail(rawUrl, "network_error", error.message);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Wait until the per-host interval has elapsed. */
  private async pace(hostname: string): Promise<void> {
    const last = this.lastRequestByHost.get(hostname);
    const now = Date.now();
    if (last !== undefined) {
      const wait = this.policy.minIntervalMs - (now - last);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    }
    this.lastRequestByHost.set(hostname, Date.now());
  }
}

function fail(
  url: string,
  reason: FetchFailureReason,
  detail: string,
  status: number | null = null,
): FetchFailure {
  return { ok: false, url, reason, detail, status };
}
