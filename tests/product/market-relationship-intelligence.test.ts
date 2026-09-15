import { describe, it, expect, beforeEach } from "vitest";
import {
  getMarketMap,
  getRelationshipIntelligence,
  getPeopleDirectory,
  getCompanyBySlug,
  __resetDigitalAssetProductCache,
} from "@/lib/digital-asset-product";
import { DIGITAL_ASSET_CATEGORIES } from "@/lib/schemas/v7/company";

/**
 * Phase 4C read-model tests for Market Map and Relationship Intelligence.
 * Neither module touches frozen research/judgment inputs; both read the
 * already-committed v7 product corpus.
 */
describe("Market Map", () => {
  beforeEach(() => __resetDigitalAssetProductCache());

  it("groups exactly the 44 companies once, across the 11 canonical categories plus uncategorized", () => {
    const map = getMarketMap();
    const seen = new Set<string>();
    for (const group of map.categories) {
      for (const c of group.companies) seen.add(c.entityId);
    }
    for (const c of map.uncategorized) seen.add(c.entityId);
    const total = map.categories.reduce((n, g) => n + g.companies.length, 0) + map.uncategorized.length;
    expect(total).toBe(44);
    expect(seen.size).toBe(44);
  });

  it("emits every canonical category, even ones with zero companies", () => {
    const map = getMarketMap();
    expect(map.categories.map((g) => g.category)).toEqual(DIGITAL_ASSET_CATEGORIES);
  });

  it("every company links to a resolvable Company Detail slug", () => {
    const map = getMarketMap();
    for (const group of map.categories) {
      for (const c of group.companies) {
        expect(getCompanyBySlug(c.slug)?.entityId).toBe(c.entityId);
      }
    }
  });

  it("companyCount matches the length of the companies array per category", () => {
    const map = getMarketMap();
    for (const group of map.categories) {
      expect(group.companyCount).toBe(group.companies.length);
    }
  });

});

describe("Relationship Intelligence", () => {
  beforeEach(() => __resetDigitalAssetProductCache());

  it("binds every person to a resolvable company", () => {
    const people = getPeopleDirectory();
    expect(people.length).toBeGreaterThan(0);
    for (const p of people) {
      expect(getCompanyBySlug(p.slug)?.entityId).toBe(p.entityId);
    }
  });

  it("has no duplicate personId across the whole directory", () => {
    const people = getPeopleDirectory();
    const ids = people.map((p) => p.personId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sorts the people directory alphabetically by name", () => {
    const people = getPeopleDirectory();
    const names = people.map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("every repeat connection actually spans more than one distinct company", () => {
    const data = getRelationshipIntelligence();
    for (const rc of data.repeatConnections) {
      expect(new Set(rc.companies.map((c) => c.slug)).size).toBeGreaterThan(1);
    }
  });

  it("totalPeople and companiesWithPeople reconcile against the directory", () => {
    const data = getRelationshipIntelligence();
    expect(data.totalPeople).toBe(data.people.length);
    expect(data.companiesWithPeople).toBe(new Set(data.people.map((p) => p.slug)).size);
  });
});
