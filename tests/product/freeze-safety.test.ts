import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * Phase 4A productizes the completed v7 evaluation; it must not touch it.
 * Guards the frozen historical hashes named in the phase brief and confirms
 * the product build script only ever reads (never writes) frozen inputs.
 */
function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");
}

describe("Phase 4A freeze safety", () => {
  it("the product build script never writes into research/v7, judgments/v7, v7-analytical-inputs, or v7-score-results", () => {
    const src = read("scripts/product/build-corpus.ts");
    const writeCalls = [...src.matchAll(/writeFileSync\(([^,]+),/g)].map((m) => m[1]);
    for (const target of writeCalls) {
      expect(target).not.toMatch(/research.*v7.*input/);
      expect(target).not.toMatch(/judgments.*v7/);
      expect(target).not.toMatch(/v7-analytical-inputs/);
      expect(target).not.toMatch(/v7-score-results/);
    }
  });

  it("the product read layer only reads the generated product corpus, never raw YAML", () => {
    const src = read("lib/digital-asset-product/index.ts");
    expect(src).not.toMatch(/\.ya?ml/i);
    expect(src).toMatch(/v7-product/);
  });
});
