import { z } from "zod";
import {
  idSchema,
  isoDateTimeSchema,
  schemaVersionSchema,
  urlSchema,
} from "@/lib/schemas/common";

/**
 * Company page snapshots.
 *
 * The storage and hashing model a future Company Change Radar needs. No page
 * is crawled in this phase; this establishes the shape so that when crawling
 * is added, the public data format does not have to change.
 *
 * WHAT IS STORED PUBLICLY AND WHAT IS NOT
 *
 * A public snapshot record holds hashes, a region description, and metadata.
 * It does NOT hold the page body. Storing HTML publicly would republish
 * copyrighted content at scale, would bloat the repository, and would put
 * whatever a company happened to have on its site into a permanent public
 * record.
 *
 * A research-time private cache may hold HTML so a diff can be computed. That
 * cache lives outside data/generated, is gitignored, and never reaches a
 * public fixture. See docs/source-policy.md.
 */

/** The kind of page. Determines which changes are worth noticing. */
export const pageTypeSchema = z.enum([
  "about",
  "product",
  "pricing",
  "customers",
  "careers",
  "leadership",
  "partners",
  "newsroom",
  "other",
]);
export type PageType = z.infer<typeof pageTypeSchema>;

/**
 * Which page types are worth watching, and why.
 *
 * A pricing page changing means something. A newsroom changing means a post
 * was added, which the Headline Radar already covers. Recording the intent
 * here keeps a later crawl from watching everything indiscriminately.
 */
export const PAGE_TYPE_RATIONALE: Record<PageType, string> = {
  about: "Positioning and company description changes.",
  product: "Capability additions and repositioning.",
  pricing: "Packaging changes, enterprise tiers, and a move to usage-based pricing.",
  customers: "Named logos appearing or disappearing.",
  careers: "Role mix and hiring pace, particularly in revenue functions.",
  leadership: "Executive arrivals and departures.",
  partners: "Distribution and channel relationships.",
  newsroom: "Announcements, largely covered by Headline Radar.",
  other: "Anything not covered above.",
};

export const pageSnapshotSchema = z.object({
  id: idSchema,
  schemaVersion: schemaVersionSchema,

  companyId: idSchema,
  url: urlSchema,
  pageType: pageTypeSchema,

  /** When the page was fetched. */
  observedAt: isoDateTimeSchema,

  /** SHA-256 of the raw retrieved content, before normalisation. */
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  /**
   * SHA-256 of the normalised text of the watched region.
   *
   * This is the hash a change is judged against. Comparing raw content would
   * fire on every deploy that changed a build identifier.
   */
  normalizedTextHash: z.string().regex(/^[0-9a-f]{64}$/),

  /**
   * Which part of the page was watched.
   *
   * A CSS selector, or a description when a selector is not how the region was
   * chosen. Recorded because a diff is meaningless without knowing what was
   * compared, and because a page redesign that breaks a selector should be
   * visible rather than silently producing an empty region.
   */
  selector: z.string().min(1).nullable().default(null),
  regionDescription: z.string().min(1),

  /** The SourceRecord this snapshot belongs to. */
  sourceRecordId: idSchema.nullable().default(null),

  /** Characters in the normalised region. A sudden collapse suggests breakage. */
  normalizedLength: z.number().int().nonnegative(),
  /** True when the region was empty, which usually means a broken selector. */
  regionEmpty: z.boolean().default(false),
});

export type PageSnapshot = z.infer<typeof pageSnapshotSchema>;

export const snapshotChangeSchema = z.object({
  companyId: idSchema,
  url: urlSchema,
  pageType: pageTypeSchema,
  previousSnapshotId: idSchema,
  currentSnapshotId: idSchema,
  previousObservedAt: isoDateTimeSchema,
  currentObservedAt: isoDateTimeSchema,
  previousHash: z.string().min(1),
  currentHash: z.string().min(1),
  /** Capped snippets. Never a page body. */
  addedText: z.array(z.string().max(280)).max(10).default([]),
  removedText: z.array(z.string().max(280)).max(10).default([]),
  addedCount: z.number().int().nonnegative(),
  removedCount: z.number().int().nonnegative(),
  changeMagnitude: z.number().min(0).max(1),
});

export type SnapshotChange = z.infer<typeof snapshotChangeSchema>;

/** Whether a change is large enough to be worth a human looking at it. */
export function isMaterialChange(change: SnapshotChange, threshold = 0.05): boolean {
  return change.changeMagnitude >= threshold;
}
