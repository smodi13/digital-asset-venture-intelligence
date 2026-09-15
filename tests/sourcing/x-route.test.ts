import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/sourcing/x/route";

// A syntactically plausible fake token: >= 20 chars, no whitespace, and no
// pattern that the secret guard treats as a real credential shape.
const TOKEN = "xtsttoken0000111122223333444455";

function req(body: unknown): Request {
  return new Request("http://localhost/api/sourcing/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const X_OK = {
  data: [
    {
      id: "9001",
      text: "Meridian raises $12M seed round to build developer tooling",
      created_at: "2026-09-05T12:00:00.000Z",
      author_id: "u9",
    },
  ],
  includes: { users: [{ id: "u9", username: "meridian" }] },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/sourcing/x", () => {
  it("rejects an unknown preset without making any request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await POST(req({ presetId: "not-a-preset", token: TOKEN }));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a missing or malformed token without making any request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await POST(req({ presetId: "funding-announcements", token: "short" }));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the token only as an Authorization bearer header to api.x.com", async () => {
    let seenUrl = "";
    let seenAuth = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        seenUrl = String(url);
        seenAuth = String((init.headers as Record<string, string>).authorization ?? "");
        return new Response(JSON.stringify(X_OK), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const res = await POST(req({ presetId: "funding-announcements", token: TOKEN }));
    expect(res.status).toBe(200);
    expect(seenUrl.startsWith("https://api.x.com/2/tweets/search/recent")).toBe(true);
    expect(seenUrl).not.toContain(TOKEN);
    expect(seenAuth).toBe(`Bearer ${TOKEN}`);

    const json = JSON.stringify(await res.json());
    expect(json).not.toContain(TOKEN);
    for (const term of ["score", "priority", "rank", "recommendation", "conviction"]) {
      expect(json.toLowerCase()).not.toContain(term);
    }
  });

  it("maps X auth failure to a fixed code and never echoes the token or body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("secret upstream detail", { status: 401 })),
    );
    const res = await POST(req({ presetId: "funding-announcements", token: TOKEN }));
    expect(res.status).toBe(401);
    const json = JSON.stringify(await res.json());
    expect(json).toBe(JSON.stringify({ error: "x_auth_failed" }));
    expect(json).not.toContain(TOKEN);
  });

  it("maps a rate limit to x_rate_limited", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    const res = await POST(req({ presetId: "stealth-launches", token: TOKEN }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "x_rate_limited" });
  });
});
