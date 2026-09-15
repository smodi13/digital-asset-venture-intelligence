import { normalizeUrlForIdentity } from "@/lib/research/ids";
import type { SourceRecordV7 } from "@/lib/schemas/v7/source-record";

/**
 * Deterministic source deduplication / collision detection (Phase 3B-0,
 * PARALLEL / DORMANT).
 *
 * Number of URLs is never confidence. Two records that are exactly the same
 * page (by normalized URL) are a hard error: an author-supplied id scheme
 * (unlike v6's URL-derived ids) makes that a realistic authoring mistake, not
 * a modeling question. Everything softer than an exact URL match (same
 * publisher, title, and date, but a different URL) is a WARNING: suggestive,
 * never merged automatically.
 */

export interface SourceDuplicateHit {
  kind: "exact_url" | "publisher_title_date";
  sourceIds: string[];
  detail: string;
}

export function findSourceDuplicates(sources: readonly SourceRecordV7[]): SourceDuplicateHit[] {
  const hits: SourceDuplicateHit[] = [];

  const byUrl = new Map<string, string[]>();
  for (const s of sources) {
    if (!s.url) continue;
    const key = normalizeUrlForIdentity(s.url);
    const ids = byUrl.get(key) ?? [];
    ids.push(s.id);
    byUrl.set(key, ids);
  }
  for (const [url, ids] of [...byUrl.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const distinct = [...new Set(ids)].sort();
    if (distinct.length > 1) {
      hits.push({
        kind: "exact_url",
        sourceIds: distinct,
        detail: `${distinct.length} source ids resolve to the same normalized URL (${url}).`,
      });
    }
  }

  const byPublisherTitleDate = new Map<string, string[]>();
  for (const s of sources) {
    const key = `${s.publisher.trim().toLowerCase()}|${s.title.trim().toLowerCase()}|${s.publishedAt ?? ""}`;
    const ids = byPublisherTitleDate.get(key) ?? [];
    ids.push(s.id);
    byPublisherTitleDate.set(key, ids);
  }
  for (const [key, ids] of [...byPublisherTitleDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const distinct = [...new Set(ids)].sort();
    if (distinct.length > 1) {
      // Already reported as an exact URL match: don't double-report.
      const alreadyReported = hits.some(
        (h) => h.kind === "exact_url" && distinct.every((id) => h.sourceIds.includes(id)),
      );
      if (!alreadyReported) {
        hits.push({
          kind: "publisher_title_date",
          sourceIds: distinct,
          detail: `${distinct.length} source ids share publisher, normalized title, and publication date (${key}).`,
        });
      }
    }
  }

  return hits;
}
