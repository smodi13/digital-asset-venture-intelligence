import { describe, it, expect } from "vitest";
import { dedupe } from "@/lib/research/dedupe";
import {
  buildIndependenceContext,
  countIndependentSources,
  areSourcesIndependent,
  originOf,
} from "@/lib/research/independence";
import { sourceRecordSchema, SCHEMA_VERSION } from "@/lib/schemas";
import { loadSourcesConfig } from "@/lib/config/load";

/* -------------------------------------------------------------------------- */
/* Deduplication                                                              */
/* -------------------------------------------------------------------------- */

describe("deduplication merges only on strong keys", () => {
  it("merges records sharing a canonical domain", () => {
    const result = dedupe([
      { id: "a", domain: "acme.example", name: "Acme" },
      { id: "b", domain: "docs.acme.example", name: "Acme Documentation" },
    ]);
    expect(result.duplicateGroups.length).toBe(1);
    expect(result.duplicateGroups[0]?.memberIds).toEqual(["a", "b"]);
    expect(result.canonicalById.get("b")).toBe("a");
  });

  it("merges records sharing a source record id", () => {
    const result = dedupe([
      { id: "a", sourceRecordId: "filing-1" },
      { id: "b", sourceRecordId: "filing-1" },
    ]);
    expect(result.duplicateGroups.length).toBe(1);
  });

  it("merges records sharing a verified organisation id", () => {
    const result = dedupe([
      { id: "a", organizationId: "org-7" },
      { id: "b", organizationId: "org-7" },
    ]);
    expect(result.duplicateGroups.length).toBe(1);
  });

  it("does NOT merge on similar names alone", () => {
    // Suggestive, never sufficient. A wrong merge is unrecoverable.
    const result = dedupe([
      { id: "a", domain: "acme.example", name: "Acme Inc" },
      { id: "b", domain: "acme-labs.example", name: "Acme Labs" },
    ]);
    expect(result.duplicateGroups.length).toBe(0);
    expect(result.canonicalById.get("a")).toBe("a");
    expect(result.canonicalById.get("b")).toBe("b");
  });

  it("reports a name collision instead of merging it", () => {
    const result = dedupe([
      { id: "a", domain: "acme.example", name: "Acme Inc" },
      { id: "b", domain: "acme-labs.example", name: "Acme Labs" },
    ]);
    expect(result.nameCollisions.length).toBe(1);
    expect(result.nameCollisions[0]?.ids).toEqual(["a", "b"]);
  });

  it("does not report a name collision when the records already merged", () => {
    const result = dedupe([
      { id: "a", domain: "acme.example", name: "Acme" },
      { id: "b", domain: "www.acme.example", name: "Acme Inc" },
    ]);
    expect(result.duplicateGroups.length).toBe(1);
    expect(result.nameCollisions).toEqual([]);
  });

  it("is deterministic regardless of input order", () => {
    const forward = dedupe([
      { id: "b", domain: "acme.example" },
      { id: "a", domain: "acme.example" },
      { id: "c", domain: "other.example" },
    ]);
    const reverse = dedupe([
      { id: "c", domain: "other.example" },
      { id: "a", domain: "acme.example" },
      { id: "b", domain: "acme.example" },
    ]);
    expect(forward.groups).toEqual(reverse.groups);
    expect(forward.canonicalById.get("b")).toBe("a");
    expect(reverse.canonicalById.get("b")).toBe("a");
  });

  it("chains transitively through a shared key", () => {
    const result = dedupe([
      { id: "a", domain: "acme.example", sourceRecordId: "x" },
      { id: "b", sourceRecordId: "x", organizationId: "org-1" },
      { id: "c", organizationId: "org-1" },
    ]);
    expect(result.duplicateGroups[0]?.memberIds).toEqual(["a", "b", "c"]);
  });

  it("records which keys caused a merge", () => {
    const result = dedupe([
      { id: "a", domain: "acme.example" },
      { id: "b", domain: "acme.example" },
    ]);
    expect(result.duplicateGroups[0]?.mergedOn.some((k) => k.startsWith("domain:"))).toBe(true);
  });

  it("leaves records with no strong key alone", () => {
    const result = dedupe([{ id: "a", name: "Acme" }, { id: "b", name: "Beta" }]);
    expect(result.duplicateGroups.length).toBe(0);
    expect(result.groups.length).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Source independence                                                        */
/* -------------------------------------------------------------------------- */

const config = loadSourcesConfig();

function source(input: {
  id: string;
  sourceType: "official_company" | "independent_journalism" | "specialist_industry" | "regulatory" | "analyst_inference";
  isPressReleaseReproduction?: boolean;
  originatesFrom?: string | null;
}) {
  return sourceRecordSchema.parse({
    id: input.id,
    schemaVersion: SCHEMA_VERSION,
    publisher: `Publisher ${input.id}`,
    title: `Title ${input.id}`,
    url: `https://example.com/${input.id}`,
    sourceType: input.sourceType,
    tier: "b",
    reliability: 0.7,
    accessedAt: "2026-01-01T00:00:00.000Z",
    publishedAt: "2025-11-04",
    isPressReleaseReproduction: input.isPressReleaseReproduction ?? false,
    originatesFrom: input.originatesFrom ?? null,
  });
}

describe("source independence", () => {
  const announcement = source({ id: "src-announcement", sourceType: "official_company" });
  const wireA = source({
    id: "src-wire-a",
    sourceType: "independent_journalism",
    isPressReleaseReproduction: true,
    originatesFrom: "src-announcement",
  });
  const wireB = source({
    id: "src-wire-b",
    sourceType: "independent_journalism",
    isPressReleaseReproduction: true,
    originatesFrom: "src-announcement",
  });
  const originalReporting = source({ id: "src-original", sourceType: "independent_journalism" });
  const trade = source({ id: "src-trade", sourceType: "specialist_industry" });
  const filing = source({ id: "src-filing", sourceType: "regulatory" });
  const inference = source({ id: "src-inference", sourceType: "analyst_inference" });

  const context = buildIndependenceContext(
    [announcement, wireA, wireB, originalReporting, trade, filing, inference],
    config,
  );

  it("the same source is never independent of itself", () => {
    expect(areSourcesIndependent("src-wire-a", "src-wire-a", context)).toEqual({
      independent: false,
      reason: "same_source",
    });
  });

  it("two wire copies of one announcement are one voice", () => {
    const result = areSourcesIndependent("src-wire-a", "src-wire-b", context);
    expect(result.independent).toBe(false);
    expect(result.reason).toBe("shared_origin");
  });

  it("a wire copy does not corroborate the announcement it reproduces", () => {
    expect(areSourcesIndependent("src-wire-a", "src-announcement", context).independent).toBe(false);
  });

  it("a company source cannot corroborate anything, including itself", () => {
    // It establishes what the company says, which is often what is wanted, and
    // it never independently confirms its own claim.
    expect(areSourcesIndependent("src-announcement", "src-original", context)).toEqual({
      independent: false,
      reason: "source_cannot_corroborate",
    });
  });

  it("analyst inference never corroborates", () => {
    expect(areSourcesIndependent("src-inference", "src-original", context).independent).toBe(false);
  });

  it("genuinely independent reporting does corroborate", () => {
    expect(areSourcesIndependent("src-original", "src-trade", context)).toEqual({
      independent: true,
      reason: null,
    });
    expect(areSourcesIndependent("src-original", "src-filing", context).independent).toBe(true);
  });

  it("an unknown source is not assumed independent", () => {
    expect(areSourcesIndependent("src-unknown", "src-original", context).independent).toBe(false);
  });

  it("follows the origin chain", () => {
    expect(originOf("src-wire-a", context)).toBe("src-announcement");
    expect(originOf("src-original", context)).toBe("src-original");
  });

  it("survives a cyclic origin chain rather than hanging", () => {
    // Research files are hand authored, so a cycle is a realistic mistake.
    const a = source({ id: "src-cycle-a", sourceType: "independent_journalism", originatesFrom: "src-cycle-b" });
    const b = source({ id: "src-cycle-b", sourceType: "independent_journalism", originatesFrom: "src-cycle-a" });
    const cyclic = buildIndependenceContext([a, b], config);
    expect(typeof originOf("src-cycle-a", cyclic)).toBe("string");
  });
});

describe("counting independent sources", () => {
  const announcement = source({ id: "src-announcement", sourceType: "official_company" });
  const wires = Array.from({ length: 10 }, (_, i) =>
    source({
      id: `src-wire-${i}`,
      sourceType: "independent_journalism",
      isPressReleaseReproduction: true,
      originatesFrom: "src-announcement",
    }),
  );
  const original = source({ id: "src-original", sourceType: "independent_journalism" });
  const trade = source({ id: "src-trade", sourceType: "specialist_industry" });
  const context = buildIndependenceContext([announcement, ...wires, original, trade], config);

  it("ten copies of one announcement count as one voice, not ten", () => {
    // The negative specification in config/scoring.yaml names this explicitly.
    // Counting reproductions rewards public relations spend and calls it
    // evidence. This is where that rule is actually enforced.
    const summary = countIndependentSources(
      wires.map((w) => w.id),
      context,
    );
    expect(summary.rawSourceCount).toBe(10);
    expect(summary.independentSourceCount).toBe(1);
  });

  it("counts genuinely distinct reporting separately", () => {
    const summary = countIndependentSources(["src-original", "src-trade"], context);
    expect(summary.independentSourceCount).toBe(2);
  });

  it("excludes a first-party source from the count and says why", () => {
    const summary = countIndependentSources(["src-announcement", "src-original"], context);
    expect(summary.independentSourceCount).toBe(1);
    expect(summary.excluded[0]?.reason).toContain("cannot corroborate");
  });

  it("collapses duplicates in the input list", () => {
    const summary = countIndependentSources(
      ["src-original", "src-original", "src-trade"],
      context,
    );
    expect(summary.rawSourceCount).toBe(2);
    expect(summary.independentSourceCount).toBe(2);
  });

  it("a mixed set counts the announcement family once and the original once", () => {
    const summary = countIndependentSources(
      [...wires.map((w) => w.id), "src-original"],
      context,
    );
    expect(summary.independentSourceCount).toBe(2);
  });
});
