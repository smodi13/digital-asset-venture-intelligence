/**
 * Deterministic digital-asset relevance and discovery-utility classification.
 *
 * No language model. A candidate becomes a default "New Candidate" only when
 * this module says the underlying item is digital-asset relevant (strong or
 * appropriately-supported moderate) AND not editorial/event/promotional noise.
 * Every rule here is a fixed keyword/regex table, so a run is reproducible and
 * a reviewer can read exactly why an item passed or failed.
 *
 * The vocabulary is built around the project's 11 canonical categories (see
 * config/digital-asset for the frozen scoring taxonomy; this module is
 * independent of it and never reads or writes that config).
 */

export type RelevanceStrength = "strong" | "moderate" | "weak" | "not_relevant";
export type DiscoveryUtility = "high" | "medium" | "low";

export interface RelevanceInput {
  title: string;
  summary: string | null;
  categories: readonly string[];
}

/**
 * Crypto-specific concepts: a hit on any of these is sufficient for STRONG
 * relevance on its own. Chosen because each is essentially unused outside a
 * digital-asset context in startup/funding journalism (unlike "protocol",
 * "network", or "wallet", which are also generic engineering/fintech words -
 * those live in CONTEXT_TERMS below and must co-occur to count).
 */
const STRONG_TERMS: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /\bblockchains?\b/i, label: "blockchain" },
  { re: /\bcryptos?\b/i, label: "crypto" },
  { re: /\bcryptocurrenc(?:y|ies)\b/i, label: "cryptocurrency" },
  { re: /\bdigital assets?\b/i, label: "digital asset" },
  { re: /\bweb3\b/i, label: "Web3" },
  { re: /\bstablecoins?\b/i, label: "stablecoin" },
  { re: /\btokeniz(?:ation|ed|e)\b/i, label: "tokenization" },
  { re: /\bdefi\b/i, label: "DeFi" },
  { re: /\bdexe?s?\b/i, label: "DEX" },
  { re: /\bcrypto wallets?\b|\bdigital[\s-]asset wallets?\b|\bself-custod(?:y|ial)\b/i, label: "crypto wallet" },
  { re: /\bcrypto custody\b|\bdigital[\s-]asset custody\b|\binstitutional crypto custody\b/i, label: "crypto custody" },
  { re: /\bon-?chain\b/i, label: "onchain" },
  { re: /\bsmart contracts?\b/i, label: "smart contract" },
  { re: /\brollups?\b/i, label: "rollup" },
  { re: /\bzero[\s-]knowledge\b|\bzk\b/i, label: "zero knowledge" },
  { re: /\bmainnet\b/i, label: "mainnet" },
  { re: /\btestnet\b/i, label: "testnet" },
  { re: /\bdecentraliz(?:ed|e) compute\b/i, label: "decentralized compute" },
  { re: /\bdepin\b/i, label: "DePIN" },
  { re: /\bcrypto payments?\b|\bcrypto compliance\b|\bcrypto infrastructure\b/i, label: "crypto infrastructure" },
];

/**
 * Context-dependent concepts (correction section 2, list B): common
 * engineering/fintech/regulatory words that are NOT crypto-specific on their
 * own ("HTTP protocol security startup", "network security company",
 * "cloud compute startup" are not digital-asset stories). Each only
 * contributes to relevance when it co-occurs with a CRYPTO_ANCHOR_RE hit or
 * with another context term via an explicit MODERATE_COMBOS pair below -
 * never from being one of several generic words that merely happen to
 * appear together.
 */
const CONTEXT_TERMS: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /\bprotocols?\b/i, label: "protocol" },
  { re: /\bnetworks?\b/i, label: "network" },
  { re: /\binfrastructure\b/i, label: "infrastructure" },
  { re: /\bpayments?\b/i, label: "payments" },
  { re: /\bassets?\b/i, label: "assets" },
  { re: /\bsecurity\b/i, label: "security" },
  { re: /\banalytics\b/i, label: "analytics" },
  { re: /\bcompute\b/i, label: "compute" },
  { re: /\bdeveloper tooling\b/i, label: "developer tooling" },
  { re: /\bcapital markets?\b/i, label: "capital markets" },
  { re: /\bcompliance\b/i, label: "compliance" },
  { re: /\binstitutional\b/i, label: "institutional" },
  { re: /\boracles?\b/i, label: "oracle" },
  { re: /\bwallets?\b/i, label: "wallet" },
  { re: /\bcustody\b/i, label: "custody" },
  { re: /\bvalidators?\b/i, label: "validator" },
  { re: /\bstaking\b/i, label: "staking" },
  { re: /\blayer[\s-]?2\b|\bl2\b/i, label: "Layer 2" },
  { re: /\brwas?\b|\breal[\s-]world assets?\b/i, label: "RWA" },
  { re: /\btokens?\b/i, label: "tokens" },
];

