import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  walkTextFiles,
  findEmDashes,
  findBannedNames,
  findSecrets,
  findLocalPaths,
  runAllPolicies,
} from "@/lib/policy";
import { verbatimExcerptSchema, MAX_VERBATIM_EXCERPT_CHARS, evidenceClaimSchema, SCHEMA_VERSION } from "@/lib/schemas";
import { thesisConfigurationSchema } from "@/lib/schemas/thesis-configuration";
import { signalsConfigSchema } from "@/lib/config/schemas";
import { parseConfig, loadThesisConfig, ConfigError } from "@/lib/config/load";
import { manifestSchema, buildManifestEntry, verifyManifest } from "@/lib/domain/manifest";
import { isCutoffEligible } from "@/lib/backtest/cutoff";

/**
 * Negative tests: proving each guard detects what it claims to detect.
 *
 * A guard that passes on a clean repository proves nothing. It could be broken,
 * scanning the wrong directory, or matching a pattern that can never fire.
 * Every test here deliberately introduces the violation the guard exists to
 * catch and asserts that the guard reports it.
 *
 * Violations are constructed at run time in a temporary directory, or built
 * programmatically from character codes, so no planted violation is ever
 * committed to the repository. The temporary directories are removed after
 * each test.
 */

const created: string[] = [];

function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "davi-policy-"));
  created.push(dir);
  return dir;
}

function plant(root: string, relativePath: string, text: string): void {
  const absolutePath = join(root, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, text, "utf8");
}

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      expect(existsSync(dir), "planted violation directory was not removed").toBe(false);
    }
  }
});

/* -------------------------------------------------------------------------- */

