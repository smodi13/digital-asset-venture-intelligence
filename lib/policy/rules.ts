import { BANNED_NAMES, type BannedName } from "./banned-names";
import { isPublicDeliverable, type ScannedFile } from "./walker";

/**
 * The policy guards.
 *
 * Each guard takes the scanned files and returns violations. Guards never
 * throw and never repair. The test layer decides what a violation means, which
 * keeps the rules usable from a build script as well as from a test.
 */

export interface Violation {
  /** Which guard produced this. */
  rule: "em_dash" | "banned_name" | "secret" | "local_path";
  path: string;
  /** 1-indexed line number. */
  line: number;
  /** What was found, redacted where the finding is itself sensitive. */
  detail: string;
}

function lineNumberAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === "\n") line += 1;
  }
  return line;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* -------------------------------------------------------------------------- */
/* Em dash                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The em dash, U+2014. The single prohibited character.
 *
 * Referenced by code point rather than written literally so that this file can
 * describe the rule without violating it.
 *
 * The en dash, U+2013, is deliberately NOT prohibited. An earlier draft
 * proposed extending the rule to cover it; no justification was offered for
 * that expansion, so the rule stays exactly as narrow as it was specified.
 */
export const EM_DASH = String.fromCharCode(0x2014);

export function findEmDashes(files: readonly ScannedFile[]): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    let index = file.text.indexOf(EM_DASH);
    while (index !== -1) {
      violations.push({
        rule: "em_dash",
        path: file.path,
        line: lineNumberAt(file.text, index),
        detail: "em dash (U+2014) is prohibited; use a comma, colon, parenthesis, or hyphen",
      });
      index = file.text.indexOf(EM_DASH, index + 1);
    }
  }
  return violations;
}

/* -------------------------------------------------------------------------- */
/* Banned names                                                               */
/* -------------------------------------------------------------------------- */

function bannedNameRegExp(entry: BannedName): RegExp {
  // Word bounded, never substring. Interior spaces are allowed so that a
  // two-word firm name is matched as a phrase.
  const flags = entry.caseSensitive ? "g" : "gi";
  return new RegExp(`\\b${escapeRegExp(entry.term)}\\b`, flags);
}

export function findBannedNames(
  files: readonly ScannedFile[],
  names: readonly BannedName[] = BANNED_NAMES,
): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    for (const entry of names) {
      const pattern = bannedNameRegExp(entry);
      let match = pattern.exec(file.text);
      while (match !== null) {
        violations.push({
          rule: "banned_name",
          path: file.path,
          line: lineNumberAt(file.text, match.index),
          detail: `"${match[0]}" is not permitted (${entry.reason})`,
        });
        match = pattern.exec(file.text);
      }
    }
  }
  return violations;
}

/* -------------------------------------------------------------------------- */
/* Secrets                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Credential shapes.
 *
 * Adapted and extended from the sanitization guard in prior work, which
 * aborted a build if a secret shape reached generated output. Extended here
 * with the provider prefixes that project did not cover.
 *
 * Each entry is deliberately specific to a credential format rather than
 * matching anything long and random, because a guard that fires constantly is
 * a guard people learn to skip.
 */
