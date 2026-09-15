/**
 * Server-side fetch for the optional CryptoRank Funding connector.
 *
 * Talks to exactly one host, api.cryptorank.io, and exactly two fixed paths
 * on the current official Public API v3 (verified against
 * https://docs.cryptorank.io/openapi.json before this file was written; v2 is
 * superseded):
 *   - GET /v3/funding-rounds/list  (Pro tier, 1 credit/request; auth header
 *     X-Api-Key) - the funding rounds themselves, filtered by date window.
 *   - GET /v3/currencies/map       - the documented id -> name/symbol lookup
 *     every other v3 endpoint cross-references to resolve a currencyId,
 *     fetched once per run (never once per round) to stay credit-frugal.
 *
 * Credential handling mirrors x-fetch.ts (see docs/sourcing-v1.md):
 *   - The key is used only to build the X-Api-Key header for these two
 *     requests, then goes out of scope.
 *   - Never logged, echoed, cached, persisted, or included in the return
 *     value or in any thrown/returned error.
 *   - Error results are fixed short codes; raw CryptoRank response bodies are
 *     never forwarded.
 *
 * Cost discipline: at most two requests per run (one funding-rounds page, one
 * currency map), one page, no pagination, no retry.
 */

const CRYPTORANK_BASE = "https://api.cryptorank.io/v3";
const TIMEOUT_MS = 12_000;
const MAX_BYTES = 4_000_000;

export type CryptoRankFetchError =
  | "invalid_request"
  | "cryptorank_auth_failed"
  | "cryptorank_forbidden"
  | "cryptorank_rate_limited"
  | "cryptorank_upstream_error"
  | "timeout";

export type CryptoRankFetchResult =
  | { ok: true; payload: unknown }
  | { ok: false; error: CryptoRankFetchError };

/** Shape check only. Never logs the value. */
export function looksLikeCryptoRankKey(raw: unknown): raw is string {
  return typeof raw === "string" && raw.length >= 10 && raw.length <= 256 && !/\s/.test(raw);
}

async function getJson(path: string, key: string, params: Record<string, string>): Promise<CryptoRankFetchResult> {
  const url = new URL(`${CRYPTORANK_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
      redirect: "error",
      headers: { "X-Api-Key": key, accept: "application/json" },
    });

    if (!response.ok) {
      if (response.status === 401) return { ok: false, error: "cryptorank_auth_failed" };
      if (response.status === 403) return { ok: false, error: "cryptorank_forbidden" };
      if (response.status === 429) return { ok: false, error: "cryptorank_rate_limited" };
      return { ok: false, error: "cryptorank_upstream_error" };
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) return { ok: false, error: "cryptorank_upstream_error" };
    try {
      const payload = JSON.parse(new TextDecoder("utf-8").decode(buffer)) as unknown;
      return { ok: true, payload };
    } catch {
      return { ok: false, error: "cryptorank_upstream_error" };
    }
  } catch (cause) {
    const name = (cause as { name?: string } | null)?.name;
    if (name === "AbortError") return { ok: false, error: "timeout" };
    return { ok: false, error: "cryptorank_upstream_error" };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCryptoRankFundingRounds(
  key: string,
  window: { fromIso: string; toIso: string },
): Promise<CryptoRankFetchResult> {
  if (!looksLikeCryptoRankKey(key)) return { ok: false, error: "invalid_request" };
  return getJson("/funding-rounds/list", key, {
    from: window.fromIso,
    to: window.toIso,
    sortBy: "date",
    sortOrder: "desc",
    page: "1",
  });
}

/** The documented id -> {name, symbol} map, fetched once per run and reused for every round. */
export async function fetchCryptoRankCurrencyMap(key: string): Promise<CryptoRankFetchResult> {
  if (!looksLikeCryptoRankKey(key)) return { ok: false, error: "invalid_request" };
  return getJson("/currencies/map", key, {});
}
