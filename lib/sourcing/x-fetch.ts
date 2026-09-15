/**
 * Server-side fetch for X Discovery.
 *
 * Talks to exactly one host, api.x.com, and one path, the v2 recent-search
 * endpoint. The query comes from a fixed preset (x-presets.ts), never from the
 * request. The bearer token is supplied by the user for one run.
 *
 * Credential handling (see docs/sourcing-v1.md):
 *   - The token is used only to build the Authorization header for this one
 *     request.
 *   - It is never logged, echoed, cached, persisted, or included in the return
 *     value or in any thrown/returned error.
 *   - Error results are fixed short codes; raw X response bodies are never
 *     forwarded.
 *
 * Cost discipline: one request, a small fixed max_results, no pagination, no
 * retry. If X returns a next_token it is ignored.
 */

const X_SEARCH_URL = "https://api.x.com/2/tweets/search/recent";

/** Conservative: one page, well under the 100 cap, enough for a manual pass. */
export const X_MAX_RESULTS = 25;

const TIMEOUT_MS = 12_000;
const MAX_BYTES = 2_000_000;

export type XFetchError =
  | "invalid_request"
  | "x_auth_failed"
  | "x_forbidden"
  | "x_rate_limited"
  | "x_upstream_error"
  | "timeout";

export type XFetchResult =
  | { ok: true; payload: unknown }
  | { ok: false; error: XFetchError };

/** Shape check only. Never logs the value. */
export function looksLikeToken(raw: unknown): raw is string {
  return (
    typeof raw === "string" &&
    raw.length >= 20 &&
    raw.length <= 4096 &&
    !/\s/.test(raw)
  );
}

export async function fetchXRecentSearch(
  query: string,
  token: string,
): Promise<XFetchResult> {
  if (!looksLikeToken(token) || typeof query !== "string" || query.length === 0) {
    return { ok: false, error: "invalid_request" };
  }

  const url = new URL(X_SEARCH_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("max_results", String(X_MAX_RESULTS));
  url.searchParams.set("tweet.fields", "created_at,entities");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "username");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
      redirect: "error",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
      },
    });

    if (!response.ok) {
      // Map status only. The response body is not read and never forwarded.
      if (response.status === 401) return { ok: false, error: "x_auth_failed" };
      if (response.status === 403) return { ok: false, error: "x_forbidden" };
      if (response.status === 429) return { ok: false, error: "x_rate_limited" };
      return { ok: false, error: "x_upstream_error" };
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return { ok: false, error: "x_upstream_error" };
    }

    try {
      const payload = JSON.parse(new TextDecoder("utf-8").decode(buffer)) as unknown;
      return { ok: true, payload };
    } catch {
      return { ok: false, error: "x_upstream_error" };
    }
  } catch (cause) {
    const name = (cause as { name?: string } | null)?.name;
    if (name === "AbortError") return { ok: false, error: "timeout" };
    // Do not surface the raw error message; it is not credential-bearing but
    // keeping the taxonomy fixed is simpler to reason about.
    return { ok: false, error: "x_upstream_error" };
  } finally {
    clearTimeout(timer);
  }
}
