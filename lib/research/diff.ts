/**
 * Deterministic text diff for page snapshots.
 *
 * Sufficient for a future Company Change Radar, and no more. Reconnaissance
 * considered depending on a mature change-detection product and rejected it:
 * it is a self-hosted server with a browser fleet, which would break the
 * requirement that the core demo work with no external service.
 *
 * WHAT THIS DELIBERATELY DOES NOT SOLVE
 *
 * Arbitrary web page diffing. A page's navigation, footer, cookie banner, and
 * rotating testimonial will change constantly and mean nothing. The answer is
 * not a cleverer diff, it is to compare a configured REGION of a page and to
 * normalise aggressively before comparing. A diff that reports every change is
 * as useless as one that reports none.
 */

export interface NormalizationOptions {
  /** Lines matching any of these are dropped before comparison. */
  boilerplatePatterns?: string[];
  /** Patterns replaced with a placeholder, for known dynamic content. */
  dynamicPatterns?: string[];
  /** Lowercase before comparing. Off by default: case changes can be real. */
  caseInsensitive?: boolean;
}

/**
 * Normalise text for comparison.
 *
 * Collapses whitespace, drops empty lines, removes configured boilerplate, and
 * masks configured dynamic content. Everything it removes has to be configured
 * explicitly, so a change is never hidden by a rule nobody chose.
 */
export function normalizeText(
  raw: string,
  options: NormalizationOptions = {},
): string {
  let text = raw.replace(/\r\n?/g, "\n");

  for (const pattern of options.dynamicPatterns ?? []) {
    text = text.replace(new RegExp(pattern, "g"), "[dynamic]");
  }

  const boilerplate = (options.boilerplatePatterns ?? []).map(
    (pattern) => new RegExp(pattern, "i"),
  );

  const lines = text
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .filter((line) => !boilerplate.some((rx) => rx.test(line)));

  const joined = lines.join("\n");
  return options.caseInsensitive ? joined.toLowerCase() : joined;
}

/** A capped snippet, so a diff never carries an article body. */
const MAX_SNIPPET_CHARS = 280;
const MAX_SNIPPETS = 10;

function cap(text: string): string {
  return text.length <= MAX_SNIPPET_CHARS
    ? text
    : `${text.slice(0, MAX_SNIPPET_CHARS - 3)}...`;
}

export interface TextDiff {
  changed: boolean;
  /** Lines present in the new text and not the old. Capped. */
  addedText: string[];
  /** Lines present in the old text and not the new. Capped. */
  removedText: string[];
  /**
   * Share of lines that changed, 0 to 1.
   *
   * Measured against the larger of the two line counts, so replacing a whole
   * page reads as 1 rather than as an unbounded ratio.
   */
  changeMagnitude: number;
  previousHash: string;
  currentHash: string;
  /** True when the texts differ only in whitespace or dropped boilerplate. */
  whitespaceOnly: boolean;
  /** Counts before capping, so a truncated diff still reports its true size. */
  addedCount: number;
  removedCount: number;
}

import { sha256Hex } from "@/lib/hash/canonical";

/** Hash of the normalised text. Two pages with the same content share a hash. */
export function normalizedTextHash(
  raw: string,
  options: NormalizationOptions = {},
): string {
  return sha256Hex(normalizeText(raw, options));
}

/** Hash of the raw bytes, before normalisation. */
export function rawContentHash(raw: string): string {
  return sha256Hex(raw);
}

/**
 * Compare two versions of a page region.
 *
 * Line based rather than character based, because the question is "what
 * changed on this page", and a line is the smallest unit a reader can act on.
 */
export function diffText(
  previous: string,
  current: string,
  options: NormalizationOptions = {},
): TextDiff {
  const previousNormalized = normalizeText(previous, options);
  const currentNormalized = normalizeText(current, options);

  const previousHash = sha256Hex(previousNormalized);
  const currentHash = sha256Hex(currentNormalized);

  if (previousNormalized === currentNormalized) {
    return {
      changed: false,
      addedText: [],
      removedText: [],
      changeMagnitude: 0,
      previousHash,
      currentHash,
      // Only whitespace-only if the raw text actually differed.
      whitespaceOnly: previous !== current,
      addedCount: 0,
      removedCount: 0,
    };
  }

  const previousLines = previousNormalized ? previousNormalized.split("\n") : [];
  const currentLines = currentNormalized ? currentNormalized.split("\n") : [];

  // Multiset difference: a line repeated three times and then twice counts as
  // one removal, which a plain Set would miss.
  const previousCounts = countLines(previousLines);
  const currentCounts = countLines(currentLines);

  const added: string[] = [];
  for (const line of currentLines) {
    const remaining = previousCounts.get(line) ?? 0;
    if (remaining > 0) previousCounts.set(line, remaining - 1);
    else added.push(line);
  }

  const removed: string[] = [];
  for (const line of previousLines) {
    const remaining = currentCounts.get(line) ?? 0;
    if (remaining > 0) currentCounts.set(line, remaining - 1);
    else removed.push(line);
  }

  const denominator = Math.max(previousLines.length, currentLines.length, 1);
  const changeMagnitude =
    Math.round((Math.max(added.length, removed.length) / denominator) * 1000) / 1000;

  return {
    changed: true,
    addedText: added.slice(0, MAX_SNIPPETS).map(cap),
    removedText: removed.slice(0, MAX_SNIPPETS).map(cap),
    changeMagnitude: Math.min(changeMagnitude, 1),
    previousHash,
    currentHash,
    whitespaceOnly: false,
    addedCount: added.length,
    removedCount: removed.length,
  };
}

function countLines(lines: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}
