/**
 * Datapile Crypto Funding: structured private-market funding source.
 *
 * Fetches the fixed, publicly documented Datapile crypto-sector funding page
 * (https://datapile.co/funding-news/sector/crypto), verified live before this
 * file was written: HTTP 200, text/html, a Next.js App Router page whose
 * server-rendered HTML embeds the full funding-round dataset as a React
 * Server Components ("RSC") flight payload - a `self.__next_f.push([1,"..."])`
 * script call per chunk, one of which contains `"initialList":{"data":[...]}`
 * with company/round/amount/country/investor fields already split out.
 *
 * This was chosen over the global funding RSS
 * (https://datapile.co/funding-news/rss.xml) because the RSS omits the
 * explicit "Crypto" category and structured investor/country fields the
 * crypto-sector page carries, and because the crypto-sector page is filtered
 * server-side to the same underlying database - a strict superset of the
 * crypto-relevant rows the RSS could ever carry. The RSS is dropped rather
 * than kept alongside it, to avoid double-counting the same rounds under two
 * source ids for no added coverage (see local-artifacts/scratch for the
 * diagnostic comparing both).
 *
 * No official public JSON/API endpoint was found for this page (no `/api/`
 * path appears anywhere in the HTML or its script tags, and the page is a
 * server component with no client-side data fetch); the embedded RSC payload
 * is the stable, directly-accessible, unauthenticated machine-readable
 * resource the page itself is built from (tier B in the source-selection
 * priority: not a documented API, but not HTML table scraping either - it is
 * typed JSON, not visual markup).
 *
 * Same SSRF discipline as feeds.ts: exactly one fixed, allowlisted URL, never
 * taken from a request. A second allowlist check happens at fetch time.
 */

import { ResearchFetcher, DEFAULT_FETCH_POLICY } from "@/lib/research/fetch";

export const DATAPILE_SOURCE_ID = "datapile-crypto-funding";
export const DATAPILE_SOURCE_NAME = "Datapile Crypto Funding";
export const DATAPILE_CRYPTO_URL = "https://datapile.co/funding-news/sector/crypto";

const ALLOWED_URLS: ReadonlySet<string> = new Set([DATAPILE_CRYPTO_URL]);

export type DatapileFetchOutcome = { ok: true; html: string } | { ok: false; error: string };

function classifyError(reason: string): string {
  switch (reason) {
    case "timeout":
      return "timeout";
    case "http_error":
      return "upstream_http_error";
    case "content_type_refused":
      return "unexpected_content_type";
    case "too_large":
      return "response_too_large";
    case "network_error":
      return "network_unreachable";
    default:
      return "fetch_failed";
  }
}

export async function fetchDatapileFunding(): Promise<DatapileFetchOutcome> {
  if (!ALLOWED_URLS.has(DATAPILE_CRYPTO_URL)) {
    return { ok: false, error: "feed_not_allowlisted" };
  }
  const fetcher = new ResearchFetcher({
    allowedContentTypes: [...DEFAULT_FETCH_POLICY.allowedContentTypes],
    timeoutMs: 12_000,
    minIntervalMs: 300,
    maxRequestsPerRun: 2,
  });
  try {
    const result = await fetcher.fetch(DATAPILE_CRYPTO_URL);
    if (!result.ok) return { ok: false, error: classifyError(result.reason) };
    return { ok: true, html: result.body };
  } catch {
    return { ok: false, error: "fetch_failed" };
  }
}
