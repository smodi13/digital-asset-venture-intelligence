/**
 * X recent-search payload -> FeedItem[].
 *
 * An isolated, deterministic normalisation adapter. It runs BEFORE the shared
 * extractCandidate and never modifies it. X posts are noisier than structured
 * feeds, so this adapter is conservative: it passes the post text through as-is
 * (entities decoded, links and @handles stripped from the readable text),
 * surfaces hashtags / cashtags / link domains as categories for the domain
 * finder, and lets extractCandidate decide identity confidence. It never
 * promotes confidence, never infers a company the text does not name, and uses
 * no language model.
 */

import type { FeedItem } from "./parse";

interface RawTweet {
  id?: unknown;
  text?: unknown;
  created_at?: unknown;
  author_id?: unknown;
  entities?: {
    hashtags?: Array<{ tag?: unknown }>;
    cashtags?: Array<{ tag?: unknown }>;
    urls?: Array<{ expanded_url?: unknown; display_url?: unknown }>;
  };
}

interface RawPayload {
  data?: unknown;
  includes?: { users?: Array<{ id?: unknown; username?: unknown }> };
}

const TEXT_CAP = 400;
const TITLE_CAP = 160;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Readable form of a tweet: entities decoded, t.co links and @mentions removed. */
function readableText(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\B@\w+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstLine(text: string): string {
  const line = text.split(/(?<=[.!?])\s|\n/)[0] ?? text;
  return line.slice(0, TITLE_CAP).trim();
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function mapXPayloadToItems(payload: unknown, presetId: string): FeedItem[] {
  const p = (payload ?? {}) as RawPayload;
  const rows = Array.isArray(p.data) ? (p.data as RawTweet[]) : [];
  if (rows.length === 0) return [];

  const usersById = new Map<string, string>();
  for (const u of p.includes?.users ?? []) {
    const id = str(u.id);
    const username = str(u.username);
    if (id && username) usersById.set(id, username);
  }

  const items: FeedItem[] = [];
  for (const t of rows) {
    const id = str(t.id);
    const rawText = str(t.text);
    if (!id || !rawText) continue;

    const text = readableText(rawText);
    if (text.length < 8) continue;

    const hashtags = (t.entities?.hashtags ?? [])
      .map((h) => str(h.tag))
      .filter((v): v is string => Boolean(v))
      .map((v) => `#${v}`);
    const cashtags = (t.entities?.cashtags ?? [])
      .map((h) => str(h.tag))
      .filter((v): v is string => Boolean(v))
      .map((v) => `$${v}`);
    const linkDomains = (t.entities?.urls ?? [])
      .map((u) => str(u.expanded_url) ?? str(u.display_url))
      .filter((v): v is string => Boolean(v))
      .map((u) => (u.startsWith("http") ? hostOf(u) : u.split("/")[0] ?? null))
      .filter((v): v is string => Boolean(v));

    const author = usersById.get(str(t.author_id) ?? "");

    items.push({
      title: firstLine(text),
      link: `https://x.com/i/web/status/${id}`,
      publishedAt: str(t.created_at),
      id: `x-${id}`,
      summary: text.slice(0, TEXT_CAP),
      categories: [`preset:${presetId}`, ...cashtags, ...hashtags, ...linkDomains],
      author: author ? `X / @${author}` : "X",
    });
  }
  return items;
}
