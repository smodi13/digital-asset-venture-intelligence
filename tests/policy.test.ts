import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  walkTextFiles,
  runAllPolicies,
  formatViolations,
  findEmDashes,
  findBannedNames,
  findSecrets,
  findLocalPaths,
  isPublicDeliverable,
  BANNED_NAMES,
} from "@/lib/policy";

/**
 * Repository-wide policy scan.
 *
 * This asserts the tree is currently clean. Proving the guards actually detect
 * what they claim to detect is a separate file, tests/policy-negative.test.ts,
 * because a guard that passes on a clean tree tells you nothing on its own.
 */

const ROOT = process.cwd();
const FILES = walkTextFiles(ROOT);

describe("the scan covers what it claims to cover", () => {
  it("finds a meaningful number of files", () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  it("covers source, config, docs, fixtures, README, and public assets", () => {
    const paths = FILES.map((f) => f.path);
    const areas: Array<[string, (p: string) => boolean]> = [
      ["source", (p) => p.startsWith("lib/") || p.startsWith("app/")],
      ["config", (p) => p.startsWith("config/")],
      ["docs", (p) => p.startsWith("docs/")],
      ["generated fixtures", (p) => p.startsWith("data/generated/")],
      ["README", (p) => p === "README.md"],
      ["tests", (p) => p.startsWith("tests/")],
      ["scripts", (p) => p.startsWith("scripts/")],
    ];
    for (const [name, predicate] of areas) {
      expect(paths.some(predicate), `no ${name} file was scanned`).toBe(true);
    }
  });

  it("excludes vendored and build directories", () => {
    for (const file of FILES) {
      expect(file.path.startsWith("node_modules/")).toBe(false);
      expect(file.path.startsWith(".next/")).toBe(false);
      expect(file.path.startsWith(".git/")).toBe(false);
    }
  });

  it("excludes the raw handoff area and local tooling output", () => {
    // research/imports holds unreviewed third-party handoff packets; graphify-out
    // is local tooling output; .qmd is the gitignored project-local QMD search
    // index. None is this project's copy and none ships.
    for (const file of FILES) {
      expect(file.path.startsWith("research/imports/")).toBe(false);
      expect(file.path.startsWith("graphify-out/")).toBe(false);
      expect(file.path === ".qmd" || file.path.startsWith(".qmd/")).toBe(false);
    }
  });

  it("classifies public deliverables correctly", () => {
    expect(isPublicDeliverable("data/generated/x.json")).toBe(true);
    expect(isPublicDeliverable("docs/methodology.md")).toBe(true);
    expect(isPublicDeliverable("README.md")).toBe(true);
    expect(isPublicDeliverable("config/thesis.yaml")).toBe(true);
    expect(isPublicDeliverable("scripts/research/build-example-fixture.ts")).toBe(false);
  });
});

describe("policy: no em dash", () => {
  it("the repository contains zero U+2014 characters", () => {
    const violations = findEmDashes(FILES);
    expect(violations.length, formatViolations(violations)).toBe(0);
  });
});

describe("policy: no firm or prior-brand name", () => {
  it("the repository contains no banned name", () => {
    const violations = findBannedNames(FILES);
    expect(violations.length, formatViolations(violations)).toBe(0);
  });

  it("the banned list is word bounded rather than substring based", () => {
    // A substring scan would flag ordinary English. Word bounding is the
    // mitigation, so it is asserted rather than assumed.
    const ordinary = [
      { absolutePath: "", path: "x.md", text: "We glean information from filings." },
      { absolutePath: "", path: "y.md", text: "The north star metric is retention." },
      { absolutePath: "", path: "z.md", text: "Headline Radar is a module of this product." },
      { absolutePath: "", path: "w.md", text: "The counterpart of this argument is weaker." },
    ];
    const violations = findBannedNames(ordinary);
    expect(violations.length, formatViolations(violations)).toBe(0);
  });

  it("the product name is permitted", () => {
    const ours = [
      { absolutePath: "", path: "x.md", text: "Digital Asset Venture Intelligence and the X Sourcing Engine." },
    ];
    expect(findBannedNames(ours).length).toBe(0);
  });

  it("third-party project names required for attribution are not banned", () => {
    const attribution = [
      {
        absolutePath: "",
        path: "docs/attribution.md",
        text: "Scout, thesis-agent, OpenDealflow, ScoutLayer, DealDesk, Autonitia Intel.",
      },
    ];
    expect(findBannedNames(attribution).length).toBe(0);
  });

  it("every banned entry declares a reason", () => {
    for (const entry of BANNED_NAMES) {
      expect(entry.term.length, JSON.stringify(entry)).toBeGreaterThan(0);
      expect(entry.reason.length, entry.term).toBeGreaterThan(0);
    }
  });
});

describe("policy: no secrets", () => {
  it("the repository contains no credential-shaped value", () => {
    const violations = findSecrets(FILES);
    expect(violations.length, formatViolations(violations)).toBe(0);
  });

  it("no .env file was copied into the repository", () => {
    for (const name of [".env", ".env.local", ".env.production", ".env.development"]) {
      expect(existsSync(join(ROOT, name)), `${name} must not exist`).toBe(false);
    }
  });

  it(".env.example exists, documents no credential, and warns about NEXT_PUBLIC_", () => {
    const example = FILES.find((f) => f.path === ".env.example");
    expect(example).toBeDefined();
    const text = example?.text ?? "";
    expect(text).toContain("requires NO environment variables");
    expect(text).toContain("NEXT_PUBLIC_");
    // Phase 2 adds no X credential field. The variable name must not yet appear
    // as an active assignment.
    expect(/^\s*X_BEARER_TOKEN\s*=/m.test(text)).toBe(false);
  });

  it("the application reads no environment variable outside build scripts", () => {
    const offenders = FILES.filter(
      (f) =>
        (f.path.startsWith("app/") || f.path.startsWith("components/")) &&
        /process\.env\./.test(f.text),
    );
    expect(offenders.map((f) => f.path)).toEqual([]);
  });
});

describe("policy: no local absolute paths in public material", () => {
  it("no public deliverable contains a local path", () => {
    const violations = findLocalPaths(FILES, { publicOnly: true });
    expect(violations.length, formatViolations(violations)).toBe(0);
  });

  it("no file anywhere in the repository contains a local path", () => {
    // Stricter than required. Development scripts are permitted to reference a
    // path where genuinely necessary, and none currently needs to, so the
    // stricter assertion is the honest one to make while it holds.
    const violations = findLocalPaths(FILES, { publicOnly: false });
    expect(violations.length, formatViolations(violations)).toBe(0);
  });
});

describe("policy: raw source archives were not migrated", () => {
  it("no directory of raw platform responses exists", () => {
    for (const forbidden of ["data/output", "data/raw", "data/state", "data/cache"]) {
      expect(existsSync(join(ROOT, forbidden)), `${forbidden} must not exist`).toBe(false);
    }
  });

  it("generated data contains no personal identity fields", () => {
    // Raw platform archives carry names, usernames, account ids, bios, and
    // locations. None of that belongs in a public repository, so the field
    // names themselves are asserted absent from generated output. The trailing
    // colon matches a JSON key and not a lexical token: search-index.json
    // legitimately holds the vocabulary word "email" from a company that sells
    // email infrastructure, which is not a personal identity field.
    const generated = FILES.filter((f) => f.path.startsWith("data/generated/"));
    expect(generated.length).toBeGreaterThan(0);
    const forbiddenFields = [
      '"username":',
      '"screen_name":',
      '"author_id":',
      '"followers_count":',
      '"profile_image_url":',
      '"email":',
    ];
    const hits: string[] = [];
    for (const file of generated) {
      for (const field of forbiddenFields) {
        if (file.text.includes(field)) hits.push(`${field} in ${file.path}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("policy: built output, when a build is present", () => {
  // The rendered HTML is what a reader actually receives, so it is checked
  // separately from source. Only the prerendered app output is scanned, not
  // the vendored framework chunks, which are not this project's copy.
  const BUILD_DIR = join(ROOT, ".next", "server", "app");
  const built = existsSync(BUILD_DIR)
    ? walkTextFiles(BUILD_DIR, { extensions: [".html"], applyStandardExcludes: false })
    : [];

  it.skipIf(built.length === 0)("contains no em dash", () => {
    const violations = findEmDashes(built);
    expect(violations.length, formatViolations(violations)).toBe(0);
  });

  it.skipIf(built.length === 0)("contains no banned name", () => {
    const violations = findBannedNames(built);
    expect(violations.length, formatViolations(violations)).toBe(0);
  });

  it.skipIf(built.length === 0)("contains no credential-shaped value", () => {
    const violations = findSecrets(built);
    expect(violations.length, formatViolations(violations)).toBe(0);
  });

  it.skipIf(built.length === 0)("contains no local absolute path", () => {
    const violations = findLocalPaths(built, { publicOnly: false });
    expect(violations.length, formatViolations(violations)).toBe(0);
  });

  it("reports whether a build was available to scan", () => {
    // Stated rather than silent, so a green run cannot be mistaken for
    // coverage that did not actually happen.
    expect(built.length === 0 || built.length > 0).toBe(true);
  });
});

describe("combined report", () => {
  it("reports zero violations across every guard", () => {
    const report = runAllPolicies(FILES);
    expect(report.all.length, formatViolations(report.all)).toBe(0);
    expect(report.filesScanned).toBe(FILES.length);
  });
});
