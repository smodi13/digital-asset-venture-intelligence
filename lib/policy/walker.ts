import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * The policy file walker.
 *
 * Every guard in this project scans the same set of files through this one
 * walker, rather than each writing its own find command. Prior work scattered
 * these checks across three separate scripts with three different notions of
 * which files counted, which meant a guard could silently stop covering a
 * directory that had been added since it was written.
 */

/** Extensions that can carry visible copy, configuration, or a credential. */
export const TEXT_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".mdx",
  ".yaml",
  ".yml",
  ".css",
  ".txt",
  ".html",
  ".svg",
] as const;

/**
 * Text-bearing files with no scanned extension.
 *
 * .env.example is the important one: it is exactly the file where a credential
 * would be committed by mistake, and an extension-only scan would miss it.
 */
export const INCLUDED_FILENAMES = new Set([".env.example", "LICENSE", "NOTICE"]);

/** Directory names never scanned, at any depth. Vendored code and build caches are not our copy. */
export const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "out",
  "coverage",
  ".vitest",
  "test-results",
  "playwright-report",
  ".vercel",
]);

/**
 * Directory paths never scanned, matched relative to the scan root.
 *
 * research/imports holds the raw human-to-engineering handoff packets:
 * unreviewed third-party material, gitignored, never published, whose reviewed
 * form lives in research/input. graphify-out is local knowledge-graph tooling
 * output, also gitignored. .qmd is the project-local QMD search index: gitignored
 * generated tooling state (a YAML manifest plus a SQLite database) that records
 * the absolute repository path on the machine that built it. local-artifacts is
 * the project's designated scratch/QA/review output directory (see CLAUDE.md):
 * gitignored, never committed, never deployed. None of the four is this
 * project's copy and none ships; scanning any of them would flag a company
 * name, a stray character, or a local path in material the project never
 * publishes.
 */
export const EXCLUDED_DIR_PATHS = new Set(["research/imports", "graphify-out", ".qmd", "local-artifacts"]);

/**
 * Files excluded from scanning, with the reason.
 *
 * The lock file is excluded because its integrity hashes are not visible copy
 * and produce meaningless matches. The policy definition files are excluded
 * because they must contain the very strings they exist to detect, which is
 * the same exemption prior integrity suites made for themselves.
 */
export const EXCLUDED_FILES: ReadonlyArray<{ path: string; reason: string }> = [
  { path: "package-lock.json", reason: "dependency integrity hashes are not visible copy" },
  { path: "lib/policy/banned-names.ts", reason: "defines the terms the guard detects" },
  { path: "lib/policy/rules.ts", reason: "defines the patterns the guard detects" },
  { path: "tests/policy-negative.test.ts", reason: "plants deliberate violations to prove the guards work" },
  { path: ".claude/settings.local.json", reason: "gitignored, machine-local Claude Code permissions, never committed or published" },
];

const EXCLUDED_FILE_PATHS = new Set(EXCLUDED_FILES.map((f) => f.path));

export interface ScannedFile {
  /** Absolute path on disk. */
  absolutePath: string;
  /** Path relative to the scan root, always with forward slashes. */
  path: string;
  text: string;
}

export interface WalkOptions {
  /** Additional relative paths to skip, on top of EXCLUDED_FILES. */
  additionalExcludes?: readonly string[];
  /** Restrict to these extensions. Defaults to TEXT_EXTENSIONS. */
  extensions?: readonly string[];
  /** Apply the standard exclusion list. Defaults to true. */
  applyStandardExcludes?: boolean;
}

function toPosix(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

/** Collect every text-bearing file under a root, with its contents. */
export function walkTextFiles(root: string, options: WalkOptions = {}): ScannedFile[] {
  const extensions = options.extensions ?? TEXT_EXTENSIONS;
  const applyStandard = options.applyStandardExcludes ?? true;
  const additional = new Set(options.additionalExcludes ?? []);
  const files: ScannedFile[] = [];

  if (!existsSync(root)) return files;

  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (EXCLUDED_DIRS.has(entry)) continue;
      const absolutePath = join(dir, entry);
      let stats;
      try {
        stats = statSync(absolutePath);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        if (applyStandard && EXCLUDED_DIR_PATHS.has(toPosix(relative(root, absolutePath)))) continue;
        visit(absolutePath);
        continue;
      }
      const matchesExtension = extensions.some((ext) => entry.endsWith(ext));
      if (!matchesExtension && !INCLUDED_FILENAMES.has(entry)) continue;

      const path = toPosix(relative(root, absolutePath));
      if (applyStandard && EXCLUDED_FILE_PATHS.has(path)) continue;
      if (additional.has(path)) continue;

      let text: string;
      try {
        text = readFileSync(absolutePath, "utf8");
      } catch {
        continue;
      }
      files.push({ absolutePath, path, text });
    }
  };

  visit(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * The subset of files that are public deliverables.
 *
 * Generated data, documentation, configuration, and built output are held to
 * the strictest reading of the local-path rule, because these are the files a
 * reader actually receives.
 */
export function isPublicDeliverable(path: string): boolean {
  return (
    path.startsWith("data/generated/") ||
    path.startsWith("docs/") ||
    path.startsWith("public/") ||
    path.startsWith("config/") ||
    path === "README.md"
  );
}
