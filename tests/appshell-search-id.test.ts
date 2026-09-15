import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * AppShell renders CompanySearch twice (mobile top bar + desktop sidebar). Both
 * instances live in the DOM at once, so each must be given a unique id prop -
 * otherwise the search input, its listbox and its options collide on duplicate
 * ids, which is invalid HTML and breaks the aria-controls / aria-activedescendant
 * wiring for assistive tech.
 */
function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");
}

describe("AppShell CompanySearch ids", () => {
  const shell = read("components/AppShell.tsx");

  it("passes an explicit id to every CompanySearch instance", () => {
    const uses = [...shell.matchAll(/<CompanySearch\b[^>]*>/g)].map((m) => m[0]);
    expect(uses.length).toBeGreaterThan(1);
    for (const use of uses) {
      expect(use).toMatch(/\bid="company-search-[a-z]+"/);
    }
  });

  it("gives each instance a distinct id", () => {
    const ids = [...shell.matchAll(/id="(company-search-[a-z]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(1);
  });

  it("CompanySearch derives all internal ids from the id prop", () => {
    const src = read("components/CompanySearch.tsx");
    // No hard-coded element ids left that would duplicate across instances.
    expect(src).not.toMatch(/id="company-search"/);
    expect(src).not.toMatch(/id="company-search-results"/);
    expect(src).not.toMatch(/`csr-\$/);
    expect(src).toContain("const listboxId = `${id}-results`");
  });
});
