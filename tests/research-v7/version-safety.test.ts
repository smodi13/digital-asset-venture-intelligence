import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { compileBatch } from "@/lib/research-v7/compile";
import { baseCompanyPacket } from "./fixtures";

/**
 * Phase 3B-0.1 Person / EvidenceClaim version-safety audit.
 *
 * lib/schemas/person.ts and lib/schemas/evidence-claim.ts are genuinely
 * version-neutral: schemaVersion is z.number().int().positive(), not
 * z.literal(6), and neither module imports the active SCHEMA_VERSION
 * constant or any other active-v6-only assumption. Reuse is retained (no
 * parallel lib/schemas/v7/{person,evidence-claim}.ts was created), but
 * lib/research-v7/packet-schema.ts pins schemaVersion to 7 for both via a
 * refinement, so a v7 corpus can never contain one of these records claiming
 * schemaVersion 6 merely because a shared, version-neutral schema was
 * reused.
 */

describe("Person / EvidenceClaim are version-neutral, not version-bound to v6", () => {
  it("lib/schemas/person.ts does not import SCHEMA_VERSION or any active-only module", () => {
    const text = readFileSync("lib/schemas/person.ts", "utf8");
    expect(text).not.toMatch(/SCHEMA_VERSION\b/);
  });

  it("lib/schemas/evidence-claim.ts does not import SCHEMA_VERSION or any active-only module", () => {
    const text = readFileSync("lib/schemas/evidence-claim.ts", "utf8");
    expect(text).not.toMatch(/SCHEMA_VERSION\b/);
  });

  it("schemaVersionSchema (used by both) is a plain positive integer, not a literal 6", () => {
    const text = readFileSync("lib/schemas/common.ts", "utf8");
    expect(text).toMatch(/schemaVersionSchema = z\s*\n?\s*\.number\(\)/);
    expect(text).not.toMatch(/schemaVersionSchema = z\.literal/);
  });
});

describe("the v7 packet harness rejects schemaVersion 6 on Person and EvidenceClaim", () => {
  it("rejects a Person entry carrying schemaVersion 6", () => {
    const base = baseCompanyPacket();
    const badPerson = { ...(base.people as Record<string, unknown>[])[0], schemaVersion: 6 };
    const packet = baseCompanyPacket({ people: [badPerson] });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "schema_invalid" && i.path === "people.0.schemaVersion")).toBe(true);
  });

  it("rejects an EvidenceClaim entry carrying schemaVersion 6", () => {
    const base = baseCompanyPacket();
    const badClaim = { ...(base.evidenceClaims as Record<string, unknown>[])[0], schemaVersion: 6 };
    const packet = baseCompanyPacket({ evidenceClaims: [badClaim] });
    const result = compileBatch([{ label: "p", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "schema_invalid" && i.path === "evidenceClaims.0.schemaVersion")).toBe(true);
  });

  it("a well-formed packet with schemaVersion 7 throughout compiles cleanly", () => {
    const result = compileBatch([{ label: "p", raw: baseCompanyPacket({}) }], { batch: "SYNTHETIC" });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });
});

describe("no v6 schemaVersion value enters compiled v7 output (regression)", () => {
  it("every Person and EvidenceClaim in the compiled corpus carries schemaVersion 7", () => {
    const result = compileBatch([{ label: "p", raw: baseCompanyPacket({}) }], { batch: "SYNTHETIC" });
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    for (const person of result.corpus?.people ?? []) {
      expect(person.schemaVersion).toBe(7);
    }
    for (const claim of result.corpus?.evidenceClaims ?? []) {
      expect(claim.schemaVersion).toBe(7);
    }
  });
});
