import type { FeedItem } from "./parse";
import { normalizeDomain } from "@/lib/research/entity/normalize";
import { isNoiseHeadline } from "./relevance";

/**
 * Deterministic, conservative company identity extraction from a feed item.
 *
 * No language model. The method is the least speculative one that fits a news
 * headline: match a small table of financing / launch verb phrases and take the
 * proper-noun subject that precedes the verb. A headline that does not match a
 * phrase still becomes a candidate, but with identityConfidence "needs_review"
 * and the raw headline as the name, so a human resolves it rather than the
 * parser guessing.
 *
 * Arbitrary nouns are not turned into companies: the subject must look like a
 * name (leading capital, mostly capitalised words, bounded length).
 */

export interface Extraction {
  name: string;
  domain: string | null;
  description: string | null;
  identityConfidence: "confirmed" | "probable" | "needs_review";
  discoveryReason: string;
}

/** Verb phrases that reliably put a company name at the start of a headline. */
const REASON_PHRASES: ReadonlyArray<{ re: RegExp; reason: string }> = [
  { re: /\b(raises?|raised|closes?|closed|lands?|landed|secures?|secured|nabs?|snags?|bags?|picks up|scores?|hauls in|pulls in|grabs?|extends?|tops up|adds to|gets? (?:backing|funding))\b/i, reason: "funding announcement" },
  { re: /\bseries [a-e]\b/i, reason: "private-market financing round" },
  { re: /\bseed (round|funding)\b/i, reason: "seed financing" },
  { re: /\b(launches?|launched|unveils?|unveiled|debuts?|emerges? from stealth|comes out of stealth|introduces?|goes live|go live|rolls? out|rolled out|brings?|builds?|expands?)\b/i, reason: "product or company launch" },
  { re: /\bpartners? with\b/i, reason: "partnership announcement" },
  { re: /\b(valued at|valuation)\b/i, reason: "private-market valuation context" },
  { re: /\b(acquires?|acquired|to acquire|buys?)\b/i, reason: "acquisition activity" },
];

/** Sector/technology words used as a headline prefix before a noun ("Stablecoin startup Acme..."). */
const DESCRIPTOR_WORD =
  "(?:ai|fintech|biotech|healthtech|nuclear|climate|defense|defence|robotics|crypto|cryptocurrency|blockchain|web3|defi|depin|zk|stablecoin|tokeniz(?:ation|ed)|onchain|on-chain|custody|wallet|oracle|validator|layer\\s?2|l2|rollup|quantum|cybersecurity|security|enterprise|dev\\s?tools?|developer|data|space|energy|hardware|software|edtech|proptech|insurtech|legal\\s?tech|logistics)";

const LEADING_DESCRIPTORS = new RegExp(
  `^(?:the\\s+)?(?:${DESCRIPTOR_WORD}\\s+){1,2}(?:startup|company|firm|maker|platform|lab|network|protocol|foundation)\\s+`,
  "i",
);

/** A single label word standing directly in front of the entity name ("Protocol Nova launches..."). */
const LEADING_LABEL = /^(?:protocol|network|platform|exchange|wallet|foundation)\s+(?=[A-Z])/i;

const SENTENCE_LEADERS = new Set([
  "a", "an", "at", "the", "this", "that", "these", "those", "how", "why", "what",
  "when", "where", "who", "meet", "inside", "with", "as", "after", "before",
  "former", "ex", "two", "three", "four", "five", "startup", "startups",
]);

const GENERIC_NAMES = new Set([
  "ai", "vc", "the", "startup", "startups", "founders", "investors", "tech",
  "venture", "capital", "funding", "report", "week", "market",
  // Regulators, legislatures, and conference brands: never a sourcing candidate.
  "fed", "sec", "irs", "ftc", "doj", "ecb", "imf", "cftc", "fca",
  "treasury", "senate", "congress", "white house", "consensus",
]);

