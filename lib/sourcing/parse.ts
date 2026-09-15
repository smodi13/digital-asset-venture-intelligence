/**
 * A small, tolerant RSS 2.0 and Atom parser.
 *
 * A dependency-free regex parser rather than an XML library because the shape
 * consumed here is tiny (title, link, date, id, summary, categories) and a
 * malformed feed must degrade to "0 items" rather than throw. It is not a
 * general XML parser and is not meant to be one.
 *
 * All extracted text is decoded from the handful of XML entities feeds use and
 * has any HTML tags stripped. It is still treated as untrusted downstream and
 * rendered only through normal React escaping, never as HTML.
 */

export interface FeedItem {
  title: string;
  link: string | null;
  /** ISO 8601, or null when the feed gave no usable date. */
  publishedAt: string | null;
  /** guid / id, or the link, or a hash of the title. Always present. */
  id: string;
  /** Plain-text summary / description, trimmed and capped. Null when absent. */
  summary: string | null;
  categories: string[];
  /**
   * Attributed author for this item, when the source identifies one (X posts
   * carry an author handle; RSS items generally do not). Used as the discovery
   * provenance publisher. Optional; RSS parsing leaves it undefined.
   */
  author?: string | null;
}

export interface ParsedFeed {
  items: FeedItem[];
}

const SUMMARY_CAP = 400;

function decodeEntities(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function safeCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

function stripTags(raw: string): string {
  return raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function clean(raw: string | null | undefined): string {
  if (!raw) return "";
  return stripTags(decodeEntities(raw)).trim();
}

function firstTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1]! : null;
}

function allTags(block: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) out.push(m[1]!);
  return out;
}

/** Atom <link href="..."/> or RSS <link>text</link>. */
function extractLink(block: string): string | null {
  const rss = firstTag(block, "link");
  if (rss && rss.trim()) return clean(rss);
  const atom = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i);
  return atom ? decodeEntities(atom[1]!) : null;
}

function toIso(raw: string | null): string | null {
  if (!raw) return null;
  const t = Date.parse(clean(raw));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function hashId(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i += 1) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return `item-${(h >>> 0).toString(16)}`;
}

function parseBlock(block: string, isAtom: boolean): FeedItem | null {
  const title = clean(firstTag(block, "title"));
  if (!title) return null;

  const link = extractLink(block);
  const dateRaw =
    firstTag(block, "pubDate") ??
    firstTag(block, "published") ??
    firstTag(block, "updated") ??
    firstTag(block, "dc:date");
  const guid = firstTag(block, "guid") ?? (isAtom ? firstTag(block, "id") : null);

  const summaryRaw =
    firstTag(block, "description") ??
    firstTag(block, "summary") ??
    firstTag(block, "content") ??
    firstTag(block, "content:encoded");
  const summary = clean(summaryRaw).slice(0, SUMMARY_CAP) || null;

  const categories = [
    ...allTags(block, "category").map(clean),
    ...(block.match(/<category\b[^>]*\bterm=["']([^"']+)["']/gi) ?? []).map((m) =>
      decodeEntities(m.replace(/.*term=["']([^"']+)["'].*/i, "$1")),
    ),
  ]
    .map((c) => c.trim())
    .filter(Boolean);

  return {
    title,
    link: link && /^https?:\/\//i.test(link) ? link : null,
    publishedAt: toIso(dateRaw),
    id: (guid && clean(guid)) || link || hashId(title),
    summary,
    categories: [...new Set(categories)],
  };
}

export function parseFeed(xml: string): ParsedFeed {
  if (typeof xml !== "string" || xml.length === 0) return { items: [] };

  const rssItems = allTags(xml, "item");
  const atomEntries = allTags(xml, "entry");
  const isAtom = atomEntries.length > 0 && rssItems.length === 0;
  const blocks = isAtom ? atomEntries : rssItems;

  const items: FeedItem[] = [];
  for (const block of blocks) {
    try {
      const item = parseBlock(block, isAtom);
      if (item) items.push(item);
    } catch {
      // One unparseable item is skipped, not fatal.
    }
  }
  return { items };
}
