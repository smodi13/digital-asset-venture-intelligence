import { describe, it, expect } from "vitest";
import { ResearchFetcher, DEFAULT_FETCH_POLICY } from "@/lib/research/fetch";

/**
 * Research-time fetching.
 *
 * These tests exercise the guards that fire BEFORE any network call, so the
 * suite makes no requests. That matters twice over: the test suite must run
 * offline, and the guards being tested are precisely the ones that should stop
 * a request from happening.
 */

describe("fetch guards fire before any request", () => {
  it("refuses an unparseable URL", async () => {
    const result = await new ResearchFetcher().fetch("not a url");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_url");
  });

  it("refuses a non-http scheme", async () => {
    for (const url of ["file:///etc/passwd", "ftp://example.com/a", "data:text/html,x"]) {
      const result = await new ResearchFetcher().fetch(url);
      expect(result.ok, url).toBe(false);
      if (!result.ok) expect(["disallowed_scheme", "invalid_url"]).toContain(result.reason);
    }
  });

  it("refuses credentials in a URL rather than stripping them", async () => {
    // This project does not perform authenticated scraping. Stripping would
    // quietly change what was requested; refusing states the rule.
    const result = await new ResearchFetcher().fetch("https://user:pass@example.com/a");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("authentication_required");
      expect(result.detail).toContain("authenticated scraping");
    }
  });

  it("enforces a per-run request limit", async () => {
    const fetcher = new ResearchFetcher({ maxRequestsPerRun: 0 });
    const result = await fetcher.fetch("https://example.com/a");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("run_limit_reached");
  });

  it("never throws, so one bad page cannot abort a run", async () => {
    await expect(new ResearchFetcher().fetch("::::")).resolves.toBeDefined();
  });

  it("does not count refused requests against the run limit", async () => {
    const fetcher = new ResearchFetcher();
    await fetcher.fetch("not a url");
    expect(fetcher.requestsMade).toBe(0);
  });
});

describe("the default policy is conservative", () => {
  it("caps response size, timeout, and per-run requests", () => {
    expect(DEFAULT_FETCH_POLICY.maxBytes).toBeLessThanOrEqual(5_000_000);
    expect(DEFAULT_FETCH_POLICY.timeoutMs).toBeLessThanOrEqual(30_000);
    expect(DEFAULT_FETCH_POLICY.maxRequestsPerRun).toBeLessThanOrEqual(1_000);
  });

  it("paces requests to the same host", () => {
    expect(DEFAULT_FETCH_POLICY.minIntervalMs).toBeGreaterThanOrEqual(500);
  });

  it("identifies itself", () => {
    expect(DEFAULT_FETCH_POLICY.userAgent).toContain("DigitalAssetVentureIntelligence");
  });

  it("allows only document content types", () => {
    expect(DEFAULT_FETCH_POLICY.allowedContentTypes).toContain("text/html");
    expect(DEFAULT_FETCH_POLICY.allowedContentTypes).not.toContain("application/octet-stream");
  });
});

describe("no research fetching happens during a corpus build", () => {
  it("the corpus build script does not construct a fetcher", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const text = readFileSync(
      join(process.cwd(), "scripts/research/build-corpus.ts"),
      "utf8",
    );
    // The corpus is generated from committed input. A build that reached the
    // network would stop being reproducible and would start being able to fail.
    expect(text.includes("ResearchFetcher")).toBe(false);
  });
});
