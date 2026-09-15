/**
 * X Discovery query presets.
 *
 * The ENTIRE set of queries the X search route will ever send. A query is never
 * taken from a request: the client sends only a presetId, validated here exactly
 * as the public-feed route validates an engineId. This keeps "no user-supplied
 * arbitrary query" a structural property, not a convention.
 *
 * Each query is scoped to private-market discovery, excludes retweets and
 * replies, and is English-only to keep the deterministic extractor honest.
 */

export interface XPreset {
  id: string;
  /** Shown on the channel card. */
  label: string;
  /** One line describing what it looks for. */
  description: string;
  /** The X API v2 `query` value. Fixed. */
  query: string;
}

export const X_PRESETS: readonly XPreset[] = [
  {
    id: "crypto-funding-announcements",
    label: "Crypto funding announcements",
    description:
      "Posts announcing a seed or Series A/B round at a stablecoin, custody, DeFi, tokenization, " +
      "or other crypto infrastructure startup.",
    query:
      '("raises" OR "raised" OR "series a" OR "series b" OR "seed round") ' +
      '(crypto OR blockchain OR stablecoin OR tokenization OR defi OR wallet OR custody OR ' +
      'onchain OR "smart contract" OR depin OR "crypto payments" OR "crypto compliance") ' +
      "-is:retweet -is:reply lang:en",
  },
  {
    id: "crypto-stealth-launches",
    label: "Crypto protocol and stealth launches",
    description:
      "Posts about a new protocol mainnet/testnet launch, or a crypto infrastructure company " +
      "coming out of stealth.",
    query:
      '("out of stealth" OR "emerging from stealth" OR "mainnet launch" OR "testnet launch" OR ' +
      '"new protocol" OR "today we launch") ' +
      '(crypto OR blockchain OR protocol OR onchain OR "zero knowledge" OR zk OR depin OR wallet) ' +
      "-is:retweet -is:reply lang:en",
  },
  {
    id: "crypto-developer-infrastructure",
    label: "Crypto developer and data infrastructure",
    description:
      "Posts about new developer tooling, oracles, indexing, or ZK infrastructure for crypto teams.",
    query:
      '("new sdk" OR "developer preview" OR "new infrastructure" OR "now live") ' +
      '(crypto OR blockchain OR oracle OR "zero knowledge" OR zk OR onchain OR indexing OR validator) ' +
      "-is:retweet -is:reply lang:en",
  },
] as const;

const BY_ID = new Map(X_PRESETS.map((p) => [p.id, p]));

export function getXPreset(id: string): XPreset | null {
  return BY_ID.get(id) ?? null;
}
