/**
 * POST /api/sourcing/run
 *
 * Runs a discovery engine server-side against its CONFIGURED public feeds and
 * returns the deduplicated candidates with discovery provenance and canonical
 * match status.
 *
 * Security boundary:
 *   - No URL, host, or feed is read from the request. The body carries at most
 *     an engineId, validated against a fixed allowlist.
 *   - External fetches happen here, server-side, never from the browser.
 *   - No credential, API key, or environment secret is used or required.
 */

import { NextResponse } from "next/server";
import { PUBLIC_FEED_ENGINE, canonicalEngineId, runPublicFeedEngine } from "@/lib/sourcing/engine";
import { fetchEngineFeeds } from "@/lib/sourcing/fetch-feeds";
import { loadCanonicalCompanies } from "@/lib/sourcing/canonical";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Accepts the current id and the retired "headline-radar" id (v1.0.0 clients).
const ENGINES = new Set<string>([PUBLIC_FEED_ENGINE.id, "headline-radar"]);

export async function POST(request: Request) {
  let engineId: string = PUBLIC_FEED_ENGINE.id;
  try {
    const body = (await request.json().catch(() => ({}))) as { engineId?: unknown };
    if (typeof body.engineId === "string" && ENGINES.has(body.engineId)) {
      engineId = canonicalEngineId(body.engineId);
    } else if (body.engineId !== undefined && !ENGINES.has(String(body.engineId))) {
      return NextResponse.json({ error: "unknown_engine" }, { status: 400 });
    }
  } catch {
    // No body: run the default engine.
  }

  try {
    const outcomes = await fetchEngineFeeds(engineId);
    const result = runPublicFeedEngine(outcomes, {
      canonicalCompanies: loadCanonicalCompanies(),
    });
    return NextResponse.json(result, {
      status: result.status === "failed" ? 502 : 200,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "engine_run_failed" }, { status: 500 });
  }
}
