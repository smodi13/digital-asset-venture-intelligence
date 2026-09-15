import { describe, it, expect } from "vitest";
import {
  canonicalJson,
  canonicalize,
  hashConfig,
  hashIdSet,
  sha256Hex,
  stableHash,
} from "@/lib/hash/canonical";

describe("canonical serialization", () => {
  it("is insensitive to object key order", () => {
    const a = { alpha: 1, beta: { gamma: 2, delta: 3 } };
    const b = { beta: { delta: 3, gamma: 2 }, alpha: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(stableHash(a)).toBe(stableHash(b));
  });

  it("is sensitive to array order, because array order carries meaning", () => {
    expect(stableHash([1, 2, 3])).not.toBe(stableHash([3, 2, 1]));
  });

  it("changes when any real value changes", () => {
    const base = { weights: { a: 0.5, b: 0.5 } };
    const changed = { weights: { a: 0.5000001, b: 0.5 } };
    expect(stableHash(base)).not.toBe(stableHash(changed));
  });

  it("treats an absent optional field and an undefined field identically", () => {
    expect(stableHash({ a: 1 })).toBe(stableHash({ a: 1, b: undefined }));
  });

  it("distinguishes an undefined field from an explicit null", () => {
    expect(stableHash({ a: 1, b: undefined })).not.toBe(stableHash({ a: 1, b: null }));
  });

  it("normalizes negative zero so 0 and -0 do not diverge", () => {
    expect(stableHash({ v: 0 })).toBe(stableHash({ v: -0 }));
  });

  it("throws on a non-finite number rather than serializing it as null", () => {
    // A NaN weight hashing the same as a null weight is exactly the kind of
    // silent equivalence the hash exists to prevent.
    expect(() => canonicalize({ w: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonicalize({ w: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
  });

  it("throws on values that cannot be meaningfully hashed", () => {
    expect(() => canonicalize({ f: () => 1 })).toThrow(/not hashable/);
    expect(() => canonicalize({ s: Symbol("x") })).toThrow(/not hashable/);
    expect(() => canonicalize({ n: 1n })).toThrow(/bigint/);
  });

  it("serializes dates deterministically", () => {
    const at = new Date("2026-01-01T00:00:00.000Z");
    expect(canonicalJson({ at })).toBe('{"at":"2026-01-01T00:00:00.000Z"}');
  });

  it("is deterministic across repeated calls", () => {
    const value = { b: [3, 1, 2], a: { z: null, y: "s" } };
    const first = stableHash(value);
    for (let i = 0; i < 5; i += 1) expect(stableHash(value)).toBe(first);
  });

  it("prefixes the algorithm so a stored hash is self describing", () => {
    expect(stableHash({ a: 1 })).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("computes a known SHA-256", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("id set hashing", () => {
  it("reflects membership rather than collection order", () => {
    expect(hashIdSet(["c", "a", "b"])).toBe(hashIdSet(["a", "b", "c"]));
  });

  it("collapses duplicates", () => {
    expect(hashIdSet(["a", "a", "b"])).toBe(hashIdSet(["a", "b"]));
  });

  it("changes when a member is added or removed", () => {
    const base = hashIdSet(["a", "b"]);
    expect(hashIdSet(["a", "b", "c"])).not.toBe(base);
    expect(hashIdSet(["a"])).not.toBe(base);
  });

  it("distinguishes an empty set from a single-member set", () => {
    expect(hashIdSet([])).not.toBe(hashIdSet(["a"]));
  });
});

describe("config hashing", () => {
  it("includes the document name, so two empty documents do not collide", () => {
    expect(hashConfig("signals", {})).not.toBe(hashConfig("sources", {}));
  });

  it("is stable for the same name and body", () => {
    expect(hashConfig("thesis", { a: 1, b: 2 })).toBe(hashConfig("thesis", { b: 2, a: 1 }));
  });
});
