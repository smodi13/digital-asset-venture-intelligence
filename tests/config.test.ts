import { describe, it, expect } from "vitest";
import {
  loadConfig,
  loadThesisConfig,
  loadSignalsConfig,
  loadScoringConfig,
  loadSourcesConfig,
  parseConfig,
  validateConfigConsistency,
  ConfigError,
} from "@/lib/config/load";
import {
  signalsConfigSchema,
  scoringConfigSchema,
  sourcesConfigSchema,
} from "@/lib/config/schemas";
import {
  thesisConfigurationSchema,
  thesisDimensionSchema,
  signalTypeSchema,
  ENDURING_FACT_KEYS,
  ENDURING_FACT_HOMES,
} from "@/lib/schemas";

describe("the shipped configuration is valid", () => {
  it("loads, cross-validates, and hashes every document", () => {
    const config = loadConfig();
    expect(config.thesis.id).toBe("growth-equity-default");
    expect(config.signals.signals.length).toBeGreaterThan(0);
    expect(config.sources.sourceClasses.length).toBeGreaterThan(0);
    expect(config.hashes.combined).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("produces the same hashes on a second load", () => {
    expect(loadConfig().hashes.combined).toBe(loadConfig().hashes.combined);
  });

  it("carries firm-agnostic attribution", () => {
    const thesis = loadThesisConfig();
    expect(thesis.attribution).toContain("Independent analyst framework");
    expect(thesis.attribution).toContain("Not the methodology of any investment firm");
  });

  it("weights the seven specified dimensions and sums to one", () => {
    const thesis = loadThesisConfig();
    const dimensions = thesisDimensionSchema.options;
    expect(Object.keys(thesis.dimensionWeights).sort()).toEqual([...dimensions].sort());
    const sum = dimensions.reduce((a, d) => a + (thesis.dimensionWeights[d] ?? 0), 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    expect(thesis.dimensionWeights.capital_efficiency).toBe(0.2);
    expect(thesis.dimensionWeights.growth_momentum).toBe(0.2);
    expect(thesis.dimensionWeights.founder_alignment).toBe(0.15);
    expect(thesis.dimensionWeights.market_quality).toBe(0.15);
    expect(thesis.dimensionWeights.business_model_quality).toBe(0.1);
    expect(thesis.dimensionWeights.gtm_quality).toBe(0.1);
    expect(thesis.dimensionWeights.competitive_position).toBe(0.1);
  });

  it("holds the thesis id as a plain string, not a compile-time union", () => {
    // Prior work made the mandate id a closed union, which made a thesis a
    // code entity rather than a configuration entity. This asserts the fix.
    const parsed = thesisConfigurationSchema.safeParse({
      ...loadThesisConfig(),
      id: "a-completely-different-thesis",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("signal definitions: facts endure, events decay", () => {
  it("every signal is a temporal event and declares a half life", () => {
    // SignalEvent is an event stream. Every entry records something that
    // happened at a point in time and therefore ages.
    const signals = loadSignalsConfig().signals;
    expect(signals.length).toBeGreaterThan(0);
    for (const signal of signals) {
      expect(signal.isTimeSensitive, `${signal.id} must be a temporal event`).toBe(true);
      expect(signal.halfLifeDays, `${signal.id} must declare a half life`).toBeGreaterThan(0);
    }
  });

  it("founder_activity is a time-sensitive event, not a biography", () => {
    // Founder BACKGROUND endures and lives on the Person record. Founder
    // ACTIVITY, meaning what a founder did recently, decays like any event,
    // and it is the second one a momentum score is asking about. An earlier
    // version conflated the two and marked this signal enduring.
    const founder = loadSignalsConfig().signals.find((s) => s.id === "founder_activity");
    expect(founder?.isTimeSensitive).toBe(true);
    expect(founder?.halfLifeDays).toBeGreaterThan(0);
  });

  it("regulatory_milestone is a time-sensitive event, not an approval status", () => {
    // The GRANTING is an event and decays. The resulting approval STATUS
    // endures and lives as an EvidenceClaim.
    const regulatory = loadSignalsConfig().signals.find(
      (s) => s.id === "regulatory_milestone",
    );
    expect(regulatory?.isTimeSensitive).toBe(true);
    expect(regulatory?.halfLifeDays).toBeGreaterThan(0);
  });

  it("no enduring fact is smuggled in as a signal id", () => {
    const ids = new Set(loadSignalsConfig().signals.map((s) => s.id));
    for (const key of ENDURING_FACT_KEYS) {
      expect(ids.has(key as never), `${key} is an enduring fact, not an event`).toBe(false);
    }
  });

  it("the signal type enum contains no enduring fact key", () => {
    for (const key of ENDURING_FACT_KEYS) {
      expect(signalTypeSchema.options as readonly string[]).not.toContain(key);
    }
  });

  it("every enduring fact names a home outside the event stream", () => {
    expect(ENDURING_FACT_HOMES.length).toBeGreaterThan(0);
    const signalIds = new Set(loadSignalsConfig().signals.map((s) => s.id));
    for (const entry of ENDURING_FACT_HOMES) {
      expect(entry.home.length, entry.fact).toBeGreaterThan(0);
      // Each enduring fact has a corresponding event that IS in the stream.
      expect(signalIds.has(entry.correspondingEvent), entry.fact).toBe(true);
    }
  });

  it("rejects a signal marked as not time sensitive", () => {
    // This is how an enduring fact would be smuggled in to avoid decay.
    expect(() =>
      parseConfig(
        "signals.yaml",
        `schemaVersion: 1
version: "1.0.0"
signals:
  - id: product_launch
    name: "Product category"
    category: product
    direction: positive
    baseStrength: 0.5
    isTimeSensitive: false
    halfLifeDays: null
    minimumEvidence: 1
    eligibleSourceTypes: [official_company]
    description: "An enduring fact wearing an event id."`,
        signalsConfigSchema,
      ),
    ).toThrow(/does not belong in the event stream/);
  });
});

describe("scoring configuration", () => {
  it("carries the negative specification", () => {
    const scoring = loadScoringConfig();
    const ids = scoring.excludedFromPositiveScoring.map((e) => e.id);
    for (const required of [
      "follower_count",
      "virality",
      "investor_followers",
      "writing_style_confidence",
      "unsupported_social_popularity",
      "duplicated_article_count",
    ]) {
      expect(ids, `missing exclusion ${required}`).toContain(required);
    }
  });

  it("gives every exclusion a stated rationale", () => {
    for (const entry of loadScoringConfig().excludedFromPositiveScoring) {
      expect(entry.rule.length).toBeGreaterThan(0);
      expect(entry.rationale.length).toBeGreaterThan(0);
    }
  });

  it("sets the unknown confidence multiplier to exactly zero", () => {
    expect(loadScoringConfig().confidence.levelMultipliers.unknown).toBe(0);
  });
});

describe("source configuration", () => {
  it("treats analyst inference as the floor and forbids it corroborating", () => {
    const inference = loadSourcesConfig().sourceClasses.find(
      (s) => s.id === "analyst_inference",
    );
    expect(inference).toBeDefined();
    expect(inference?.canCorroborate).toBe(false);
    expect(inference?.isIndependent).toBe(false);
    const others = loadSourcesConfig().sourceClasses.filter((s) => s.id !== "analyst_inference");
    for (const other of others) {
      expect(other.reliability).toBeGreaterThan(inference?.reliability ?? 1);
    }
  });

  it("forbids first-party sources from corroborating their own claims", () => {
    for (const cls of loadSourcesConfig().sourceClasses) {
      if (!cls.isIndependent) expect(cls.canCorroborate, cls.id).toBe(false);
    }
  });
});

describe("bad configuration fails loudly", () => {
  it("rejects thesis weights that do not sum to one", () => {
    const broken = { ...loadThesisConfig() };
    broken.dimensionWeights = { ...broken.dimensionWeights, capital_efficiency: 0.9 };
    const result = thesisConfigurationSchema.safeParse(broken);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("must sum to exactly 1");
  });

  it("rejects a thesis missing a dimension weight entirely", () => {
    const broken = { ...loadThesisConfig() };
    const weights = { ...broken.dimensionWeights };
    delete (weights as Record<string, unknown>).gtm_quality;
    broken.dimensionWeights = weights;
    expect(thesisConfigurationSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects an unknown signal id in signals.yaml", () => {
    expect(() =>
      parseConfig(
        "signals.yaml",
        `schemaVersion: 1
version: "1.0.0"
signals:
  - id: not_a_real_signal
    name: "Invented"
    category: demand
    direction: positive
    baseStrength: 0.5
    isTimeSensitive: true
    halfLifeDays: 100
    minimumEvidence: 1
    eligibleSourceTypes: [regulatory]
    description: "Should be rejected."`,
        signalsConfigSchema,
      ),
    ).toThrow(ConfigError);
  });

  it("rejects a time-sensitive signal with no half life", () => {
    expect(() =>
      parseConfig(
        "signals.yaml",
        `schemaVersion: 1
version: "1.0.0"
signals:
  - id: product_launch
    name: "Product launch"
    category: product
    direction: positive
    baseStrength: 0.5
    isTimeSensitive: true
    halfLifeDays: null
    minimumEvidence: 1
    eligibleSourceTypes: [official_company]
    description: "Missing a half life."`,
        signalsConfigSchema,
      ),
    ).toThrow(/half life/);
  });

  it("rejects a signal that is neither a valid event nor a valid enduring definition", () => {
    // Marked enduring AND given a half life: internally contradictory, and
    // rejected on both counts rather than one being silently preferred.
    expect(() =>
      parseConfig(
        "signals.yaml",
        `schemaVersion: 1
version: "1.0.0"
signals:
  - id: founder_activity
    name: "Founder background"
    category: team
    direction: positive
    baseStrength: 0.5
    isTimeSensitive: false
    halfLifeDays: 365
    minimumEvidence: 1
    eligibleSourceTypes: [official_company]
    description: "Contradictory definition."`,
        signalsConfigSchema,
      ),
    ).toThrow(/never decayed|event stream/);
  });

  it("rejects malformed YAML rather than loading a partial document", () => {
    expect(() => parseConfig("signals.yaml", "signals: [unclosed", signalsConfigSchema)).toThrow(
      ConfigError,
    );
  });

  it("rejects priority weights that do not sum to one", () => {
    const broken = { ...loadScoringConfig() };
    broken.priority = {
      ...broken.priority,
      weights: { thesisFit: 0.9, momentum: 0.25, convergence: 0.2, trust: 0.1 },
    };
    const result = scoringConfigSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });

  it("rejects a non-zero unknown confidence multiplier", () => {
    const broken = { ...loadScoringConfig() };
    broken.confidence = {
      levelMultipliers: { ...broken.confidence.levelMultipliers, unknown: 0.5 },
    };
    const result = scoringConfigSchema.safeParse(broken);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("cannot raise a score");
  });

  it("rejects a sources document missing a defined source class", () => {
    const broken = { ...loadSourcesConfig() };
    broken.sourceClasses = broken.sourceClasses.filter((s) => s.id !== "regulatory");
    expect(sourcesConfigSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects analyst inference being allowed to corroborate", () => {
    const broken = { ...loadSourcesConfig() };
    broken.sourceClasses = broken.sourceClasses.map((s) =>
      s.id === "analyst_inference" ? { ...s, isIndependent: true, canCorroborate: true } : s,
    );
    const result = sourcesConfigSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });
});

describe("cross-document consistency", () => {
  it("detects the two weight tables drifting apart", () => {
    const thesis = loadThesisConfig();
    const scoring = loadScoringConfig();
    const drifted = {
      ...scoring,
      thesisDimensionWeights: { ...scoring.thesisDimensionWeights, gtm_quality: 0.11 },
    };
    expect(() =>
      validateConfigConsistency({
        thesis,
        signals: loadSignalsConfig(),
        scoring: drifted,
        sources: loadSourcesConfig(),
      }),
    ).toThrow(/thesis.yaml but/);
  });

  it("detects a thesis referencing a signal that is not defined", () => {
    const thesis = loadThesisConfig();
    const signals = loadSignalsConfig();
    const trimmed = {
      ...signals,
      signals: signals.signals.filter((s) => s.id !== "customer_momentum"),
    };
    expect(() =>
      validateConfigConsistency({
        thesis,
        signals: trimmed,
        scoring: loadScoringConfig(),
        sources: loadSourcesConfig(),
      }),
    ).toThrow(/not defined in signals.yaml/);
  });
});