export const SECRET_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "X bearer token body", pattern: /\bAAAA[A-Za-z0-9%]{28,}/g },
  { name: "OpenAI key", pattern: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { name: "Anthropic key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "GitHub token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/g },
  { name: "GitHub fine-grained token", pattern: /\bgithub_pat_[A-Za-z0-9_]{50,}/g },
  { name: "Vercel token", pattern: /\bvercel_[A-Za-z0-9]{20,}/g },
  { name: "AWS access key id", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { name: "PEM private key", pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g },
  {
    name: "Authorization bearer value",
    pattern: /\bauthorization\s*[:=]\s*["']?bearer\s+[A-Za-z0-9._~+/-]{20,}/gi,
  },
  {
    name: "assigned API key",
    pattern:
      /\b(?:api[_-]?key|apikey|client[_-]?secret|access[_-]?token|bearer[_-]?token|secret[_-]?key)\s*[:=]\s*["'][^"'\s]{16,}["']/gi,
  },
];

/**
 * Documented placeholders that must not be reported.
 *
 * A .env.example that names a variable, or a schema that documents a token
 * shape, is the correct way to communicate a requirement. Flagging it would
 * push authors toward documenting less, which is the opposite of the goal.
 */
const PLACEHOLDER_PATTERN =
  /\b(?:your[_-]?\w*|example|placeholder|redacted|dummy|sample|fake|xxx+|<[^>]+>|\.\.\.)\b/i;

export function findSecrets(files: readonly ScannedFile[]): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    for (const { name, pattern } of SECRET_PATTERNS) {
      const scan = new RegExp(pattern.source, pattern.flags);
      let match = scan.exec(file.text);
      while (match !== null) {
        const found = match[0];
        if (!PLACEHOLDER_PATTERN.test(found)) {
          violations.push({
            rule: "secret",
            path: file.path,
            line: lineNumberAt(file.text, match.index),
            // The finding is redacted. Reporting a live credential in a test
            // log, in CI output, or in a terminal transcript would leak it.
            detail: `possible ${name} (value redacted, ${found.length} characters)`,
          });
        }
        match = scan.exec(file.text);
      }
    }
  }
  return violations;
}

/* -------------------------------------------------------------------------- */
/* Local paths                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Absolute paths from the author's machine.
 *
 * These leak a real name and a directory layout, and they make generated
 * artifacts unreproducible on any other machine. Public deliverables may never
 * contain one. Development scripts may reference a path only when genuinely
 * necessary, and should prefer an environment-supplied value.
 */
export const LOCAL_PATH_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "macOS home path", pattern: /\/Users\/[A-Za-z0-9._-]+/g },
  { name: "Linux home path", pattern: /\/home\/[A-Za-z0-9._-]+/g },
  { name: "Windows user path", pattern: /[A-Za-z]:\\+Users\\+[A-Za-z0-9._-]+/g },
];

export interface LocalPathOptions {
  /**
   * Restrict to public deliverables.
   *
   * True is the strict reading used for generated data, documentation,
   * configuration, and built output. False scans everything, which is how the
   * repository-wide check reports development-script references as well.
   */
  publicOnly?: boolean;
}

export function findLocalPaths(
  files: readonly ScannedFile[],
  options: LocalPathOptions = {},
): Violation[] {
  const publicOnly = options.publicOnly ?? false;
  const violations: Violation[] = [];
  for (const file of files) {
    if (publicOnly && !isPublicDeliverable(file.path)) continue;
    for (const { name, pattern } of LOCAL_PATH_PATTERNS) {
      const scan = new RegExp(pattern.source, pattern.flags);
      let match = scan.exec(file.text);
      while (match !== null) {
        violations.push({
          rule: "local_path",
          path: file.path,
          line: lineNumberAt(file.text, match.index),
          detail: `${name} present; use an environment-supplied path instead`,
        });
        match = scan.exec(file.text);
      }
    }
  }
  return violations;
}

/* -------------------------------------------------------------------------- */
/* Combined                                                                   */
/* -------------------------------------------------------------------------- */

export interface PolicyReport {
  emDash: Violation[];
  bannedName: Violation[];
  secret: Violation[];
  localPath: Violation[];
  all: Violation[];
  filesScanned: number;
}

export function runAllPolicies(files: readonly ScannedFile[]): PolicyReport {
  const emDash = findEmDashes(files);
  const bannedName = findBannedNames(files);
  const secret = findSecrets(files);
  const localPath = findLocalPaths(files, { publicOnly: true });
  return {
    emDash,
    bannedName,
    secret,
    localPath,
    all: [...emDash, ...bannedName, ...secret, ...localPath],
    filesScanned: files.length,
  };
}

/** A readable multi-line summary of violations, for a test failure message. */
export function formatViolations(violations: readonly Violation[], limit = 20): string {
  if (violations.length === 0) return "none";
  const shown = violations
    .slice(0, limit)
    .map((v) => `  ${v.path}:${v.line}  [${v.rule}] ${v.detail}`)
    .join("\n");
  const extra = violations.length > limit ? `\n  ...and ${violations.length - limit} more` : "";
  return `\n${shown}${extra}`;
}