describe("negative: the em dash guard fires", () => {
  // Built from its code point so this file never contains a literal em dash.
  const EM_DASH = String.fromCharCode(0x2014);

  it("detects a planted em dash in a markdown file", () => {
    const root = tempRepo();
    plant(root, "docs/planted.md", `A sentence with an interruption ${EM_DASH} like this.\n`);
    const violations = findEmDashes(walkTextFiles(root, { applyStandardExcludes: false }));
    expect(violations.length).toBe(1);
    expect(violations[0]?.path).toBe("docs/planted.md");
    expect(violations[0]?.rule).toBe("em_dash");
  });

  it("reports the correct line number", () => {
    const root = tempRepo();
    plant(root, "a.md", `line one\nline two\nline three ${EM_DASH} here\n`);
    const violations = findEmDashes(walkTextFiles(root, { applyStandardExcludes: false }));
    expect(violations[0]?.line).toBe(3);
  });

  it("detects every occurrence, not only the first", () => {
    const root = tempRepo();
    plant(root, "a.md", `${EM_DASH} one ${EM_DASH} two ${EM_DASH}\n`);
    expect(findEmDashes(walkTextFiles(root, { applyStandardExcludes: false })).length).toBe(3);
  });

  it("does NOT fire on an en dash, which is deliberately permitted", () => {
    // The rule is exactly U+2014. An earlier draft proposed extending it to
    // U+2013 with no justification, so the narrower rule stands.
    const root = tempRepo();
    plant(root, "a.md", `A range of 10${String.fromCharCode(0x2013)}20 percent.\n`);
    expect(findEmDashes(walkTextFiles(root, { applyStandardExcludes: false })).length).toBe(0);
  });

  it("does not fire on an ordinary hyphen", () => {
    const root = tempRepo();
    plant(root, "a.md", "A well-known growth-stage company.\n");
    expect(findEmDashes(walkTextFiles(root, { applyStandardExcludes: false })).length).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("negative: the banned-name guard fires", () => {
  it("detects a planted firm name in source", () => {
    const root = tempRepo();
    // Assembled at run time so the literal never appears in this file.
    const planted = ["PolicySentinel", "Firm"].join("");
    plant(root, "lib/planted.ts", `export const CLIENT = "${planted}";\n`);
    const violations = findBannedNames(walkTextFiles(root, { applyStandardExcludes: false }));
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.rule).toBe("banned_name");
    expect(violations[0]?.path).toBe("lib/planted.ts");
  });

  it("detects a case-insensitive entry in any casing, including a slug", () => {
    const root = tempRepo();
    const planted = ["goa", "nna"].join("");
    plant(root, "docs/a.md", `See the ${planted}-frontier repository.\n`);
    expect(findBannedNames(walkTextFiles(root, { applyStandardExcludes: false })).length).toBeGreaterThan(0);
  });

  it("detects a planted name in generated JSON", () => {
    const root = tempRepo();
    const planted = ["Match", "stick"].join("");
    plant(root, "data/generated/x.json", `{"client": "${planted}"}\n`);
    expect(findBannedNames(walkTextFiles(root, { applyStandardExcludes: false })).length).toBeGreaterThan(0);
  });

  it("detects a planted name in a public asset", () => {
    const root = tempRepo();
    const planted = ["Center", "field"].join("");
    plant(root, "public/note.svg", `<svg><title>${planted}</title></svg>\n`);
    expect(findBannedNames(walkTextFiles(root, { applyStandardExcludes: false })).length).toBeGreaterThan(0);
  });

  it("detects a planted name in built output when it is present", () => {
    const root = tempRepo();
    const planted = ["Sky", "9"].join("");
    plant(root, "build/index.html", `<p>Prepared for ${planted}</p>\n`);
    expect(findBannedNames(walkTextFiles(root, { applyStandardExcludes: false })).length).toBeGreaterThan(0);
  });

  it("respects word boundaries rather than matching substrings", () => {
    const root = tempRepo();
    // "USV" is banned; "USVI" and "unusvital" are not the banned token.
    plant(root, "a.md", "The USVI region and the word unusvital appear here.\n");
    const violations = findBannedNames(walkTextFiles(root, { applyStandardExcludes: false }));
    expect(violations.map((v) => v.detail)).toEqual([]);
  });

  it("respects case sensitivity for entries that collide with English", () => {
    const root = tempRepo();
    plant(root, "a.md", "The forester walked the property line.\n");
    expect(findBannedNames(walkTextFiles(root, { applyStandardExcludes: false })).length).toBe(0);

    const root2 = tempRepo();
    plant(root2, "b.md", "The Forester transaction closed.\n");
    expect(findBannedNames(walkTextFiles(root2, { applyStandardExcludes: false })).length).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("negative: the secret guard fires", () => {
  it("detects a token-shaped value", () => {
    const root = tempRepo();
    // A synthetic value matching the X bearer shape. Not a real credential.
    const synthetic = `AAAA${"B7cD9eF2gH4jK6mN8pQ1rS3tU5vW".repeat(2)}`;
    plant(root, "lib/planted.ts", `const token = "${synthetic}";\n`);
    const violations = findSecrets(walkTextFiles(root, { applyStandardExcludes: false }));
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.rule).toBe("secret");
  });

  it("redacts the finding rather than printing the value", () => {
    // Printing a live credential into a test log would leak it.
    const root = tempRepo();
    const synthetic = `AAAA${"Z9y8X7w6V5u4T3s2R1q0P".repeat(2)}`;
    plant(root, "a.ts", `const t = "${synthetic}";\n`);
    const violations = findSecrets(walkTextFiles(root, { applyStandardExcludes: false }));
    expect(violations[0]?.detail).toContain("redacted");
    expect(violations[0]?.detail).not.toContain(synthetic);
  });

  it("detects provider key formats", () => {
    const cases: Array<[string, string]> = [
      ["OpenAI", `sk-${"a1B2c3D4e5F6g7H8i9J0".repeat(2)}`],
      ["Anthropic", `sk-ant-${"a1B2c3D4e5F6g7H8i9J0".repeat(2)}`],
      ["GitHub", `ghp_${"a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5".slice(0, 36)}`],
      ["AWS", "AKIA1234567890ABCDEF"],
      ["Slack", `xoxb-${"1234567890-0987654321-abcdefghij"}`],
    ];
    for (const [name, value] of cases) {
      const root = tempRepo();
      plant(root, "a.ts", `const v = "${value}";\n`);
      const violations = findSecrets(walkTextFiles(root, { applyStandardExcludes: false }));
      expect(violations.length, `${name} key was not detected`).toBeGreaterThan(0);
    }
  });

  it("detects a PEM private key header", () => {
    const root = tempRepo();
    plant(root, "a.txt", "-----BEGIN RSA PRIVATE KEY-----\nabc\n");
    expect(findSecrets(walkTextFiles(root, { applyStandardExcludes: false })).length).toBeGreaterThan(0);
  });

  it("detects an assigned api key", () => {
    const root = tempRepo();
    plant(root, "a.ts", `const c = { api_key: "9f2b7c1d4e8a3f6b0c5d" };\n`);
    expect(findSecrets(walkTextFiles(root, { applyStandardExcludes: false })).length).toBeGreaterThan(0);
  });

  it("does NOT fire on a documented placeholder", () => {
    // A guard that fires on documentation pushes authors to document less.
    const root = tempRepo();
    plant(
      root,
      ".env.example",
      "# X_BEARER_TOKEN=your_x_api_bearer_token_here\n# API_KEY=<your-key-here>\n",
    );
    const violations = findSecrets(walkTextFiles(root, { applyStandardExcludes: false }));
    expect(violations.length, JSON.stringify(violations)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("negative: the local path guard fires", () => {
  it("detects a macOS home path in a public deliverable", () => {
    const root = tempRepo();
    const planted = ["/Us", "ers/someone/projects/private-archive"].join("");
    plant(root, "data/generated/x.json", `{"source": "${planted}"}\n`);
    const violations = findLocalPaths(walkTextFiles(root, { applyStandardExcludes: false }), {
      publicOnly: true,
    });
    expect(violations.length).toBe(1);
    expect(violations[0]?.rule).toBe("local_path");
  });

  it("detects a Linux home path", () => {
    const root = tempRepo();
    const planted = ["/ho", "me/someone/archive"].join("");
    plant(root, "docs/a.md", `Read from ${planted}\n`);
    expect(
      findLocalPaths(walkTextFiles(root, { applyStandardExcludes: false }), { publicOnly: true })
        .length,
    ).toBe(1);
  });

  it("detects a Windows user path", () => {
    const root = tempRepo();
    plant(root, "config/a.yaml", "path: C:\\\\Users\\\\someone\\\\archive\n");
    expect(
      findLocalPaths(walkTextFiles(root, { applyStandardExcludes: false }), { publicOnly: true })
        .length,
    ).toBeGreaterThan(0);
  });

  it("scopes the public-only check to public deliverables", () => {
    const root = tempRepo();
    const planted = ["/Us", "ers/someone/archive"].join("");
    plant(root, "scripts/dev.ts", `const dir = "${planted}";\n`);
    const files = walkTextFiles(root, { applyStandardExcludes: false });
    expect(findLocalPaths(files, { publicOnly: true }).length).toBe(0);
    expect(findLocalPaths(files, { publicOnly: false }).length).toBe(1);
  });

  it("does not fire on an ordinary relative path", () => {
    const root = tempRepo();
    plant(root, "docs/a.md", "See data/generated/MANIFEST.json and lib/policy/rules.ts\n");
    expect(
      findLocalPaths(walkTextFiles(root, { applyStandardExcludes: false }), { publicOnly: false })
        .length,
    ).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("the walker excludes .qmd local tooling state without weakening the guard", () => {
  it("skips a local path inside .qmd generated state but still flags a tracked file", () => {
    const root = tempRepo();
    const planted = ["/Us", "ers/someone/digital-asset-venture-intelligence"].join("");
    // .qmd/index.yml is exactly the QMD-generated manifest that records the
    // absolute build path. It must not be scanned.
    plant(root, ".qmd/index.yml", `collections:\n  x:\n    path: ${planted}\n`);
    // A normal tracked source file with the same local path must still fire.
    plant(root, "lib/planted.ts", `const dir = "${planted}";\n`);

    const files = walkTextFiles(root); // standard excludes ON
    expect(files.some((f) => f.path.startsWith(".qmd/"))).toBe(false);

    const violations = findLocalPaths(files, { publicOnly: false });
    expect(violations.length).toBe(1);
    expect(violations[0]?.path).toBe("lib/planted.ts");
  });

  it("does not exclude a same-named path below the root or an unrelated dotdir", () => {
    const root = tempRepo();
    const planted = ["/ho", "me/someone/archive"].join("");
    plant(root, "docs/.qmd/note.md", `See ${planted}\n`); // not root-relative ".qmd"
    plant(root, ".vscode/settings.json", `{"dir": "${planted}"}\n`); // arbitrary dotdir not exempt
    const files = walkTextFiles(root);
    const scanned = files.map((f) => f.path).sort();
    expect(scanned).toContain("docs/.qmd/note.md");
    expect(scanned).toContain(".vscode/settings.json");
    expect(findLocalPaths(files, { publicOnly: false }).length).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */

describe("negative: schema and configuration guards fire", () => {
  it("an over-length verbatim excerpt fails validation", () => {
    const over = "x".repeat(MAX_VERBATIM_EXCERPT_CHARS + 1);
    expect(verbatimExcerptSchema.safeParse(over).success).toBe(false);

    const claim = {
      id: "clm-planted",
      schemaVersion: SCHEMA_VERSION,
      companyId: "co-1",
      claim: "A claim carrying an over-length quotation.",
      sourceId: "src-1",
      sourceUrl: "https://example.com/a",
      publicationDate: "2025-01-01",
      provenance: "sourced" as const,
      sourceSubtype: "company_reported" as const,
      confidence: "medium" as const,
      topic: "customers",
      verbatimExcerpt: over,
    };
    const result = evidenceClaimSchema.safeParse(claim);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("may not exceed");
  });

  it("invalid thesis weights fail validation", () => {
    const broken = { ...loadThesisConfig() };
    broken.dimensionWeights = { ...broken.dimensionWeights, growth_momentum: 0.75 };
    const result = thesisConfigurationSchema.safeParse(broken);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("must sum to exactly 1");
  });

  it("an unknown signal id in configuration fails loudly", () => {
    expect(() =>
      parseConfig(
        "signals.yaml",
        `schemaVersion: 1
version: "1.0.0"
signals:
  - id: invented_signal_that_does_not_exist
    name: "Invented"
    category: demand
    direction: positive
    baseStrength: 0.5
    isTimeSensitive: true
    halfLifeDays: 90
    minimumEvidence: 1
    eligibleSourceTypes: [regulatory]
    description: "Should be rejected rather than silently ignored."`,
        signalsConfigSchema,
      ),
    ).toThrow(ConfigError);
  });
});

/* -------------------------------------------------------------------------- */

describe("negative: the manifest guard fires on a bad hash", () => {
  it("a tampered generated file fails verification", () => {
    const root = tempRepo();
    const original = `${JSON.stringify({ records: [{ id: "a", value: 1 }] }, null, 2)}\n`;
    const manifest = manifestSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      generatedAt: "2026-01-01T00:00:00.000Z",
      configHash: "sha256:test",
      entries: [
        buildManifestEntry({
          path: "data/generated/x.json",
          text: original,
          schemaVersion: SCHEMA_VERSION,
          generatedAt: "2026-01-01T00:00:00.000Z",
          generator: "test",
          recordCount: 1,
        }),
      ],
    });
    plant(root, "data/generated/x.json", original.replace('"value": 1', '"value": 2'));
    const result = verifyManifest(manifest, root);
    expect(result.ok).toBe(false);
    expect(result.problems[0]?.kind).toBe("hash_mismatch");
  });
});

/* -------------------------------------------------------------------------- */

describe("negative: the cutoff guard excludes a leaking event", () => {
  it("an event published before but observed after the cutoff is excluded", () => {
    // The same regression as tests/cutoff-leakage.test.ts case 2, restated
    // here so the negative-test file covers every major guard in one place.
    expect(
      isCutoffEligible(
        { publicationDate: "2025-05-01", availabilityDate: "2026-04-01" },
        "2026-01-01",
      ),
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe("negative: the combined report aggregates every planted violation", () => {
  it("reports one violation of each kind from a single planted tree", () => {
    const root = tempRepo();
    const EM_DASH = String.fromCharCode(0x2014);
    plant(root, "docs/a.md", `Interrupted ${EM_DASH} here.\n`);
    plant(root, "docs/b.md", `Using ${["PolicySentinel", "Firm"].join("")} in text.\n`);
    plant(root, "lib/c.ts", `const t = "AAAA${"Q4r5S6t7U8v9W0x1Y2z3".repeat(2)}";\n`);
    plant(root, "data/generated/d.json", `{"p": "${["/Us", "ers/someone/x"].join("")}"}\n`);

    const report = runAllPolicies(walkTextFiles(root, { applyStandardExcludes: false }));
    expect(report.emDash.length).toBe(1);
    expect(report.bannedName.length).toBe(1);
    expect(report.secret.length).toBe(1);
    expect(report.localPath.length).toBe(1);
    expect(report.all.length).toBe(4);
  });
});
