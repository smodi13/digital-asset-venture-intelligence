import { describe, it, expect } from "vitest";
import { DIGITAL_ASSET_SOURCE_PROFILES } from "@/lib/schemas/v7/source-record";

/**
 * Phase 2B section 22: source count is never confidence. Independence and
 * corroboration are decided by class + true origin + reproduction flag.
 *
 * These are structural/documentation-level assertions over the digital-asset
 * source-class profiles; the actual origin-collapse arithmetic is exercised by
 * the existing lib/scoring/confidence.ts aggregateConfidence, unchanged here
 * (one originKey per true origin collapses N records to one voice).
 */

describe("digital-asset source independence and corroboration rules", () => {
  it("official_protocol_source and official_network_source cannot corroborate themselves", () => {
    expect(DIGITAL_ASSET_SOURCE_PROFILES.official_protocol_source.canCorroborate).toBe(false);
    expect(DIGITAL_ASSET_SOURCE_PROFILES.official_network_source.canCorroborate).toBe(false);
  });

  it("a press article repeating an official protocol announcement never becomes independent: the class stays non-independent regardless of who repeats it", () => {
    expect(DIGITAL_ASSET_SOURCE_PROFILES.official_protocol_source.isIndependent).toBe(false);
  });

  it("block_explorer requires origin dedup: two explorers on one transaction are one origin, not two", () => {
    expect(DIGITAL_ASSET_SOURCE_PROFILES.block_explorer.isIndependent).toBe(true);
    expect(DIGITAL_ASSET_SOURCE_PROFILES.block_explorer.canCorroborate).toBe(true);
    expect(DIGITAL_ASSET_SOURCE_PROFILES.block_explorer.originDedupRequired).toBe(true);
  });

  it("onchain_analytics requires origin dedup: N dashboards on one upstream methodology are one voice", () => {
    expect(DIGITAL_ASSET_SOURCE_PROFILES.onchain_analytics.isIndependent).toBe(true);
    expect(DIGITAL_ASSET_SOURCE_PROFILES.onchain_analytics.originDedupRequired).toBe(true);
  });

  it("genuinely independent onchain_analytics methodologies may still corroborate within scope", () => {
    expect(DIGITAL_ASSET_SOURCE_PROFILES.onchain_analytics.canCorroborate).toBe(true);
  });

  it("code_repository activity never corroborates customers or revenue: it cannot corroborate at all", () => {
    expect(DIGITAL_ASSET_SOURCE_PROFILES.code_repository.canCorroborate).toBe(false);
    expect(DIGITAL_ASSET_SOURCE_PROFILES.code_repository.isIndependent).toBe(false);
  });

  it("security_audit findings support only the audited scope, per its documented note", () => {
    expect(DIGITAL_ASSET_SOURCE_PROFILES.security_audit.isIndependent).toBe(true);
    expect(DIGITAL_ASSET_SOURCE_PROFILES.security_audit.note).toMatch(/audit scope|never means|safe/i);
  });

  it("governance_forum discussion is not automatically an executed governance outcome", () => {
    expect(DIGITAL_ASSET_SOURCE_PROFILES.governance_forum.canCorroborate).toBe(false);
    expect(DIGITAL_ASSET_SOURCE_PROFILES.governance_forum.note).toMatch(/executed governance record/i);
  });

  it("every class not independent cannot corroborate (isIndependent=false => canCorroborate=false)", () => {
    for (const profile of Object.values(DIGITAL_ASSET_SOURCE_PROFILES)) {
      if (!profile.isIndependent) expect(profile.canCorroborate).toBe(false);
    }
  });
});
