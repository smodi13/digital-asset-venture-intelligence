import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * Phase 2B active-path firewall.
 *
 * The v7 architecture is dormant until Phase 3. Nothing in the active
 * production path may import lib/schemas/v7/**, lib/config/digital-asset/**,
 * lib/scoring/digital-asset/**, or lib/domain/migrate-v6-v7.
 */

const ROOT = process.cwd();

const FORBIDDEN_IMPORT_PATTERNS = [
  /schemas\/v7/,
  /config\/digital-asset/,
  /scoring\/digital-asset/,
  /migrate-v6-v7/,
  /research-v7/,
  /judgments-v7/,
];

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "digital-asset" || full.includes(`${join("lib", "schemas", "v7")}`)) continue; // the v7/DA modules themselves
      out.push(...listFilesRecursive(full));
    } else if ([".ts", ".tsx"].includes(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

function assertNoForbiddenImport(dir: string): void {
  if (!statSync(dir, { throwIfNoEntry: false })) return;
  for (const file of listFilesRecursive(dir)) {
    if (file.includes(join("lib", "domain", "migrate-v6-v7"))) continue;
    const text = readFileSync(file, "utf8");
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      const importLines = text
        .split("\n")
        .filter((line) => /^\s*import\b/.test(line) || /require\(/.test(line));
      for (const line of importLines) {
        expect(pattern.test(line), `${file}: forbidden import "${line.trim()}"`).toBe(false);
      }
    }
  }
}

describe("active-path firewall (v7 stays dormant until Phase 3)", () => {
  it("app/** does not import the v7 architecture", () => {
    assertNoForbiddenImport(join(ROOT, "app"));
  });

  it("lib/screening-read/** does not import the v7 architecture", () => {
    assertNoForbiddenImport(join(ROOT, "lib", "screening-read"));
  });

  it("the active scoring modules do not import the v7 architecture", () => {
    for (const file of readdirSync(join(ROOT, "lib", "scoring"))) {
      if (file === "digital-asset") continue;
      const full = join(ROOT, "lib", "scoring", file);
      if (statSync(full).isDirectory()) continue;
      const text = readFileSync(full, "utf8");
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        expect(pattern.test(text), `lib/scoring/${file}`).toBe(false);
      }
    }
  });

  it("lib/research/** and scripts/research/** do not import the v7 architecture", () => {
    assertNoForbiddenImport(join(ROOT, "lib", "research"));
    assertNoForbiddenImport(join(ROOT, "scripts", "research"));
  });

  it("the active v6 schema modules do not import the v7 namespace", () => {
    for (const file of readdirSync(join(ROOT, "lib", "schemas"))) {
      const full = join(ROOT, "lib", "schemas", file);
      if (statSync(full).isDirectory()) continue; // v7/
      const text = readFileSync(full, "utf8");
      expect(/schemas\/v7/.test(text), `lib/schemas/${file}`).toBe(false);
    }
  });

  it("lib/domain/manifest.ts and ingest.ts do not import the v7 architecture or the migration adapter", () => {
    for (const file of ["manifest.ts", "ingest.ts"]) {
      const text = readFileSync(join(ROOT, "lib", "domain", file), "utf8");
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        expect(pattern.test(text), `lib/domain/${file}`).toBe(false);
      }
    }
  });
});
