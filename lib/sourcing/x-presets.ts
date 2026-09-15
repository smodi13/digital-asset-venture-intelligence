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
    id: "funding-announcements",
    label: "Funding announcements",
    description: "Posts announcing a seed or Series A to C round at a named startup.",
    query:
      '("raises" OR "raised" OR "series a" OR "series b" OR "series c" OR "seed round") ' +
      "(startup OR founder OR founders OR launches) -is:retweet -is:reply lang:en",
  },
  {
    id: "stealth-launches",
    label: "Stealth launches",
    description: "Posts about a company coming out of stealth or a founder announcing a launch.",
    query:
      '("out of stealth" OR "emerging from stealth" OR "coming out of stealth" OR ' +
      '"excited to announce" OR "today we launch") -is:retweet -is:reply lang:en',
  },
] as const;

const BY_ID = new Map(X_PRESETS.map((p) => [p.id, p]));

export function getXPreset(id: string): XPreset | null {
  return BY_ID.get(id) ?? null;
}
