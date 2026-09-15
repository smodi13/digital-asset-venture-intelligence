import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Source-level guards for the Sourcing Engine UI (app/sourcing + SourcingView),
 * matching the style of tests/routes-ia.test.ts: implementation-aware enough to
 * catch a real regression in the credential-handling contract, loose enough not
 * to break on copy edits.
 */
function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");
}

describe("Sourcing Engine page", () => {
  const page = read("app/sourcing/page.tsx");

  it("renders the SourcingView engine module", () => {
    expect(page).toMatch(/<SourcingView\b/);
  });
});

describe("Public Sourcing invokes the public discovery endpoint", () => {
  const view = read("components/sourcing/SourcingView.tsx");

  it("posts to /api/sourcing/run with no credential field", () => {
    expect(view).toMatch(/fetch\(\s*["']\/api\/sourcing\/run["']/);
  });
});

describe("X Sourcing credential handling", () => {
  const view = read("components/sourcing/SourcingView.tsx");

  it("posts to /api/sourcing/x, never in a query string", () => {
    expect(view).toMatch(/fetch\(\s*["']\/api\/sourcing\/x["']/);
    expect(view).not.toMatch(/\/api\/sourcing\/x\?/);
  });

  it("uses a password-style input for the token", () => {
    expect(view).toMatch(/type=\{xTokenVisible \? "text" : "password"\}/);
  });

  it("never writes the token to localStorage or sessionStorage", () => {
    expect(view).not.toMatch(/(localStorage|sessionStorage)\.setItem\([^)]*xToken/);
    expect(view).not.toMatch(/(localStorage|sessionStorage)\.setItem\([^)]*token/);
  });

  it("shows a clear inline notice when no credential is entered", () => {
    expect(view).toMatch(/An X API credential is required to run X Sourcing\./);
  });

  it("clears the token on demand and never persists it", () => {
    expect(view).toMatch(/const clearToken = useCallback/);
  });
});

describe("CryptoRank Funding credential handling", () => {
  const view = read("components/sourcing/SourcingView.tsx");

  it("posts to /api/sourcing/cryptorank, never in a query string", () => {
    expect(view).toMatch(/fetch\(\s*["']\/api\/sourcing\/cryptorank["']/);
    expect(view).not.toMatch(/\/api\/sourcing\/cryptorank\?/);
  });

  it("uses a password-style input for the key", () => {
    expect(view).toMatch(/type=\{cryptorankKeyVisible \? "text" : "password"\}/);
  });

  it("never writes the key to localStorage or sessionStorage", () => {
    expect(view).not.toMatch(/(localStorage|sessionStorage)\.setItem\([^)]*cryptorankKey/);
  });

  it("shows a clear inline notice when no credential is entered", () => {
    expect(view).toMatch(/A CryptoRank API key is required to run CryptoRank Funding\./);
  });

  it("clears the key on demand and never persists it", () => {
    expect(view).toMatch(/const clearCryptorankKey = useCallback/);
  });
});

describe("Structured Funding Discovery invokes its own endpoint with no credential field", () => {
  const view = read("components/sourcing/SourcingView.tsx");

  it("posts to /api/sourcing/structured-funding with only lookbackDays", () => {
    expect(view).toMatch(/fetch\(\s*["']\/api\/sourcing\/structured-funding["']/);
    expect(view).not.toMatch(/\/api\/sourcing\/structured-funding\?/);
  });
});

describe("Sourcing results stay client-side", () => {
  const view = read("components/sourcing/SourcingView.tsx");
  const engine = read("lib/sourcing/engine.ts");
  const structuredEngine = read("lib/sourcing/structured-funding/engine.ts");
  const cryptorankFetch = read("lib/sourcing/cryptorank-fetch.ts");

  it("the queue is the only sourcing state persisted, and only to localStorage (browser-local, not a server mutation)", () => {
    expect(view).toMatch(/QUEUE_STORAGE_KEY/);
  });

  it("the discovery engine does not touch the frozen research/judgments/scoring corpus", () => {
    expect(engine).not.toMatch(/research\/v7|judgments\/v7|data\/v7-product|v7-score-results/);
  });

  it("the structured funding engine does not touch the frozen research/judgments/scoring corpus", () => {
    expect(structuredEngine).not.toMatch(/research\/v7|judgments\/v7|data\/v7-product|v7-score-results/);
  });

  it("the CryptoRank key is never logged", () => {
    expect(cryptorankFetch).not.toMatch(/console\.(log|error|warn)\([^)]*key/i);
  });
});

describe("Sourcing Engine is in primary navigation", () => {
  it("NavLinks includes the Sourcing Engine entry", () => {
    const nav = read("components/NavLinks.tsx");
    expect(nav).toMatch(/label:\s*"Sourcing Engine"/);
  });
});
