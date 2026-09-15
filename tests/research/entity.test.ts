import { describe, it, expect } from "vitest";
import {
  normalizeCompanyName,
  normalizeDomain,
  isSameSite,
  domainKey,
} from "@/lib/research/entity/normalize";
import {
  buildResolver,
  isAutoResolvable,
  withinEditDistanceOne,
  MIN_AUTO_RESOLVE_CONFIDENCE,
  type ResolvableCompany,
} from "@/lib/research/entity/resolve";

/**
 * Entity resolution.
 *
 * Names in this suite are deliberately ambiguous English words, which is the
 * hard case in practice: Scout, Atlas, Sierra, Harvey, Mercury. They are
 * synthetic fixtures on example domains, so the tests do not depend on any
 * real company being in the corpus.
 *
 * The governing asymmetry: a wrong merge is unrecoverable, because once two
 * companies share an id nothing downstream can tell they were ever separate.
 * An unresolved record costs one review-queue entry. So the resolver declines
 * whenever evidence is thin.
 */

const UNIVERSE: ResolvableCompany[] = [
  { id: "co-scout-analytics", name: "Scout Analytics", domain: "scoutanalytics.example", aliases: ["Scout"] },
  { id: "co-scout-robotics", name: "Scout Robotics", domain: "scoutrobotics.example", aliases: ["Scout"] },
  { id: "co-atlas-freight", name: "Atlas Freight", domain: "atlasfreight.example", aliases: [] },
  { id: "co-sierra-labs", name: "Sierra Labs", domain: "sierra.example", aliases: ["Sierra"] },
  { id: "co-harvey-legal", name: "Harvey Legal Systems", domain: "harveylegal.example", aliases: [] },
  { id: "co-mercury-pay", name: "Mercury Payments", domain: "mercurypay.example", aliases: ["MercPay"] },
  { id: "co-notacme", name: "Notacme Holdings", domain: "notacme.example", aliases: [] },
  { id: "co-acme", name: "Acme", domain: "acme.example", aliases: [] },
];

const resolver = buildResolver(UNIVERSE);

describe("domain normalisation", () => {
  it("strips scheme, www, port, path, and credentials", () => {
    for (const raw of [
      "https://www.acme.example/pricing",
      "http://acme.example:8080",
      "ACME.EXAMPLE",
      "acme.example/",
    ]) {
      expect(normalizeDomain(raw), raw).toBe("acme.example");
    }
  });

  it("returns null for values that are not hosts", () => {
    for (const raw of ["", "not a domain", "localhost", null, undefined]) {
      expect(normalizeDomain(raw as string | null), String(raw)).toBeNull();
    }
  });

  it("matches subdomains only at a dot boundary", () => {
    expect(isSameSite("acme.example", "acme.example")).toBe(true);
    expect(isSameSite("docs.acme.example", "acme.example")).toBe(true);
    expect(isSameSite("a.b.acme.example", "acme.example")).toBe(true);
  });

  it("NEVER matches a substring", () => {
    // The specific bug the dot boundary exists to prevent. An endsWith check
    // without the dot would return true here and merge two companies.
    expect(isSameSite("notacme.example", "acme.example")).toBe(false);
    expect(isSameSite("acme.example.evil.test", "acme.example")).toBe(false);
  });

  it("derives a dedup key that collapses subdomains but not sibling brands", () => {
    expect(domainKey("docs.acme.ai")).toBe(domainKey("acme.ai"));
    expect(domainKey("acme.ai")).not.toBe(domainKey("acme-labs.io"));
  });
});

describe("name normalisation is separate from domain normalisation", () => {
  it("strips corporate suffix words from names", () => {
    expect(normalizeCompanyName("Acme Inc")).toBe(normalizeCompanyName("Acme"));
    expect(normalizeCompanyName("Acme Labs")).toBe(normalizeCompanyName("Acme"));
    expect(normalizeCompanyName("Acme Technologies Ltd")).toBe(normalizeCompanyName("Acme"));
  });

  it("does NOT apply those rules to domains", () => {
    // acme.ai and acme-labs.io are different companies. Applying name rules to
    // domains would merge them, which is the most damaging possible error.
    expect(domainKey("acme.ai")).not.toBe(domainKey("acmelabs.io"));
  });

  it("never normalises to an empty key", () => {
    expect(normalizeCompanyName("Systems")).not.toBe("");
    expect(normalizeCompanyName("The Group")).not.toBe("");
  });
});

