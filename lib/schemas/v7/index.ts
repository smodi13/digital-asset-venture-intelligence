/**
 * v7 digital-asset schema namespace (PARALLEL / DORMANT - Phase 2B).
 *
 * SCHEMA_VERSION_V7 = 7. The active canonical SCHEMA_VERSION stays 6.
 * Nothing in the active production path may import this namespace before
 * Phase 3. tests/scoring/digital-asset/firewall.test.ts enforces that.
 */
export * from "./common";
export * from "./company";
export * from "./signal-event";
export * from "./source-record";
export * from "./thesis-configuration";
