import { describe, it, expect } from "vitest";
import { validatePacket } from "@/lib/research-v7/validate";
import { baseCompanyPacket } from "./fixtures";

describe("v7 packet schema", () => {
  it("accepts a well-formed synthetic equity-only company packet (case A)", () => {
    const result = validatePacket(baseCompanyPacket(), "fixture-a");
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    expect(result.packet?.entityType).toBe("company");
    expect(result.packet?.assetType).toBe("equity");
  });

  it("requires schemaVersion 7, with no default", () => {
    const packet = baseCompanyPacket();
    delete (packet as Record<string, unknown>).schemaVersion;
    const result = validatePacket(packet, "fixture-no-version");
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid entityType", () => {
    const result = validatePacket(baseCompanyPacket({ entityType: "startup" }), "fixture-bad-entitytype");
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "schema_invalid")).toBe(true);
  });

  it("rejects an invalid assetType", () => {
    const result = validatePacket(baseCompanyPacket({ assetType: "crypto" }), "fixture-bad-assettype");
    expect(result.ok).toBe(false);
  });

  describe("forbidden scoring fields (case L)", () => {
    for (const field of ["rawAnchor", "criterionScore", "thesisFit", "screeningScore", "rank", "investmentRecommendation", "priorityScore"]) {
      it(`rejects a top-level forbidden field: ${field}`, () => {
        const result = validatePacket(baseCompanyPacket({ [field]: 42 }), `fixture-forbidden-${field}`);
        expect(result.ok).toBe(false);
        expect(result.issues.some((i) => i.code === "forbidden_scoring_field")).toBe(true);
      });

      it(`rejects a nested forbidden field: ${field}`, () => {
        const packet = baseCompanyPacket({
          evidenceClaims: [{ ...(baseCompanyPacket().evidenceClaims as unknown[])[0] as object, [field]: 1 }],
        });
        const result = validatePacket(packet, `fixture-nested-forbidden-${field}`);
        expect(result.ok).toBe(false);
        expect(result.issues.some((i) => i.code === "forbidden_scoring_field")).toBe(true);
      });
    }

    it("does not treat research_priority_note as forbidden", () => {
      const result = validatePacket(baseCompanyPacket({ research_priority_note: "workflow metadata, not a rank" }), "fixture-priority-note");
      // Fails only because it's an unrecognized key under a strict top-level schema, not the forbidden-field firewall.
      expect(result.issues.some((i) => i.code === "forbidden_scoring_field")).toBe(false);
    });
  });

  it("hybrid company/protocol structure validates (case C)", () => {
    const result = validatePacket(
      baseCompanyPacket({
        entityType: "hybrid",
        assetType: "equity_and_token",
        entityStructure: {
          relationships: [{ description: "Runs a public network alongside the operating company.", relatedEntityId: null, relationType: "operates" }],
          protocolNetworkRelationship: "The company operates the network's reference client.",
          unresolvedBoundaryNotes: ["Unclear whether the foundation or the company controls treasury."],
        },
      }),
      "fixture-hybrid",
    );
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("network with null token metrics validates (case E)", () => {
    const result = validatePacket(
      baseCompanyPacket({
        entityType: "network",
        assetType: "network_no_token",
        digitalAssetMetrics: { network: null, tokenMarket: null },
      }),
      "fixture-network-no-token",
    );
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });
});