describe("resolution priority", () => {
  it("a canonical id wins", () => {
    const result = resolver.resolve({ companyId: "co-acme" });
    expect(result.companyId).toBe("co-acme");
    expect(result.method).toBe("exact");
  });

  it("a canonical id that does not exist fails loudly rather than falling back", () => {
    const result = resolver.resolve({ companyId: "co-does-not-exist", name: "Acme" });
    expect(result.companyId).toBeNull();
    expect(result.detail).toContain("no such company");
  });

  it("an exact domain wins over a conflicting name", () => {
    // Where something lives beats what it is called.
    const result = resolver.resolve({ name: "Sierra Labs", domain: "acme.example" });
    expect(result.companyId).toBe("co-acme");
    expect(result.method).toBe("domain");
  });

  it("an alias does not override a conflicting domain", () => {
    const result = resolver.resolve({ name: "Scout", domain: "mercurypay.example" });
    expect(result.companyId).toBe("co-mercury-pay");
    expect(result.method).toBe("domain");
  });

  it("a subdomain resolves at a dot boundary", () => {
    const result = resolver.resolve({ domain: "https://docs.harveylegal.example/api" });
    expect(result.companyId).toBe("co-harvey-legal");
    expect(result.method).toBe("domain");
  });

  it("a substring domain does NOT create a match", () => {
    const result = resolver.resolve({ domain: "notacme.example" });
    expect(result.companyId).toBe("co-notacme");
    expect(result.companyId).not.toBe("co-acme");
  });

  it("an unknown domain resolves to nothing rather than falling through to the name", () => {
    // Falling back to a name match here is how a record about one company gets
    // attached to another that happens to share a word.
    const result = resolver.resolve({ name: "Acme", domain: "unknown-company.example" });
    expect(result.companyId).toBeNull();
    expect(result.detail).toContain("does not belong to any company");
  });
});

describe("ambiguity stays unresolved", () => {
  it("an alias claimed by two companies is refused", () => {
    const result = resolver.resolve({ name: "Scout" });
    expect(result.companyId).toBeNull();
    expect(result.method).toBe("unresolved");
    expect(result.candidates).toEqual(["co-scout-analytics", "co-scout-robotics"]);
  });

  it("ambiguity reports every candidate rather than picking one", () => {
    const result = resolver.resolve({ name: "Scout" });
    expect(result.candidates.length).toBe(2);
  });

  it("a domain disambiguates what a name cannot", () => {
    const result = resolver.resolve({ name: "Scout", domain: "scoutrobotics.example" });
    expect(result.companyId).toBe("co-scout-robotics");
  });

  it("two companies with similar names remain distinct", () => {
    expect(resolver.resolve({ domain: "scoutanalytics.example" }).companyId).toBe("co-scout-analytics");
    expect(resolver.resolve({ domain: "scoutrobotics.example" }).companyId).toBe("co-scout-robotics");
  });
});

describe("a name-only match is below the approval threshold", () => {
  it("resolves by name but at capped confidence", () => {
    const result = resolver.resolve({ name: "Harvey Legal Systems" });
    expect(result.companyId).toBe("co-harvey-legal");
    expect(result.method).toBe("fuzzy");
    expect(result.confidence).toBeLessThan(MIN_AUTO_RESOLVE_CONFIDENCE);
  });

  it("is therefore not auto-resolvable without a domain", () => {
    expect(isAutoResolvable(resolver.resolve({ name: "Harvey Legal Systems" }))).toBe(false);
    expect(isAutoResolvable(resolver.resolve({ domain: "harveylegal.example" }))).toBe(true);
  });

  it("an unambiguous alias IS auto-resolvable", () => {
    const result = resolver.resolve({ name: "MercPay" });
    expect(result.method).toBe("alias");
    expect(isAutoResolvable(result)).toBe(true);
  });

  it("an alias identical to the company's own normalised name is not double counted", () => {
    // "Sierra Labs" normalises to "sierra" because Labs is a suffix word, so
    // the alias "Sierra" is redundant. It resolves by name, at name-level
    // confidence, rather than being promoted to a stronger alias match.
    const result = resolver.resolve({ name: "Sierra" });
    expect(result.companyId).toBe("co-sierra-labs");
    expect(result.method).toBe("fuzzy");
    expect(result.confidence).toBeLessThan(MIN_AUTO_RESOLVE_CONFIDENCE);
  });
});

describe("bounded fuzzy matching", () => {
  it("accepts a single character difference", () => {
    expect(withinEditDistanceOne("mercurypayments", "mercurypayment")).toBe(true);
    expect(withinEditDistanceOne("atlas", "atlaz")).toBe(true);
  });

  it("rejects two or more differences", () => {
    expect(withinEditDistanceOne("mercury", "mercvry1")).toBe(false);
    expect(withinEditDistanceOne("scout", "shout1")).toBe(false);
  });

  it("does not fuzzy match short names, where one character is a large share", () => {
    const result = resolver.resolve({ name: "Atla" });
    expect(result.companyId).toBeNull();
  });
});

describe("nothing to work with", () => {
  it("returns unresolved when no identity is supplied", () => {
    const result = resolver.resolve({});
    expect(result.companyId).toBeNull();
    expect(result.method).toBe("unresolved");
  });
});
