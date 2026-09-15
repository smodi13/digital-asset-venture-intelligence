import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/sourcing/cryptorank/route";

// A syntactically plausible fake key: >= 10 chars, no whitespace. Never a real credential.
const KEY = "crtestkey0000111122223333";

function req(body: unknown): Request {
  return new Request("http://localhost/api/sourcing/cryptorank", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ROUNDS_OK = {
  data: [
    {
      id: 501,
      currencyId: 9001,
      type: "SEED",
      date: "2026-09-05T00:00:00.000Z",
      raised: "4000000",
      category: { id: 1, name: "Infrastructure" },
      allInvestors: [{ name: "Frontier Capital" }],
    },
  ],
};

const MAP_OK = {
  data: [{ id: 9001, name: "Meridian Protocol", slug: "meridian-protocol", symbol: "MDP" }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/sourcing/cryptorank", () => {
  it("rejects a missing or malformed key without making any request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await POST(req({ key: "short", lookbackDays: 30 }));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a request with no body without making any request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await POST(new Request("http://localhost/api/sourcing/cryptorank", { method: "POST" }));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the key only as an X-Api-Key header to api.cryptorank.io, never in the URL", async () => {
    const seenUrls: string[] = [];
    const seenKeys: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        seenUrls.push(String(url));
        seenKeys.push(String((init.headers as Record<string, string>)["X-Api-Key"] ?? ""));
        const isMap = String(url).includes("/currencies/map");
        return new Response(JSON.stringify(isMap ? MAP_OK : ROUNDS_OK), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const res = await POST(req({ key: KEY, lookbackDays: 30 }));
    expect(res.status).toBe(200);
    expect(seenUrls.some((u) => u.startsWith("https://api.cryptorank.io/v3/funding-rounds/list"))).toBe(true);
    expect(seenUrls.some((u) => u.startsWith("https://api.cryptorank.io/v3/currencies/map"))).toBe(true);
    for (const u of seenUrls) expect(u).not.toContain(KEY);
    for (const k of seenKeys) expect(k).toBe(KEY);

    const json = JSON.stringify(await res.json());
    expect(json).not.toContain(KEY);
  });

  it("resolves the company name from currencyId via the currency map, never inventing one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const isMap = String(url).includes("/currencies/map");
        return new Response(JSON.stringify(isMap ? MAP_OK : ROUNDS_OK), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const res = await POST(req({ key: KEY, lookbackDays: 30 }));
    const body = (await res.json()) as { candidates: Array<{ name: string; funding: { round: string | null } | null }> };
    expect(body.candidates.some((c) => c.name === "Meridian Protocol")).toBe(true);
    const meridian = body.candidates.find((c) => c.name === "Meridian Protocol")!;
    expect(meridian.funding?.round).toBe("SEED");
  });

  it("maps a 401 from CryptoRank to a fixed code and never echoes the key or body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("secret upstream detail", { status: 401 })),
    );
    const res = await POST(req({ key: KEY, lookbackDays: 30 }));
    expect(res.status).toBe(401);
    const json = JSON.stringify(await res.json());
    expect(json).toBe(JSON.stringify({ error: "cryptorank_auth_failed" }));
    expect(json).not.toContain(KEY);
  });

  it("maps a 403 (plan does not include funding-rounds) to cryptorank_forbidden", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })));
    const res = await POST(req({ key: KEY, lookbackDays: 30 }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "cryptorank_forbidden" });
  });

  it("maps a 429 to cryptorank_rate_limited", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    const res = await POST(req({ key: KEY, lookbackDays: 30 }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "cryptorank_rate_limited" });
  });
});
