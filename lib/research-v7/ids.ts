/**
 * v7 id helpers (Phase 3B-0, PARALLEL / DORMANT).
 *
 * Reuses the deterministic slug/URL-normalization primitives already proven in
 * lib/research/ids.ts rather than reimplementing them. v7 packet ids are
 * author-supplied (a human writes a research packet, not a translator), so
 * this module validates uniqueness and stable format rather than generating
 * ids from scratch.
 */
import { idSchema } from "@/lib/schemas/common";
export { slugify, normalizeUrlForIdentity } from "@/lib/research/ids";

/** A stable-format id: matches the project-wide idSchema. */
export function isStableId(value: string): boolean {
  return idSchema.safeParse(value).success;
}

/** First duplicate id found in a list, or null. Case-sensitive: ids are identifiers, not display text. */
export function firstDuplicate(ids: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return null;
}

/** All ids that appear more than once, sorted, deduplicated. */
export function allDuplicates(ids: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([id]) => id)
    .sort();
}
