import type {
  SignalCategory,
  SignalDirection,
  SignalType,
} from "@/lib/schemas/signal-event";

/**
 * Deterministic headline pattern matcher.
 *
 * Reimplements the useful idea from a prior deterministic sourcing engine: a
 * compact phrase table mapping known event verbs to signal types, applied to
 * headlines about companies already in the universe.
 *
 * No language model is involved. Every classification here can be explained by
 * pointing at the phrase that produced it, which is what
 * config/scoring.yaml's auditability requirement demands and what an LLM
 * classification could not provide.
 *
 * WHY A PHRASE TABLE IS ENOUGH
 *
 * Reconnaissance considered a general NLP library for this and rejected it.
 * Its weakest case is exactly ours: recognising single-word startup names as
 * organisations. But company resolution is a SEPARATE step here, working
 * against a known universe, so the matcher never has to identify a company. It
 * only has to recognise what happened, and the vocabulary of corporate
 * announcements is small and stable.
 *
 * WHAT THIS RETURNS AND WHAT IT DOES NOT
 *
 * It returns a candidate signal, a confidence, and the phrase it matched. It
 * never returns an investment score. A proposal below the acceptance threshold
 * goes to the review queue rather than into the corpus.
 */

export interface HeadlinePattern {
  /** The phrase, matched case-insensitively on word boundaries. */
  phrase: string;
  signalType: SignalType;
  category: SignalCategory;
  direction: SignalDirection;
  /** Confidence that this phrase means this signal, 0 to 1. */
  confidence: number;
  /**
   * Phrases that, if also present, invalidate this match.
   *
   * "raises concerns" is not a financing event. Without negative context a
   * verb table produces confident nonsense on ordinary English.
   */
  notWhen?: string[];
}

/**
 * The phrase table.
 *
 * Ordered by specificity: longer, more specific phrases are checked first, so
 * "partners with" wins over "partners" and "steps down" over "down".
 * Confidence reflects how reliably the phrase indicates the signal, not how
 * important the signal is.
 */
export const HEADLINE_PATTERNS: readonly HeadlinePattern[] = [
  // Capital
  { phrase: "raises", signalType: "funding", category: "capital", direction: "ambiguous", confidence: 0.9, notWhen: ["raises concerns", "raises questions", "raises doubts", "raises prices"] },
  { phrase: "closes funding", signalType: "funding", category: "capital", direction: "ambiguous", confidence: 0.9 },
  { phrase: "secures funding", signalType: "funding", category: "capital", direction: "ambiguous", confidence: 0.9 },
  { phrase: "series a", signalType: "funding", category: "capital", direction: "ambiguous", confidence: 0.85 },
  { phrase: "series b", signalType: "funding", category: "capital", direction: "ambiguous", confidence: 0.85 },
  { phrase: "series c", signalType: "funding", category: "capital", direction: "ambiguous", confidence: 0.85 },

  // Product
  { phrase: "launches", signalType: "product_launch", category: "product", direction: "positive", confidence: 0.85 },
  { phrase: "introduces", signalType: "product_launch", category: "product", direction: "positive", confidence: 0.8 },
  { phrase: "unveils", signalType: "product_launch", category: "product", direction: "positive", confidence: 0.8 },
  { phrase: "ships", signalType: "product_launch", category: "product", direction: "positive", confidence: 0.75 },
  { phrase: "releases", signalType: "product_launch", category: "product", direction: "positive", confidence: 0.7 },
  { phrase: "general availability", signalType: "product_launch", category: "product", direction: "positive", confidence: 0.85 },

  // Pricing
  { phrase: "raises prices", signalType: "pricing_change", category: "product", direction: "positive", confidence: 0.85 },
  { phrase: "new pricing", signalType: "pricing_change", category: "product", direction: "positive", confidence: 0.8 },
  { phrase: "usage-based pricing", signalType: "pricing_change", category: "product", direction: "positive", confidence: 0.85 },

  // Team
  { phrase: "appoints", signalType: "executive_hire", category: "team", direction: "positive", confidence: 0.9 },
  { phrase: "names as chief", signalType: "executive_hire", category: "team", direction: "positive", confidence: 0.85 },
  { phrase: "hires", signalType: "executive_hire", category: "team", direction: "positive", confidence: 0.8 },
  { phrase: "joins as", signalType: "executive_hire", category: "team", direction: "positive", confidence: 0.8 },
  { phrase: "steps down", signalType: "leadership_departure", category: "risk", direction: "negative", confidence: 0.9 },
  { phrase: "departs", signalType: "leadership_departure", category: "risk", direction: "negative", confidence: 0.85 },
  { phrase: "resigns", signalType: "leadership_departure", category: "risk", direction: "negative", confidence: 0.9 },
  { phrase: "leaves", signalType: "leadership_departure", category: "risk", direction: "negative", confidence: 0.6 },

  // Hiring
  { phrase: "is hiring", signalType: "hiring_acceleration", category: "team", direction: "positive", confidence: 0.7 },
  { phrase: "doubles headcount", signalType: "hiring_acceleration", category: "team", direction: "positive", confidence: 0.85 },
  { phrase: "cuts staff", signalType: "hiring_acceleration", category: "team", direction: "negative", confidence: 0.8 },
  { phrase: "lays off", signalType: "hiring_acceleration", category: "team", direction: "negative", confidence: 0.9 },

  // Demand
  { phrase: "partners with", signalType: "partnership", category: "demand", direction: "positive", confidence: 0.9 },
  { phrase: "partnership with", signalType: "partnership", category: "demand", direction: "positive", confidence: 0.9 },
  { phrase: "selects", signalType: "customer_momentum", category: "demand", direction: "positive", confidence: 0.8 },
  { phrase: "chooses", signalType: "customer_momentum", category: "demand", direction: "positive", confidence: 0.75 },
  { phrase: "wins contract", signalType: "customer_momentum", category: "demand", direction: "positive", confidence: 0.9 },
  { phrase: "wins", signalType: "customer_momentum", category: "demand", direction: "positive", confidence: 0.6 },
  { phrase: "adds customers", signalType: "customer_momentum", category: "demand", direction: "positive", confidence: 0.85 },
  { phrase: "expands deployment", signalType: "enterprise_expansion", category: "demand", direction: "positive", confidence: 0.85 },
  { phrase: "expands use", signalType: "enterprise_expansion", category: "demand", direction: "positive", confidence: 0.85 },
  { phrase: "renews", signalType: "enterprise_expansion", category: "demand", direction: "positive", confidence: 0.8 },

  // Market
  { phrase: "opens office", signalType: "geographic_expansion", category: "market", direction: "positive", confidence: 0.9 },
  { phrase: "expands to", signalType: "geographic_expansion", category: "market", direction: "positive", confidence: 0.8 },
  { phrase: "enters market", signalType: "geographic_expansion", category: "market", direction: "positive", confidence: 0.8 },
  { phrase: "opens", signalType: "geographic_expansion", category: "market", direction: "positive", confidence: 0.55 },
  { phrase: "receives clearance", signalType: "regulatory_milestone", category: "market", direction: "positive", confidence: 0.9 },
  { phrase: "receives approval", signalType: "regulatory_milestone", category: "market", direction: "positive", confidence: 0.9 },
  { phrase: "certified", signalType: "regulatory_milestone", category: "market", direction: "positive", confidence: 0.8 },
  { phrase: "acquires", signalType: "partnership", category: "market", direction: "positive", confidence: 0.7 },

  // Founder activity
  { phrase: "open sources", signalType: "founder_activity", category: "team", direction: "positive", confidence: 0.75 },
  { phrase: "publishes", signalType: "founder_activity", category: "team", direction: "positive", confidence: 0.6 },
];

