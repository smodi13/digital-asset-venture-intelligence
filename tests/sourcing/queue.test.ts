import { describe, expect, it } from "vitest";
import {
  addToQueue,
  canTransition,
  clearQueue,
  emptyQueue,
  initialState,
  parseQueue,
  QUEUE_STORAGE_KEY,
  removeFromQueue,
  setQueueState,
} from "@/lib/sourcing/queue";
import type { Candidate } from "@/lib/sourcing/types";

function candidate(id: string, existingId: string | null = null): Candidate {
  return {
    id,
    name: `Candidate ${id}`,
    domain: null,
    normalizedDomain: null,
    description: null,
    identityConfidence: "confirmed",
    discoveredAt: "2026-09-08T00:00:00.000Z",
    provenance: [
      {
        engineId: "headline-radar",
        engineName: "Headline Radar",
        transport: "public_feed",
        feedId: "f",
        feedName: "F",
        feedUrl: "https://f.example.com/rss",
        sourceTitle: "t",
        sourceUrl: "https://f.example.com/x",
        sourcePublisher: "P",
        sourcePublishedAt: null,
        discoveredAt: "2026-09-08T00:00:00.000Z",
        sourceItemId: "i",
        discoveryReason: "funding announcement",
        matchedTerms: [],
      },
    ],
    existing: existingId
      ? { companyId: existingId, method: "domain", detail: "match" }
      : { companyId: null, method: "none", detail: "no canonical match" },
    relevance: "strong",
    relevanceTerms: ["crypto"],
    discoveryUtility: "high",
    category: null,
    whySurfaced: "Strong digital-asset relevance (crypto); high discovery utility; funding announcement.",
  };
}

const NOW = "2026-09-08T12:00:00.000Z";

describe("research queue", () => {
  it("enters new candidates as DISCOVERED and matched ones as ALREADY_RESEARCHED", () => {
    expect(initialState(candidate("a"))).toBe("DISCOVERED");
    expect(initialState(candidate("b", "co-x"))).toBe("ALREADY_RESEARCHED");
  });

  it("adds a candidate once and is idempotent", () => {
    let q = addToQueue(emptyQueue(), candidate("a"), NOW);
    q = addToQueue(q, candidate("a"), NOW);
    expect(q.entries).toHaveLength(1);
    expect(q.entries[0]!.candidate.id).toBe("a");
  });

  it("only allows workflow transitions, never an investment state", () => {
    expect(canTransition("DISCOVERED", "QUEUED_FOR_RESEARCH")).toBe(true);
    expect(canTransition("QUEUED_FOR_RESEARCH", "RESEARCH_IN_PROGRESS")).toBe(true);
    expect(canTransition("RESEARCH_IN_PROGRESS", "RESEARCH_HANDOFF_READY")).toBe(true);
    expect(canTransition("DISCOVERED", "RESEARCH_HANDOFF_READY")).toBe(false);
    // No investment states exist at all.
    // @ts-expect-error PASS is not a QueueState
    expect(canTransition("DISCOVERED", "PASS")).toBe(false);
  });

  it("advances state and stamps updatedAt, ignoring illegal transitions", () => {
    let q = addToQueue(emptyQueue(), candidate("a"), NOW);
    q = setQueueState(q, "a", "QUEUED_FOR_RESEARCH", NOW);
    expect(q.entries[0]!.state).toBe("QUEUED_FOR_RESEARCH");
    q = setQueueState(q, "a", "RESEARCH_HANDOFF_READY", NOW);
    expect(q.entries[0]!.state).toBe("QUEUED_FOR_RESEARCH"); // illegal, unchanged
  });

  it("removes and clears", () => {
    let q = addToQueue(emptyQueue(), candidate("a"), NOW);
    q = addToQueue(q, candidate("b"), NOW);
    expect(removeFromQueue(q, "a").entries).toHaveLength(1);
    expect(clearQueue().entries).toHaveLength(0);
  });

  it("stores the queue under this product's own browser-local namespace", () => {
    // No OriginationIQ namespace: this standalone product never reads another
    // product's local queue, so there is deliberately no compatibility alias.
    expect(QUEUE_STORAGE_KEY).toBe("davi.sourcing.queue.v1");
    expect(QUEUE_STORAGE_KEY).not.toMatch(/origination/i);
  });

  it("parses a persisted snapshot defensively", () => {
    expect(parseQueue(null).entries).toEqual([]);
    expect(parseQueue("not json").entries).toEqual([]);
    expect(parseQueue('{"entries":"nope"}').entries).toEqual([]);
    const good = JSON.stringify(addToQueue(emptyQueue(), candidate("a"), NOW));
    expect(parseQueue(good).entries).toHaveLength(1);
  });
});
