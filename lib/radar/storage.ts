/**
 * Follow-On Radar local state (Phase 4C).
 *
 * A user-controlled monitoring list, not a portfolio record. It lives only in
 * the viewer's browser (localStorage) - there is no server, no database, and
 * no canonical portfolio dataset behind it. These are pure functions over a
 * plain string array so the persistence rules (dedupe, no fabricated default
 * entries) can be unit tested without a DOM.
 */

export const RADAR_STORAGE_KEY = "dvi:radar:v1";
export const RADAR_CHANGE_EVENT = "dvi:radar:change";

/** Parses whatever localStorage returns. Any malformed or missing value is an empty radar - never a fabricated default. */
export function parseRadarIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((v): v is string => typeof v === "string"))];
  } catch {
    return [];
  }
}

export function serializeRadarIds(ids: string[]): string {
  return JSON.stringify([...new Set(ids)]);
}

export function addRadarId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}

export function removeRadarId(ids: string[], id: string): string[] {
  return ids.filter((existing) => existing !== id);
}