/** A token that plausibly belongs to a company name. */
function looksLikeNameToken(tok: string): boolean {
  return /^[A-Z0-9][A-Za-z0-9.&'\-]*$/.test(tok) || /^(&|and|of|the|for)$/i.test(tok);
}

function extractSubject(title: string): { name: string; verbMatched: boolean } | null {
  let head = title.replace(LEADING_DESCRIPTORS, "").replace(LEADING_LABEL, "").trim();

  let cut = head.length;
  let verbMatched = false;
  for (const { re } of REASON_PHRASES) {
    const m = head.match(re);
    if (m && m.index !== undefined && m.index < cut) {
      cut = m.index;
      verbMatched = true;
    }
  }
  // No known financing/launch/partnership verb: many crypto-native
  // publications write headlines in Title Case, where every word (including
  // ordinary verbs like "Bans", "Leaks", "Says", "Want") is capitalized. A
  // capitalized-token-shape match alone cannot then tell a company name from
  // an ordinary Title Case sentence, so an unresolved identity is the honest
  // answer here rather than a guess (needs_review, never "probable").
  if (!verbMatched) return null;

  // Also stop at "reportedly", "said to", a comma, a colon, a parenthetical, or a spaced dash.
  for (const stop of [/\breportedly\b/i, /\bis said to\b/i, /,/, /:/, /\s[-\u2013\u2014]\s/, /\(/]) {
    const m = head.match(stop);
    if (m && m.index !== undefined && m.index < cut) cut = m.index;
  }

  head = head.slice(0, cut).trim().replace(/[\s,:-]+$/, "");
  if (!head) return null;

  const tokens = head.split(/\s+/);
  if (tokens.length === 0 || tokens.length > 6) return null;
  if (!tokens.every(looksLikeNameToken)) return null;
  if (!/[A-Za-z]/.test(tokens[0]!) || tokens[0]![0] !== tokens[0]![0]!.toUpperCase()) return null;

  // A leading sentence word ("How Sweden built...", "At TechBBQ...", "This
  // startup...") means the headline is prose, not "<Company> <verb>".
  if (SENTENCE_LEADERS.has(tokens[0]!.toLowerCase())) return null;

  const name = tokens.join(" ").replace(/^(and|of|the|for)\s+/i, "").trim();
  if (name.length < 3 || name.length > 60) return null;
  // A bare generic word or acronym is not an identity.
  if (GENERIC_NAMES.has(name.toLowerCase())) return null;
  return { name, verbMatched };
}

export function extractCandidate(item: FeedItem): Extraction | null {
  // Event promo, roundups, listicles, and interviews never name a credible
  // candidate, even when a token in the headline happens to look like a name.
  if (isNoiseHeadline(item.title)) return null;

  const subject = extractSubject(item.title);

  let reason = "private-market news mention";
  for (const { re, reason: r } of REASON_PHRASES) {
    if (re.test(item.title)) {
      reason = r;
      break;
    }
  }

  // A domain is only claimed when the feed item's own categories or summary
  // carry a bare registrable domain; a news article link is the publisher's
  // domain, never the company's, so it is not used.
  const domain = findDomain([item.summary ?? "", ...item.categories]);

  if (!subject) {
    return {
      name: item.title.slice(0, 120),
      domain,
      description: item.summary,
      identityConfidence: "needs_review",
      discoveryReason: reason,
    };
  }

  return {
    name: subject.name,
    domain,
    description: item.summary,
    identityConfidence: subject.verbMatched ? "confirmed" : "probable",
    discoveryReason: reason,
  };
}

function findDomain(parts: string[]): string | null {
  for (const part of parts) {
    const m = part.match(/\b([a-z0-9-]+\.(?:com|io|ai|co|dev|app|xyz|net|org|so|tech))\b/i);
    if (m) {
      const norm = normalizeDomain(m[1]!);
      if (norm) return norm;
    }
  }
  return null;
}
