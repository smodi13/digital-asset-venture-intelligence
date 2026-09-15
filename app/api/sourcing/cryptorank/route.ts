/**
 * POST /api/sourcing/cryptorank
 *
 * Runs the optional CryptoRank Funding connector: two fixed CryptoRank Public
 * API v3 requests (funding-rounds/list, currencies/map) using an API key the
 * user supplies for this one run.
 *
 * Credential boundary (mirrors app/api/sourcing/x/route.ts):
 *   - The request body carries { key, lookbackDays }. lookbackDays is
 *     validated against the fixed 30/60/90 allowlist. No query, URL, or host
 *     is ever read from the request.
 *   - The key is read once, passed straight to the CryptoRank fetch helpers
 *     to build the X-Api-Key header, and then goes out of scope. This route
 *     never logs the request body, never persists or caches the key, and
 *     never includes it in a response or in a thrown/returned error. All
 *     error responses are fixed short codes.
 *   - Cost: exactly two outbound requests per call, one page, no pagination,
 *     no retry, no background work.
 */

import { NextResponse } from "next/server";
import {
  fetchCryptoRankCurrencyMap,
  fetchCryptoRankFundingRounds,
  looksLikeCryptoRankKey,
  type CryptoRankFetchError,
} from "@/lib/sourcing/cryptorank-fetch";
import { buildCurrencyMap, mapCryptoRankFundingRounds } from "@/lib/sourcing/cryptorank-map";
import { runStructuredFundingEngine, type SourceRecordsOutcome } from "@/lib/sourcing/structured-funding/engine";
import type { DiscoveryChannel, EngineDescriptor } from "@/lib/sourcing/engine";
import { loadCanonicalCompanies } from "@/lib/sourcing/canonical";
import { LOOKBACK_OPTIONS } from "@/lib/sourcing/relevance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CRYPTORANK_ENGINE: EngineDescriptor = { id: "cryptorank-discovery", name: "CryptoRank Funding" };

function statusFor(error: CryptoRankFetchError): number {
  if (error === "cryptorank_auth_failed") return 401;
  if (error === "cryptorank_forbidden") return 403;
  if (error === "cryptorank_rate_limited") return 429;
  if (error === "timeout") return 504;
  if (error === "invalid_request") return 400;
  return 502;
}

export async function POST(request: Request) {
  let key: unknown;
  let lookbackDays: (typeof LOOKBACK_OPTIONS)[number] = 30;
  try {
    const body = (await request.json()) as { key?: unknown; lookbackDays?: unknown };
    key = body.key;
    if (typeof body.lookbackDays === "number" && (LOOKBACK_OPTIONS as readonly number[]).includes(body.lookbackDays)) {
      lookbackDays = body.lookbackDays as (typeof LOOKBACK_OPTIONS)[number];
    }
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!looksLikeCryptoRankKey(key)) {
    // Never fetch, never echo the body.
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const now = Date.now();
  const fromIso = new Date(now - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const toIso = new Date(now).toISOString();

  const [roundsResult, mapResult] = await Promise.all([
    fetchCryptoRankFundingRounds(key, { fromIso, toIso }),
    fetchCryptoRankCurrencyMap(key),
  ]);

  if (!roundsResult.ok) {
    return NextResponse.json({ error: roundsResult.error }, { status: statusFor(roundsResult.error), headers: { "cache-control": "no-store" } });
  }
  if (!mapResult.ok) {
    return NextResponse.json({ error: mapResult.error }, { status: statusFor(mapResult.error), headers: { "cache-control": "no-store" } });
  }

  const currencyMap = buildCurrencyMap(mapResult.payload);
  const records = mapCryptoRankFundingRounds(roundsResult.payload, currencyMap);

  const channel: DiscoveryChannel = {
    id: "cryptorank-funding-rounds",
    name: "CryptoRank Funding",
    publisher: "CryptoRank",
    url: "https://cryptorank.io/funding-rounds",
    transport: "cryptorank_api",
  };
  const outcome: SourceRecordsOutcome = { channel, ok: true, records };

  const result = runStructuredFundingEngine(CRYPTORANK_ENGINE, [outcome], {
    canonicalCompanies: loadCanonicalCompanies(),
    lookbackDays,
  });

  return NextResponse.json(result, {
    status: result.status === "failed" ? 502 : 200,
    headers: { "cache-control": "no-store" },
  });
}
