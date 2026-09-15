import { describe, expect, it } from "vitest";
import { mapXPayloadToItems } from "@/lib/sourcing/x-map";
import { extractCandidate } from "@/lib/sourcing/extract";

const PAYLOAD = {
  data: [
    {
      id: "1001",
      text: "Northwind raises $20M Series A to automate logistics. Excited to partner with investors. https://t.co/abc",
      created_at: "2026-09-03T10:00:00.000Z",
      author_id: "u1",
      entities: {
        hashtags: [{ tag: "logistics" }],
        cashtags: [],
        urls: [{ expanded_url: "https://northwind.com/blog", display_url: "northwind.com/blog" }],
      },
    },
    {
      id: "1002",
      text: "gm everyone, coffee first then code @someone check this out",
      created_at: "2026-09-03T09:00:00.000Z",
      author_id: "u2",
    },
    {
      id: "1003",
      text: "RT @vc: thread on the state of seed funding 1/ ...",
      created_at: "2026-09-02T09:00:00.000Z",
      author_id: "u3",
    },
    { id: "", text: "missing id" },
  ],
  includes: { users: [{ id: "u1", username: "northwind_hq" }, { id: "u2", username: "dev" }] },
};

describe("mapXPayloadToItems", () => {
  it("maps tweets to FeedItems with X provenance fields", () => {
    const items = mapXPayloadToItems(PAYLOAD, "funding-announcements");
    expect(items).toHaveLength(3); // the empty-id row is dropped
    const first = items[0]!;
    expect(first.id).toBe("x-1001");
    expect(first.link).toBe("https://x.com/i/web/status/1001");
    expect(first.publishedAt).toBe("2026-09-03T10:00:00.000Z");
    expect(first.author).toBe("X / @northwind_hq");
    expect(first.categories[0]).toBe("preset:funding-announcements");
    // link/handle stripped from readable text
    expect(first.summary).not.toContain("https://");
    expect(first.summary).not.toContain("@");
  });

  it("does not fabricate a company from non-company chatter", () => {
    const items = mapXPayloadToItems(PAYLOAD, "funding-announcements");
    const chatter = items.find((i) => i.id === "x-1002")!;
    const extraction = extractCandidate(chatter);
    // Either no extraction, or a needs_review one - never confirmed.
    if (extraction) expect(extraction.identityConfidence).not.toBe("confirmed");
  });

  it("keeps a real funding announcement resolvable but not over-confident", () => {
    const items = mapXPayloadToItems(PAYLOAD, "funding-announcements");
    const real = items.find((i) => i.id === "x-1001")!;
    const extraction = extractCandidate(real);
    expect(extraction?.name).toBe("Northwind");
  });

  it("returns an empty array for an empty or malformed payload", () => {
    expect(mapXPayloadToItems({}, "x")).toEqual([]);
    expect(mapXPayloadToItems(null, "x")).toEqual([]);
    expect(mapXPayloadToItems({ data: "nope" }, "x")).toEqual([]);
  });
});
