import { sha256Hex } from "@/lib/hash/canonical";

/**
 * Deterministic identifier generation.
 *
 * Researchers write company names and source URLs. They do not type internal
 * ids, and they certainly do not type hashes. Ids are derived here from the
 * fields that actually identify a record, so the same research input always
 * produces the same corpus and a regenerated file diffs cleanly.
 *
 * Two properties matter and both are tested.
 *
 * Determinism: the same inputs always yield the same id, across runs and
 * machines. Anything else would make the manifest hash meaningless.
 *
 * Stability under reordering: an id never depends on a record's position in a
 * file. Inserting a company at the top of companies.yaml must not renumber
 * everything below it, because that would turn a one-line research edit into a
 * whole-corpus diff and would break every stored reference.
 */

/** A short, stable hash suffix. Long enough to avoid collision at our scale. */
function shortHash(input: string): string {
  return sha256Hex(input).slice(0, 10);
}

/**
 * Convert arbitrary text into an id-safe slug.
 *
 * Lowercase, alphanumeric and hyphens only, no leading or trailing hyphen.
 * Returns an empty string when nothing survives, which callers must handle
 * rather than silently accepting.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The company id.
 *
 * Derived from the domain when there is one, because a domain is the strongest
 * identity a private company has and it survives a rename. Falls back to the
 * name slug, with a hash suffix so two companies sharing a slug stay distinct.
 */
export function companyId(input: { name: string; domain: string | null }): string {
  if (input.domain) {
    const slug = slugify(input.domain.replace(/\./g, "-"));
    if (slug) return `co-${slug}`;
  }
  const slug = slugify(input.name);
  if (!slug) {
    throw new Error("companyId: a company must have a name that produces a slug.");
  }
  return `co-${slug}-${shortHash(input.name)}`;
}

/** The person id. Name plus company, since names are not unique. */
export function personId(input: { name: string; companyId: string | null }): string {
  const slug = slugify(input.name);
  if (!slug) {
    throw new Error("personId: a person must have a name that produces a slug.");
  }
  return `per-${slug}-${shortHash(`${input.name}|${input.companyId ?? ""}`)}`;
}

/**
 * The source record id.
 *
 * Derived from the URL alone where there is one, so two research entries
 * citing the same page resolve to one SourceRecord rather than two. That is
 * what makes the independence check work: counting a page twice would count
 * one voice twice.
 */
export function sourceId(input: { url: string | null; publisher: string; title: string }): string {
  if (input.url) return `src-${shortHash(normalizeUrlForIdentity(input.url))}`;
  return `src-${shortHash(`${input.publisher}|${input.title}`)}`;
}

/**
 * Normalise a URL for identity purposes.
 *
 * Scheme and host case, a trailing slash, a default port, and common tracking
 * parameters do not change which page a URL points at. Anything else is left
 * alone: query parameters often do identify a distinct page.
 */
export function normalizeUrlForIdentity(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return raw.trim().toLowerCase();
  }
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  parsed.hash = "";
  const tracking = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "fbclid",
    "ref",
  ];
  for (const key of tracking) parsed.searchParams.delete(key);
  parsed.searchParams.sort();
  let out = parsed.toString();
  if (out.endsWith("/") && parsed.pathname !== "/") out = out.slice(0, -1);
  return out;
}

/**
 * The evidence claim id.
 *
 * Derived from the company, the source, and the claim text. Two researchers
 * recording the same claim from the same source produce the same id, which is
 * what makes a re-run idempotent rather than duplicative.
 */
export function evidenceClaimId(input: {
  companyId: string;
  sourceId: string | null;
  claim: string;
  /** Used in place of sourceId when the claim has no source (analyst assumption). */
  assessmentKey?: string | null;
}): string {
  const key = input.sourceId ?? `assess:${input.assessmentKey ?? "unsourced"}`;
  return `clm-${shortHash(`${input.companyId}|${key}|${input.claim.trim()}`)}`;
}

/**
 * The signal event id.
 *
 * Company, source, type, and publication date, plus an optional discriminator.
 *
 * The discriminator exists because the first real corpus contained two of
 * them: one company shipped two distinct product launches, reported by one
 * source on one day. Company, source, type, and date were identical, so the
 * two collided into one id and the build failed loudly, which is the correct
 * failure but the wrong outcome. Both events are real and separate.
 *
 * The discriminator is the originating research record's own stable id, so
 * ids stay deterministic across runs and still do not depend on a record's
 * position in a file.
 */
export function signalEventId(input: {
  companyKey: string;
  sourceId: string;
  signalType: string;
  publicationDate: string | null;
  discriminator?: string | null;
}): string {
  const parts = [
    input.companyKey,
    input.sourceId,
    input.signalType,
    input.publicationDate ?? "undated",
  ];
  if (input.discriminator) parts.push(input.discriminator);
  return `evt-${shortHash(parts.join("|"))}`;
}

/** The snapshot id. One per company page per observation. */
export function snapshotId(input: {
  companyId: string;
  url: string;
  observedAt: string;
}): string {
  return `snap-${shortHash(
    `${input.companyId}|${normalizeUrlForIdentity(input.url)}|${input.observedAt}`,
  )}`;
}