export interface HeadlineMatch {
  signalType: SignalType;
  category: SignalCategory;
  direction: SignalDirection;
  confidence: number;
  matchedPhrase: string;
}

export interface HeadlineMatchResult {
  /** The best match, or null when nothing matched confidently. */
  best: HeadlineMatch | null;
  /** Every match found, strongest first. More than one means ambiguity. */
  all: HeadlineMatch[];
  /** True when two different signal types matched at comparable confidence. */
  ambiguous: boolean;
}

/** Below this the match is reported but not written into the corpus. */
export const MIN_HEADLINE_CONFIDENCE = 0.7;

/** Two matches within this of each other are treated as competing. */
const AMBIGUITY_MARGIN = 0.1;

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim()} `;
}

function containsPhrase(haystack: string, phrase: string): boolean {
  // Word bounded on both sides, so "opens" does not match "openstack" and
  // "wins" does not match "winsome".
  return haystack.includes(` ${phrase.toLowerCase()} `) ||
    haystack.includes(` ${phrase.toLowerCase()}, `) ||
    new RegExp(`\\b${phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystack);
}

/**
 * Classify a headline.
 *
 * Returns every matching pattern so a caller can see competition, and flags
 * ambiguity when two different signal types matched at similar confidence.
 * Ambiguity routes to review rather than picking a winner.
 */
export function matchHeadline(headline: string): HeadlineMatchResult {
  const haystack = normalize(headline);
  const matches: HeadlineMatch[] = [];

  for (const pattern of HEADLINE_PATTERNS) {
    if (!containsPhrase(haystack, pattern.phrase)) continue;
    const negated = (pattern.notWhen ?? []).some((phrase) =>
      containsPhrase(haystack, phrase),
    );
    if (negated) continue;
    matches.push({
      signalType: pattern.signalType,
      category: pattern.category,
      direction: pattern.direction,
      confidence: pattern.confidence,
      matchedPhrase: pattern.phrase,
    });
  }

  // Strongest first, then by phrase length so a specific phrase beats a
  // generic one at equal confidence, then alphabetically for determinism.
  matches.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (b.matchedPhrase.length !== a.matchedPhrase.length) {
      return b.matchedPhrase.length - a.matchedPhrase.length;
    }
    return a.matchedPhrase.localeCompare(b.matchedPhrase);
  });

  const best = matches[0] ?? null;
  const competing = matches.filter(
    (m) => best !== null && m.signalType !== best.signalType &&
      best.confidence - m.confidence <= AMBIGUITY_MARGIN,
  );

  return { best, all: matches, ambiguous: competing.length > 0 };
}

/** Whether a match is confident enough to enter the corpus unreviewed. */
export function isAcceptableMatch(result: HeadlineMatchResult): boolean {
  return (
    result.best !== null &&
    !result.ambiguous &&
    result.best.confidence >= MIN_HEADLINE_CONFIDENCE
  );
}
