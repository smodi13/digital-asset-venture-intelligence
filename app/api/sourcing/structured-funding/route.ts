/**
 * POST /api/sourcing/structured-funding
 *
 * Runs Structured Funding Discovery against the configured structured
 * private-market funding-record sources (Datapile today) and returns the
 * deduplicated candidates with discovery provenance and canonical match
 * status, in the exact same EngineRunResult shape Public Feed Discovery uses.
 *
 * Security boundary: no URL is read from the request. The body carries at
 * most lookbackDays, validated against a fixed allowlist. External fetches
 * happen here, server-side. No credential, API key, or environment secret is
 * used or required.
 */

import { NextResponse } from "next/server";
import { runDatapileStructuredFunding } from "@/lib/sourcing/structured-funding/engine";
import { loadCanonicalCompanies } from "@/lib/sourcing/canonical";
import { LOOKBACK_OPTIONS } from "@/lib/sourcing/relevance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let lookbackDays: number | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as { lookbackDays?: unknown };
    if (typeof body.lookbackDays === "number" && (LOOKBACK_OPTIONS as readonly number[]).includes(body.lookbackDays)) {
      lookbackDays = body.lookbackDays;
    }
  } catch {
    // No body: run with the default lookback.
  }

  try {
    const result = await runDatapileStructuredFunding({
      canonicalCompanies: loadCanonicalCompanies(),
      lookbackDays,
    });
    return NextResponse.json(result, {
      status: result.status === "failed" ? 502 : 200,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "engine_run_failed" }, { status: 500 });
  }
}