/**
 * Deterministic combinations of two context terms that, together, establish
 * MODERATE relevance even with no standalone crypto-specific term present
 * (correction section 2 / original spec section 15). Never "any two generic
 * words" - only these named pairs.
 */
const MODERATE_COMBOS: ReadonlyArray<readonly [string, string]> = [
  ["validator", "network"],
  ["wallet", "custody"],
  ["oracle", "network"],
  ["Layer 2", "protocol"],
  ["RWA", "protocol"],
  ["RWA", "infrastructure"],
];

function text(input: RelevanceInput): string {
  return [input.title, input.summary ?? "", ...input.categories].join(" \n ");
}

/** Deterministic STRONG / MODERATE / WEAK / NOT_RELEVANT classification. */
export function classifyRelevance(input: RelevanceInput): {
  strength: RelevanceStrength;
  matchedTerms: string[];
} {
  const hay = text(input);
  const strongHits = STRONG_TERMS.filter((t) => t.re.test(hay)).map((t) => t.label);
  if (strongHits.length > 0) {
    return { strength: "strong", matchedTerms: [...new Set(strongHits)] };
  }

  const contextHits = CONTEXT_TERMS.filter((t) => t.re.test(hay)).map((t) => t.label);
  const hitSet = new Set(contextHits);

  const comboHit = MODERATE_COMBOS.find(([a, b]) => hitSet.has(a) && hitSet.has(b));
  if (comboHit) {
    return { strength: "moderate", matchedTerms: [...comboHit] };
  }

  if (contextHits.length >= 1) {
    return { strength: "weak", matchedTerms: [...new Set(contextHits)] };
  }
  return { strength: "not_relevant", matchedTerms: [] };
}

/**
 * Standalone signals of a genuinely early-stage discovery event: sufficient
 * for HIGH utility on their own. Deliberately excludes a bare "launch" -
 * "launches a new feature/product/service" is routine news from an
 * already-operating company, not a sourcing lead (correction section 2).
 */
const POSITIVE_UTILITY: ReadonlyArray<RegExp> = [
  /\bpre-seed\b/i,
  /\bseed (round|funding)\b/i,
  /\bseries [ab]\b/i,
  /\bfirst institutional financing\b/i,
  /\bstealth\b|\bemerges? from stealth\b|\bout of stealth\b/i,
  /\bnew (startup|company|protocol|network|infrastructure (?:project|platform|product))\b/i,
  /\bdeveloper preview\b/i,
  /\bfunding announcement\b/i,
  /\bnew stablecoin\b|\bnew payment rail\b|\bnew tokenization platform\b|\bnew security infrastructure\b/i,
];

/** A launch of a mainnet or testnet is early-stage regardless of word order ("launches mainnet" or "mainnet launch"). */
const UTILITY_COMBO_TERMS: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /\blaunch(es|ed)?\b/i, label: "launch" },
  { re: /\bmainnet\b/i, label: "mainnet" },
  { re: /\btestnet\b/i, label: "testnet" },
];
const HIGH_UTILITY_COMBOS: ReadonlyArray<readonly [string, string]> = [
  ["launch", "mainnet"],
  ["launch", "testnet"],
];

const NEGATIVE_UTILITY: ReadonlyArray<RegExp> = [
  /\bseries [d-z]\b/i,
  /\bmulti-billion-dollar valuation\b|\$\d+(\.\d+)?\s*(b|billion)\b.*\bvaluation\b/i,
  /\bipo\b|\binitial public offering\b/i,
  /\bpublic compan(y|ies)\b/i,
  /\bmega-cap\b|\bwidely established\b/i,
  /\bmarket analysis\b|\bmarket commentary\b/i,
  /\binvestor profile\b/i,
  /\bconference\b|\bpromotion\b/i,
  /\bfunding roundup\b/i,
  /\blistic(le)?\b/i,
  /\bopinion\b/i,
  /\blayoffs?\b/i,
];

/**
 * NOT an investment score: whether the item is a genuinely early-stage
 * discovery event (HIGH), routine news from an already-operating entity
 * (MEDIUM - partnership, integration, expansion, a routine product/feature
 * launch), or actively de-prioritized (LOW - a later-stage or editorial
 * signal). Never inferred from a company name; only from wording.
 */
