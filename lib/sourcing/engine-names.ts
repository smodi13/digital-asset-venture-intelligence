/**
 * Engine id / name normalisation.
 *
 * Kept dependency-free (no fetch, parse, hash, or resolver imports) so it is
 * safe to use from client components that render old browser-local queue
 * entries. Those entries, created by v1.0.0, carry the retired id
 * "headline-radar" / name "Headline Radar"; everything below maps them forward
 * to "Public Feed Discovery" for display. No stored data is rewritten.
 */

export const PUBLIC_FEED_ENGINE_ID = "public-feed-discovery";
export const PUBLIC_FEED_ENGINE_NAME = "Public Feed Discovery";
export const X_DISCOVERY_ENGINE_ID = "x-discovery";
export const X_DISCOVERY_ENGINE_NAME = "X Discovery";

const LEGACY_IDS: Readonly<Record<string, string>> = {
  "headline-radar": PUBLIC_FEED_ENGINE_ID,
};

const NAME_BY_ID: Readonly<Record<string, string>> = {
  [PUBLIC_FEED_ENGINE_ID]: PUBLIC_FEED_ENGINE_NAME,
  [X_DISCOVERY_ENGINE_ID]: X_DISCOVERY_ENGINE_NAME,
};

const LEGACY_NAMES: Readonly<Record<string, string>> = {
  "Headline Radar": PUBLIC_FEED_ENGINE_NAME,
};

/** Resolve any current or legacy engine id to its current id. */
export function canonicalEngineId(id: string): string {
  return LEGACY_IDS[id] ?? id;
}

/** Display name for any current or legacy engine id or name. */
export function displayEngineName(idOrName: string | null | undefined): string {
  if (!idOrName) return PUBLIC_FEED_ENGINE_NAME;
  return NAME_BY_ID[canonicalEngineId(idOrName)] ?? LEGACY_NAMES[idOrName] ?? idOrName;
}
