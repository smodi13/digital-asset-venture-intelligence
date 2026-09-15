/**
 * POST /api/sourcing/x
 *
 * Runs X Discovery: an X API v2 recent-search for one fixed preset query, using
 * a bearer token the user supplies for this one run.
 *
 * Credential boundary:
 *   - The request body carries { presetId, token }. presetId is validated
 *     against a fixed allowlist (x-presets.ts). No query, URL, or host is ever
 *     read from the request.
 *   - The token is read once, passed straight to fetchXRecentSearch to build the
 *     Authorization header, and then goes out of scope. This route never logs
 *     the request body, never persists or caches the token, and never includes
 *     it in a response or in a thrown/returned error. All error responses are
 *     fixed short codes.
 *   - Cost: exactly one outbound request per call, a small fixed max_results,
 *     no pagination (any next_token is ignored), no retry, no background work.
 */

import { NextResponse } from "next/server";
import { X_DISCOVERY_ENGINE, runDiscoveryEngine, type ChannelItems } from "@/lib/sourcing/engine";
import { getXPreset } from "@/lib/sourcing/x-presets";
import { fetchXRecentSearch, looksLikeToken } from "@/lib/sourcing/x-fetch";
import { mapXPayloadToItems } from "@/lib/sourcing/x-map";
import { loadCanonicalCompanies } from "@/lib/sourcing/canonical";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let presetId: unknown;
  let token: unknown;
  try {
    const body = (await request.json()) as { presetId?: unknown; token?: unknown };
    presetId = body.presetId;
    token = body.token;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const preset = typeof presetId === "string" ? getXPreset(presetId) : null;
  if (!preset || !looksLikeToken(token)) {
    // Never fetch, never echo the body.
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const fetched = await fetchXRecentSearch(preset.query, token);
  if (!fetched.ok) {
    const status =
      fetched.error === "x_auth_failed"
        ? 401
        : fetched.error === "x_forbidden"
          ? 403
          : fetched.error === "x_rate_limited"
            ? 429
            : fetched.error === "timeout"
              ? 504
              : 502;
    return NextResponse.json({ error: fetched.error }, { status, headers: { "cache-control": "no-store" } });
  }

  const items = mapXPayloadToItems(fetched.payload, preset.id);
  const channel: ChannelItems = {
    channel: {
      id: `x:${preset.id}`,
      name: `X Discovery - ${preset.label}`,
      publisher: "X",
      url: "https://x.com/search",
      transport: "x_api_search",
    },
    ok: true,
    items,
  };

  const result = runDiscoveryEngine(X_DISCOVERY_ENGINE, [channel], {
    canonicalCompanies: loadCanonicalCompanies(),
  });

  return NextResponse.json(result, {
    status: result.status === "failed" ? 502 : 200,
    headers: { "cache-control": "no-store" },
  });
}
