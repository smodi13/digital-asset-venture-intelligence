import { describe, it, expect } from "vitest";
import {
  matchHeadline,
  isAcceptableMatch,
  HEADLINE_PATTERNS,
  MIN_HEADLINE_CONFIDENCE,
} from "@/lib/research/headline/matcher";
import { headlineAdapter } from "@/lib/research/headline/adapter";
import { diffText, normalizeText, normalizedTextHash, rawContentHash } from "@/lib/research/diff";
import {
  companyId,
  personId,
  sourceId,
  evidenceClaimId,
  signalEventId,
  normalizeUrlForIdentity,
  slugify,
} from "@/lib/research/ids";
import { pageSnapshotSchema, isMaterialChange } from "@/lib/research/snapshot";
import { SCHEMA_VERSION } from "@/lib/schemas";
import { NOT_ESTABLISHED } from "@/lib/schemas/availability";

/* -------------------------------------------------------------------------- */
/* Headline matching                                                          */
/* -------------------------------------------------------------------------- */

describe("headline pattern matching", () => {
  it("classifies a financing headline", () => {
    const result = matchHeadline("Acme raises a Series B");
    expect(result.best?.signalType).toBe("funding");
    expect(result.best?.matchedPhrase).toBeTruthy();
  });

  it("classifies a partnership headline", () => {
    expect(matchHeadline("Acme partners with a banking platform").best?.signalType).toBe(
      "partnership",
    );
  });

  it("classifies a departure headline as negative", () => {
    const result = matchHeadline("Acme chief technology officer steps down");
    expect(result.best?.signalType).toBe("leadership_departure");
    expect(result.best?.direction).toBe("negative");
  });

  it("does NOT classify 'raises concerns' as a financing event", () => {
    // A verb table with no negative context produces confident nonsense on
    // ordinary English. This is the case that motivates the notWhen field.
    const result = matchHeadline("Regulator raises concerns about Acme");
    const types = result.all.map((m) => m.signalType);
    expect(types).not.toContain("funding");
  });

  it("does not match a phrase inside a longer word", () => {
    // "opens" must not match "openstack"; "wins" must not match "winsome".
    expect(matchHeadline("Acme adopts openstack").best?.signalType).not.toBe(
      "geographic_expansion",
    );
    expect(matchHeadline("A winsome brand refresh").best).toBeNull();
  });

  it("returns null for a headline with no event", () => {
    const result = matchHeadline("Acme reflects on a decade of operations");
    expect(result.best).toBeNull();
    expect(isAcceptableMatch(result)).toBe(false);
  });

  it("prefers the more specific phrase at equal confidence", () => {
    const result = matchHeadline("Acme partners with a platform");
    expect(result.best?.matchedPhrase).toBe("partners with");
  });

  it("flags ambiguity when two signal types compete", () => {
    const result = matchHeadline("Acme launches and introduces new pricing");
    expect(result.all.length).toBeGreaterThan(1);
  });

  it("is deterministic across repeated calls", () => {
    const headline = "Acme appoints a chief revenue officer and opens an office";
    const first = JSON.stringify(matchHeadline(headline));
    for (let i = 0; i < 5; i += 1) {
      expect(JSON.stringify(matchHeadline(headline))).toBe(first);
    }
  });

  it("never returns an investment score", () => {
    const result = matchHeadline("Acme raises a Series B");
    expect(result.best).not.toBeNull();
    expect(Object.keys(result.best ?? {})).not.toContain("score");
  });

  it("every pattern maps to a confidence between 0 and 1", () => {
    for (const pattern of HEADLINE_PATTERNS) {
      expect(pattern.confidence).toBeGreaterThan(0);
      expect(pattern.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("a low-confidence match is not acceptable without review", () => {
    const weak = matchHeadline("Acme leaves the beta programme");
    if (weak.best) expect(weak.best.confidence).toBeLessThan(MIN_HEADLINE_CONFIDENCE);
    expect(isAcceptableMatch(weak)).toBe(false);
  });
});

describe("the headline adapter", () => {
  const baseHeadline = {
    publisher: "Example Press",
    url: "https://example.com/story",
    publicationDate: "2025-11-12",
    availabilityDate: "2025-11-12",
    availabilityEvidence: {
      method: "intrinsic_timestamp" as const,
      sourceUrl: "https://example.com/story",
      sourceRecordId: null,
      note: null,
    },
    companyHint: "acme.example",
    summary: "A paraphrased factual summary.",
    sourceType: "independent_journalism" as const,
    confidence: "medium" as const,
  };

  it("emits a candidate for a classifiable headline", () => {
    const result = headlineAdapter.collect({
      headlines: [{ ...baseHeadline, headline: "Acme partners with a platform" }],
    });
    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0]?.classification?.signalType).toBe("partnership");
    expect(result.candidates[0]?.classification?.matchedOn).toBe("partners with");
  });

  it("rejects an unclassifiable headline rather than guessing", () => {
    const result = headlineAdapter.collect({
      headlines: [{ ...baseHeadline, headline: "Acme reflects on a decade" }],
    });
    expect(result.candidates.length).toBe(0);
    expect(result.rejected[0]?.reason).toBe("unsupported_event_classification");
  });

  it("produces a candidate, never a finished SignalEvent", () => {
    // A candidate has no id and no ingestion stamp: it has not passed the
    // ingestion boundary and has not been resolved to a company.
    const result = headlineAdapter.collect({
      headlines: [{ ...baseHeadline, headline: "Acme partners with a platform" }],
    });
    const candidate = result.candidates[0];
    expect(candidate).toBeDefined();
    expect("id" in (candidate ?? {})).toBe(false);
    expect("ingestedAt" in (candidate ?? {})).toBe(false);
  });

  it("declares that it needs no network", () => {
    expect(headlineAdapter.requiresNetwork).toBe(false);
    expect(headlineAdapter.transport).toBe("research_file");
  });

  it("carries availability evidence straight through", () => {
    const result = headlineAdapter.collect({
      headlines: [
        {
          ...baseHeadline,
          headline: "Acme partners with a platform",
          availabilityDate: null,
          availabilityEvidence: NOT_ESTABLISHED,
        },
      ],
    });
    expect(result.candidates[0]?.temporal.availabilityEvidence.method).toBe("not_established");
  });
});

/* -------------------------------------------------------------------------- */
/* Stable ids                                                                 */
/* -------------------------------------------------------------------------- */

describe("stable id generation", () => {
  it("derives a company id from the domain when there is one", () => {
    expect(companyId({ name: "Acme", domain: "acme.example" })).toBe("co-acme-example");
  });

  it("is stable across repeated calls", () => {
    const a = companyId({ name: "Acme Labs", domain: null });
    for (let i = 0; i < 5; i += 1) {
      expect(companyId({ name: "Acme Labs", domain: null })).toBe(a);
    }
  });

  it("does not depend on position in a file", () => {
    // Inserting a company at the top of companies.yaml must not renumber
    // everything below it and break every stored reference.
    const first = companyId({ name: "Beta", domain: "beta.example" });
    const second = companyId({ name: "Beta", domain: "beta.example" });
    expect(first).toBe(second);
  });

  it("keeps two companies with the same name distinct", () => {
    expect(companyId({ name: "Atlas", domain: "atlas-a.example" })).not.toBe(
      companyId({ name: "Atlas", domain: "atlas-b.example" }),
    );
  });

  it("throws rather than producing an empty id", () => {
    expect(() => companyId({ name: "   ", domain: null })).toThrow();
  });

  it("normalises a URL so one page yields one source id", () => {
    const canonical = sourceId({ url: "https://example.com/a", publisher: "P", title: "T" });
    for (const variant of [
      "https://www.example.com/a",
      "https://example.com/a/",
      "https://example.com/a#section",
      "https://example.com/a?utm_source=x",
    ]) {
      expect(sourceId({ url: variant, publisher: "Other", title: "Other" }), variant).toBe(
        canonical,
      );
    }
  });

  it("keeps genuinely different pages apart", () => {
    expect(sourceId({ url: "https://example.com/a", publisher: "P", title: "T" })).not.toBe(
      sourceId({ url: "https://example.com/b", publisher: "P", title: "T" }),
    );
  });

  it("preserves meaningful query parameters", () => {
    expect(normalizeUrlForIdentity("https://example.com/a?id=1")).not.toBe(
      normalizeUrlForIdentity("https://example.com/a?id=2"),
    );
  });

  it("derives claim and event ids deterministically", () => {
    const claim = { companyId: "co-1", sourceId: "src-1", claim: "A claim." };
    expect(evidenceClaimId(claim)).toBe(evidenceClaimId(claim));
    const event = {
      companyKey: "co-1",
      sourceId: "src-1",
      signalType: "funding",
      publicationDate: "2025-01-01",
    };
    expect(signalEventId(event)).toBe(signalEventId(event));
    expect(signalEventId({ ...event, signalType: "product_launch" })).not.toBe(
      signalEventId(event),
    );
  });

  it("scopes a person id to their company", () => {
    expect(personId({ name: "Alex Doe", companyId: "co-a" })).not.toBe(
      personId({ name: "Alex Doe", companyId: "co-b" }),
    );
  });

  it("slugifies accented and punctuated names", () => {
    expect(slugify("Café Systems, Inc.")).toBe("cafe-systems-inc");
    expect(slugify("!!!")).toBe("");
  });

  it("does not silently drop a name it cannot transliterate", () => {
    // Characters that do not decompose under NFKD, such as the ae ligature,
    // are removed rather than transliterated. The id still has a hash suffix
    // when built from a name, so two such companies stay distinct even if
    // their slugs collide. Worth knowing rather than assuming.
    expect(companyId({ name: "Ærø Systems", domain: null })).not.toBe(
      companyId({ name: "Ørsted Systems", domain: null }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Snapshot hashing and text diff                                             */
/* -------------------------------------------------------------------------- */

describe("snapshot hashing", () => {
  it("hashes normalised text, so formatting churn does not register", () => {
    expect(normalizedTextHash("Hello   world\n\n")).toBe(normalizedTextHash("Hello world"));
  });

  it("hashes raw content separately", () => {
    expect(rawContentHash("Hello   world")).not.toBe(rawContentHash("Hello world"));
  });

  it("validates a snapshot record", () => {
    const parsed = pageSnapshotSchema.safeParse({
      id: "snap-1",
      schemaVersion: SCHEMA_VERSION,
      companyId: "co-1",
      url: "https://example.com/pricing",
      pageType: "pricing",
      observedAt: "2026-01-01T00:00:00.000Z",
      contentHash: "a".repeat(64),
      normalizedTextHash: "b".repeat(64),
      selector: "main .pricing",
      regionDescription: "The pricing table region.",
      normalizedLength: 420,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a malformed hash", () => {
    const parsed = pageSnapshotSchema.safeParse({
      id: "snap-1",
      schemaVersion: SCHEMA_VERSION,
      companyId: "co-1",
      url: "https://example.com/pricing",
      pageType: "pricing",
      observedAt: "2026-01-01T00:00:00.000Z",
      contentHash: "not-a-hash",
      normalizedTextHash: "b".repeat(64),
      regionDescription: "region",
      normalizedLength: 1,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("text diff", () => {
  it("reports no change for identical text", () => {
    const result = diffText("Alpha\nBeta", "Alpha\nBeta");
    expect(result.changed).toBe(false);
    expect(result.changeMagnitude).toBe(0);
    expect(result.previousHash).toBe(result.currentHash);
  });

  it("treats a whitespace-only change as no change and says so", () => {
    const result = diffText("Alpha\nBeta", "  Alpha  \n\n\tBeta  ");
    expect(result.changed).toBe(false);
    expect(result.whitespaceOnly).toBe(true);
  });

  it("detects a meaningful addition", () => {
    const result = diffText("Alpha\nBeta", "Alpha\nBeta\nGamma");
    expect(result.changed).toBe(true);
    expect(result.addedText).toEqual(["Gamma"]);
    expect(result.removedText).toEqual([]);
  });

  it("detects a meaningful removal", () => {
    const result = diffText("Alpha\nBeta\nGamma", "Alpha\nBeta");
    expect(result.changed).toBe(true);
    expect(result.removedText).toEqual(["Gamma"]);
  });

  it("reports a large change with a high magnitude", () => {
    const previous = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n");
    const current = Array.from({ length: 10 }, (_, i) => `different ${i}`).join("\n");
    const result = diffText(previous, current);
    expect(result.changeMagnitude).toBe(1);
  });

  it("handles an empty page on either side", () => {
    expect(diffText("", "Alpha").addedText).toEqual(["Alpha"]);
    expect(diffText("Alpha", "").removedText).toEqual(["Alpha"]);
    expect(diffText("", "").changed).toBe(false);
  });

  it("drops configured boilerplate before comparing", () => {
    const result = diffText(
      "Home About Contact\nReal content",
      "Home About Contact Careers\nReal content",
      { boilerplatePatterns: ["^Home About Contact"] },
    );
    expect(result.changed).toBe(false);
  });

  it("masks configured dynamic content", () => {
    const result = diffText(
      "Updated 2025-01-01\nContent",
      "Updated 2026-06-06\nContent",
      { dynamicPatterns: ["\\d{4}-\\d{2}-\\d{2}"] },
    );
    expect(result.changed).toBe(false);
  });

  it("caps snippets so a diff never carries an article body", () => {
    const long = "x".repeat(1000);
    const result = diffText("", long);
    expect(result.addedText[0]?.length).toBeLessThanOrEqual(280);
  });

  it("caps the number of snippets but reports the true counts", () => {
    const current = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const result = diffText("", current);
    expect(result.addedText.length).toBeLessThanOrEqual(10);
    expect(result.addedCount).toBe(50);
  });

  it("counts repeated lines as a multiset", () => {
    const result = diffText("a\na\na", "a\na");
    expect(result.removedCount).toBe(1);
  });

  it("normalises deterministically", () => {
    expect(normalizeText("  a  \n\n b ")).toBe("a\nb");
  });

  it("flags a material change against a threshold", () => {
    const change = {
      companyId: "co-1",
      url: "https://example.com/p",
      pageType: "pricing" as const,
      previousSnapshotId: "snap-1",
      currentSnapshotId: "snap-2",
      previousObservedAt: "2026-01-01T00:00:00.000Z",
      currentObservedAt: "2026-02-01T00:00:00.000Z",
      previousHash: "a",
      currentHash: "b",
      addedText: [],
      removedText: [],
      addedCount: 1,
      removedCount: 0,
      changeMagnitude: 0.5,
    };
    expect(isMaterialChange(change)).toBe(true);
    expect(isMaterialChange({ ...change, changeMagnitude: 0.01 })).toBe(false);
  });
});
