/**
 * Company name and domain normalisation.
 *
 * These are two different operations and keeping them separate is the point.
 * The prior sourcing engine this reimplements made the same distinction, and
 * it exists because the two answer different questions.
 *
 * Name normalisation strips corporate suffixes, because "Acme Inc" and "Acme
 * Labs" are usually the same company written twice.
 *
 * Domain normalisation deliberately does NOT strip those words, because
 * acme.ai and acme-labs.io are usually two different companies. Applying name
 * rules to domains merges companies that merely sound alike, and that is the
 * single most damaging error an entity resolver can make: once two companies
 * are merged, no downstream check can tell they were ever separate.
 */

/** Words that carry no identity in a company name. */
const NAME_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "co",
  "corp",
  "corporation",
  "plc",
  "gmbh",
  "sa",
  "sas",
  "bv",
  "ab",
  "oy",
  "pty",
  "labs",
  "lab",
  "technologies",
  "technology",
  "tech",
  "systems",
  "software",
  "solutions",
  "group",
  "holdings",
  "the",
]);

/**
 * A normalised company name for comparison.
 *
 * Lowercased, punctuation removed, corporate suffix words dropped, whitespace
 * collapsed. Returns the un-stripped form when stripping would leave nothing,
 * so a company genuinely called "Systems" does not normalise to an empty key.
 */
export function normalizeCompanyName(raw: string): string {
  const cleaned = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const kept = cleaned.split(" ").filter((word) => !NAME_SUFFIXES.has(word));
  const stripped = kept.join("");
  return stripped.length > 0 ? stripped : cleaned.replace(/\s/g, "");
}

/**
 * A normalised registrable host.
 *
 * Scheme, credentials, port, path, and a leading www are removed. Corporate
 * suffix words are NOT removed, and no substring logic is applied anywhere.
 * Returns null when the input is not a usable host.
 */
export function normalizeDomain(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let host = raw.trim().toLowerCase();
  if (!host) return null;
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  } else {
    const slash = host.indexOf("/");
    if (slash !== -1) host = host.slice(0, slash);
  }
  const at = host.indexOf("@");
  if (at !== -1) host = host.slice(at + 1);
  const colon = host.indexOf(":");
  if (colon !== -1) host = host.slice(0, colon);
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  if (!host || !host.includes(".")) return null;
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  return host;
}

/**
 * Whether a candidate host is the same site as a registered domain.
 *
 * Equality, or a subdomain separated by a dot boundary. Never a substring
 * test: "notacme.com" must not match "acme.com", and it would under any
 * endsWith check that omitted the dot. This is the specific bug the dot
 * boundary exists to prevent.
 */
export function isSameSite(candidate: string, registered: string): boolean {
  if (candidate === registered) return true;
  return candidate.endsWith(`.${registered}`);
}

/**
 * A dedup key derived from a domain's registrable label.
 *
 * Collapses subdomains of one site while keeping distinct sites apart:
 * docs.acme.ai and acme.ai share a key, acme.ai and acme-labs.io do not.
 * Deliberately does not strip suffix words, unlike name normalisation.
 */
export function domainKey(raw: string | null | undefined): string | null {
  const host = normalizeDomain(raw);
  if (host === null) return null;
  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return null;
  // Second-level label. Sufficient at our scale; a public-suffix list would be
  // needed to handle co.uk style domains correctly, and none is in the corpus.
  return labels[labels.length - 2] ?? null;
}

/** Normalise an alias for comparison. Uses name rules, not domain rules. */
export function normalizeAlias(raw: string): string {
  return normalizeCompanyName(raw);
}
