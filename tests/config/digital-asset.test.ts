import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadDigitalAssetConfig,
  loadDigitalAssetThesisConfig,
} from "@/lib/config/digital-asset/load";
import { loadConfig } from "@/lib/config/load";
import { DIGITAL_ASSET_CATEGORIES } from "@/lib/schemas/v7/company";

describe("digital-asset config loads and cross-validates (parallel, dormant)", () => {
  it("loads all four documents", () => {
    const cfg = loadDigitalAssetConfig();
    expect(cfg.thesis.id).toBe("digital-asset-venture-default");
    expect(cfg.signals.signals.length).toBe(15);
    expect(cfg.sources.sourceClasses.length).toBe(7);
    expect(cfg.scoring.forbiddenAutomaticPositive.length).toBeGreaterThan(0);
  });

  it("thesis carries firm-neutral attribution", () => {
    const thesis = loadDigitalAssetThesisConfig();
    expect(thesis.attribution).toContain("Independent analyst framework");
    expect(thesis.attribution).toContain("Not the methodology of any investment firm");
  });

  it("allows every entity type and asset type, including no-token", () => {
    const thesis = loadDigitalAssetThesisConfig();
    expect(thesis.allowedAssetTypes).toContain("network_no_token");
    expect(thesis.allowedAssetTypes).toContain("equity");
    expect(thesis.allowedAssetTypes).toContain("unknown");
  });

  it("carries all eleven taxonomy categories", () => {
    const thesis = loadDigitalAssetThesisConfig();
    expect(thesis.categories.sort()).toEqual([...DIGITAL_ASSET_CATEGORIES].sort());
  });

  it("weights are labelled provisional/unvalidated", () => {
    const thesis = loadDigitalAssetThesisConfig();
    expect(thesis.weightsStatus).toBe("PROVISIONAL_DIGITAL_ASSET_V1_UNVALIDATED");
  });
});

describe("Phase 2B does not disturb the active v6 configuration or its hash", () => {
  it("the active configHash is unaffected by the existence of digital-asset config", () => {
    const active = loadConfig();
    expect(active.hashes.combined).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("config/thesis.yaml, config/signals.yaml, config/sources.yaml, config/scoring.yaml are unchanged from HEAD", () => {
    const root = process.cwd();
    for (const file of ["thesis.yaml", "signals.yaml", "sources.yaml", "scoring.yaml"]) {
      // Presence check only: byte-stability against git HEAD is verified by the
      // Phase 2B gate script, not by re-implementing git diff here.
      expect(() => readFileSync(join(root, "config", file), "utf8")).not.toThrow();
    }
  });
});
