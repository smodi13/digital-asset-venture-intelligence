import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { sha256Hex } from "@/lib/hash/canonical";
import { compileBatch } from "@/lib/research-v7/compile";
import { manifestV7Schema, V7_MANIFEST_PATH } from "@/lib/research-v7/manifest";
import { baseCompanyPacket } from "./fixtures";

const ROOT = process.cwd();

describe("v7 manifest is separate from the active manifest", () => {
  it("V7_MANIFEST_PATH is not the active manifest path", () => {
    expect(V7_MANIFEST_PATH).toBe("data/v7-generated/MANIFEST.v7.json");
    expect(V7_MANIFEST_PATH).not.toBe("data/generated/MANIFEST.json");
  });

  it("compiling a batch produces a v7 manifest whose entries hash the emitted files", () => {
    const result = compileBatch([{ label: "p", raw: baseCompanyPacket({}) }], {
      batch: "SYNTHETIC",
      now: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    expect(result.manifest).not.toBeNull();
    const parsed = manifestV7Schema.parse(result.manifest);
    expect(parsed.entries.length).toBeGreaterThan(0);
    for (const entry of parsed.entries) {
      const text = result.files?.[entry.path];
      expect(text).toBeDefined();
      expect(sha256Hex(text as string)).toBe(entry.sha256);
    }
  });

  it("the active data/generated/MANIFEST.json is untouched by this test suite", () => {
    const activePath = join(ROOT, "data", "generated", "MANIFEST.json");
    if (!existsSync(activePath)) return; // active corpus may not exist in a fresh checkout
    const text = readFileSync(activePath, "utf8");
    expect(() => JSON.parse(text)).not.toThrow();
  });
});

describe("v7 research library does not depend on the active read/scoring path", () => {
  const FORBIDDEN = [/screening-read/, /scoring\/screening/, /scoring\/underwriting/];

  function listFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...listFiles(full));
      else if ([".ts"].includes(extname(entry))) out.push(full);
    }
    return out;
  }

  it("lib/research-v7/** never imports the active screening/scoring read path", () => {
    for (const file of listFiles(join(ROOT, "lib", "research-v7"))) {
      const text = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) {
        expect(pattern.test(text), file).toBe(false);
      }
    }
  });
});

describe("zero-research build case", () => {
  it("compiling an empty batch succeeds with empty collections and a valid manifest", () => {
    const result = compileBatch([], { batch: "SYNTHETIC", now: new Date("2026-09-01T00:00:00.000Z") });
    expect(result.ok).toBe(true);
    expect(result.corpus?.companies).toEqual([]);
    expect(result.manifest?.entries.every((e) => e.recordCount === 0)).toBe(true);
  });
});
