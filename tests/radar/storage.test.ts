import { describe, it, expect } from "vitest";
import { addRadarId, parseRadarIds, removeRadarId, serializeRadarIds } from "@/lib/radar/storage";

/**
 * Follow-On Radar local persistence: pure functions over a plain string
 * array, tested without a DOM. The load-bearing invariant is that a missing
 * or malformed value is always an empty radar - never a fabricated default
 * portfolio.
 */
describe("radar storage", () => {
  it("treats a missing value as an empty radar, not fabricated holdings", () => {
    expect(parseRadarIds(null)).toEqual([]);
  });

  it("treats malformed JSON as an empty radar", () => {
    expect(parseRadarIds("not json")).toEqual([]);
  });

  it("treats a non-array JSON value as an empty radar", () => {
    expect(parseRadarIds('{"a":1}')).toEqual([]);
  });

  it("drops non-string entries", () => {
    expect(parseRadarIds('["a", 1, null, "b"]')).toEqual(["a", "b"]);
  });

  it("round-trips a valid id list", () => {
    const ids = ["co-a", "co-b"];
    expect(parseRadarIds(serializeRadarIds(ids))).toEqual(ids);
  });

  it("add is idempotent", () => {
    const once = addRadarId([], "co-a");
    const twice = addRadarId(once, "co-a");
    expect(twice).toEqual(["co-a"]);
  });

  it("remove drops only the matching id", () => {
    expect(removeRadarId(["co-a", "co-b"], "co-a")).toEqual(["co-b"]);
  });

  it("remove on an absent id is a no-op", () => {
    expect(removeRadarId(["co-a"], "co-z")).toEqual(["co-a"]);
  });
});
