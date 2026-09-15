import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  datumSchema,
  datumValue,
  datumRange,
  isEstablished,
  isModelInput,
  requireDatumValue,
  sourced,
  derived,
  assumption,
  estimatedRange,
  unknown,
  canSupportPositiveScore,
  provenanceKindSchema,
} from "@/lib/provenance";

const numberDatum = datumSchema(z.number());

describe("unknown is null and stays null", () => {
  it("an unknown datum carries a null value", () => {
    const d = unknown<number>("no public disclosure");
    expect(d.value).toBeNull();
    expect(d.provenance).toBe("unknown");
  });

  it("datumValue returns null rather than zero", () => {
    expect(datumValue(unknown<number>())).toBeNull();
    expect(datumValue(unknown<number>())).not.toBe(0);
  });

  it("isEstablished is false for unknown", () => {
    expect(isEstablished(unknown<number>())).toBe(false);
  });

  it("the schema rejects a non-null value on an unknown datum", () => {
    const result = numberDatum.safeParse({
      provenance: "unknown",
      value: 0,
      confidence: "unknown",
    });
    expect(result.success).toBe(false);
  });

  it("the schema rejects sentinel strings in place of null", () => {
    for (const sentinel of ["", "N/A", "Not disclosed", "unknown"]) {
      const result = numberDatum.safeParse({
        provenance: "unknown",
        value: sentinel,
        confidence: "unknown",
      });
      expect(result.success, `sentinel ${JSON.stringify(sentinel)} was accepted`).toBe(false);
    }
  });

  it("requireDatumValue throws rather than substituting a number", () => {
    expect(() => requireDatumValue(unknown<number>(), "arr")).toThrow(/not established/);
  });
});

describe("estimated range never becomes a fact", () => {
  const range = estimatedRange<number>(
    { low: 10, high: 20, midpoint: 15, basis: "bracketed from two disclosed comparables" },
    { confidence: "medium" },
  );

  it("the value position is null even when a midpoint exists", () => {
    expect(range.value).toBeNull();
  });

  it("datumValue does not return the midpoint", () => {
    expect(datumValue(range)).toBeNull();
    expect(datumValue(range)).not.toBe(15);
  });

  it("isEstablished is false, so a range cannot be used as a point value", () => {
    expect(isEstablished(range)).toBe(false);
  });

  it("the bounds are reachable only by asking for them explicitly", () => {
    expect(datumRange(range)).toEqual({ low: 10, high: 20, midpoint: 15 });
  });

  it("datumRange returns null for every other kind", () => {
    expect(datumRange(unknown<number>())).toBeNull();
    expect(
      datumRange(sourced(5, { confidence: "high", sourceSubtype: "reported_fact", evidenceIds: ["e1"] })),
    ).toBeNull();
  });

  it("the schema rejects a range with a non-null value position", () => {
    const result = numberDatum.safeParse({
      provenance: "estimated_range",
      value: 15,
      low: 10,
      high: 20,
      basis: "midpoint smuggled into the value position",
      confidence: "medium",
    });
    expect(result.success).toBe(false);
  });

  it("the schema rejects a range with no stated basis", () => {
    const result = numberDatum.safeParse({
      provenance: "estimated_range",
      value: null,
      low: 10,
      high: 20,
      confidence: "medium",
    });
    expect(result.success).toBe(false);
  });
});

describe("mandatory bases", () => {
  it("an assumption requires a stated basis", () => {
    const result = numberDatum.safeParse({
      provenance: "assumption",
      value: 42,
      confidence: "medium",
    });
    expect(result.success).toBe(false);
  });

  it("an assumption defaults to requiring sensitivity testing", () => {
    const a = assumption(42, { confidence: "medium", assumptionBasis: "peer median" });
    expect(a.provenance).toBe("assumption");
    if (a.provenance === "assumption") {
      expect(a.sensitivityRequired).toBe(true);
    }
  });

  it("a derived value requires at least one input id", () => {
    const result = numberDatum.safeParse({
      provenance: "derived",
      value: 3,
      inputIds: [],
      derivationBasis: "arr divided by headcount",
      confidence: "high",
    });
    expect(result.success).toBe(false);
  });

  it("a derived value records its inputs and its calculation", () => {
    const d = derived(3, {
      confidence: "high",
      inputIds: ["clm-1", "clm-2"],
      derivationBasis: "arr divided by headcount",
    });
    expect(isEstablished(d)).toBe(true);
    if (d.provenance === "derived") {
      expect(d.inputIds).toEqual(["clm-1", "clm-2"]);
    }
  });

  it("a sourced value requires a source subtype", () => {
    const result = numberDatum.safeParse({
      provenance: "sourced",
      value: 7,
      confidence: "high",
    });
    expect(result.success).toBe(false);
  });
});

describe("model eligibility", () => {
  it("defaults to context only, so nothing drives a model by accident", () => {
    const parsed = numberDatum.parse({
      provenance: "sourced",
      value: 7,
      sourceSubtype: "reported_fact",
      confidence: "high",
    });
    expect(parsed.modelEligibility).toBe("context_only");
    expect(isModelInput(parsed)).toBe(false);
  });

  it("an unknown value is never a model input even if marked as one", () => {
    const d = { ...unknown<number>(), modelEligibility: "model_input" as const };
    expect(isModelInput(d)).toBe(false);
  });
});

describe("positive scoring eligibility", () => {
  it("unknown and estimated_range cannot support a positive score", () => {
    expect(canSupportPositiveScore("unknown")).toBe(false);
    expect(canSupportPositiveScore("estimated_range")).toBe(false);
  });

  it("sourced, derived, and assumption can", () => {
    expect(canSupportPositiveScore("sourced")).toBe(true);
    expect(canSupportPositiveScore("derived")).toBe(true);
    expect(canSupportPositiveScore("assumption")).toBe(true);
  });

  it("covers every kind in the vocabulary, so a new kind cannot be forgotten", () => {
    for (const kind of provenanceKindSchema.options) {
      expect(typeof canSupportPositiveScore(kind)).toBe("boolean");
    }
  });
});

describe("there is exactly one provenance vocabulary", () => {
  it("the five top-level kinds are the specified set", () => {
    expect([...provenanceKindSchema.options].sort()).toEqual(
      ["assumption", "derived", "estimated_range", "sourced", "unknown"].sort(),
    );
  });
});