export function classifyDiscoveryUtility(input: RelevanceInput): DiscoveryUtility {
  const hay = text(input);
  const comboHits = new Set(UTILITY_COMBO_TERMS.filter((t) => t.re.test(hay)).map((t) => t.label));
  const comboPositive = HIGH_UTILITY_COMBOS.some(([a, b]) => comboHits.has(a) && comboHits.has(b));
  const positive = POSITIVE_UTILITY.some((re) => re.test(hay)) || comboPositive;
  const negative = NEGATIVE_UTILITY.some((re) => re.test(hay));
  if (negative && !positive) return "low";
  if (positive && !negative) return "high";
  return "medium";
}

/** Clear non-candidate article patterns: event promo, roundups, editorial, listicles. */
const NOISE_PATTERNS: ReadonlyArray<RegExp> = [
  /\bdays? left\b/i,
  /\bfinal call\b/i,
  /\bregister (now|today)\b/i,
  /\b(tickets?|exhibit(or)?s?)\b.*\b(deadline|days left|closing soon)\b/i,
  /\b(the )?(week|month)('s)? (\d+ )?biggest\b/i,
  /biggest funding rounds/i,
  /\btop \d+\b/i,
  /\b\d+ (biggest|best|moats|reasons|takeaways|things|ways|tips|lessons)\b/i,
  /\bonly \d+ (moats|ways|things)\b/i,
  /\blayoff tracker\b/i,
  /\bpitch (advice|deck)\b/i,
  /\b(vc|investor) (interview|profile|q&a)\b/i,
  /\bhow to (pitch|raise)\b/i,
  /\bthe .*'s \d+\b/i,
  // Crime/enforcement/security-incident stories: never a sourcing lead, even
  // when the victim is a real, named company (section 8).
  /\b(hacked|hackers?|breach(ed)?|exploit(ed|er)s?|leaks?|leaked|attackers?|scam(med)?|phishing|stolen funds|data leak)\b/i,
  /\bbans?\b.*\b(atms?|kiosks?)\b/i,
  // Recurring newsletter/column mastheads, never a company name.
  /\b(morning minute|daily briefing|crypto week ahead|week ahead|live updates?|your day-ahead look)\b/i,
];

export function isNoiseHeadline(title: string): boolean {
  return NOISE_PATTERNS.some((re) => re.test(title));
}

/** Best-effort tag into one of the project's 11 canonical categories. Never authoritative. */
const CATEGORY_RULES: ReadonlyArray<{ re: RegExp; category: string }> = [
  { re: /\bstablecoins?\b|\bpayments?\b|\bpayment rail\b/i, category: "Stablecoins and payments" },
  { re: /\btokeniz(?:ation|ed|e)\b|\brwas?\b|\breal[\s-]world assets?\b/i, category: "Tokenization and real-world assets" },
  { re: /\bcustody\b|\bcompliance\b|\binstitutional\b/i, category: "Custody, compliance, and institutional infrastructure" },
  { re: /\bdefi\b|\bdexe?s?\b|\bcapital markets?\b/i, category: "DeFi and capital markets" },
  { re: /\boracles?\b|\bindexing\b|\bdata infrastructure\b/i, category: "Data, oracles, and indexing" },
  { re: /\bzero[\s-]knowledge\b|\bzk\b|\bprivacy\b|\bcryptography\b/i, category: "Security, privacy, and cryptography" },
  { re: /\bdepin\b|\bdecentraliz(?:ed|e) compute\b/i, category: "DePIN and decentralized compute" },
  { re: /\bcrypto ai\b|\bagentic\b/i, category: "Crypto AI and agentic infrastructure" },
  { re: /\bconsumer\b|\bsocial\b|\bgaming\b/i, category: "Consumer, social, and gaming" },
  { re: /\bdeveloper\b|\bmiddleware\b|\bsdk\b|\btooling\b/i, category: "Developer infrastructure and middleware" },
  { re: /\brollups?\b|\blayer[\s-]?2\b|\bl2\b|\bmainnet\b|\btestnet\b|\bvalidators?\b|\bstaking\b|\bprotocols?\b/i, category: "Core protocols and scaling" },
];

export function categorize(input: RelevanceInput): string | null {
  const hay = text(input);
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(hay)) return rule.category;
  }
  return null;
}

/** Whether a published date is inside the lookback window. Unknown dates pass. */
export function withinLookback(publishedAt: string | null, now: string, lookbackDays: number): boolean {
  if (!publishedAt) return true;
  const published = Date.parse(publishedAt);
  const nowMs = Date.parse(now);
  if (Number.isNaN(published) || Number.isNaN(nowMs)) return true;
  const ageMs = nowMs - published;
  return ageMs <= lookbackDays * 24 * 60 * 60 * 1000;
}

export const DEFAULT_LOOKBACK_DAYS = 30;
export const LOOKBACK_OPTIONS = [30, 60, 90] as const;
