import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * The product build script must be a pure function of tracked inputs: same
 * frozen research/judgment packets + same RUN_AT -> byte-identical output.
 * Runs the real script twice into isolated --out directories so this never
 * touches the committed data/v7-product/ corpus.
 */
describe("scripts/product/build-corpus.ts determinism", () => {
  it("produces byte-identical output across two runs with a fixed timestamp", () => {
    const runAt = "2026-01-01T00:00:00.000Z";
    const outA = mkdtempSync(join(tmpdir(), "da-product-a-"));
    const outB = mkdtempSync(join(tmpdir(), "da-product-b-"));
    try {
      for (const out of [outA, outB]) {
        execFileSync("npx", ["tsx", "scripts/product/build-corpus.ts"], {
          cwd: process.cwd(),
          env: { ...process.env, PRODUCT_BUILD_RUN_AT: runAt, PRODUCT_BUILD_OUT_ROOT: out },
          stdio: "pipe",
        });
      }
      const a = readFileSync(join(outA, "data", "v7-product", "companies.v7.json"), "utf8");
      const b = readFileSync(join(outB, "data", "v7-product", "companies.v7.json"), "utf8");
      expect(a).toBe(b);
    } finally {
      rmSync(outA, { recursive: true, force: true });
      rmSync(outB, { recursive: true, force: true });
    }
  }, 30_000);
});
