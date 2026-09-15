import { z } from "zod";
import {
  SCHEMA_VERSION_V7,
  schemaVersionV7Schema,
  idSchema,
  isoDateSchema,
  pointInTimeMetricSchema,
  periodMetricSchema,
} from "./common";

/**
 * v7 Company: the digital-asset-native investable entity (PARALLEL / DORMANT).
 *
 * entityType and assetType are the two identity axes. Neither contributes any
 * points to any score: like the v6 businessModelArchetype, they orient which
 * criteria apply and which evidence is relevant, nothing more.
 *
 *   - No token is never automatically negative.
 *   - Having a token is never automatically positive.
 */

export const entityTypeSchema = z.enum(["company", "protocol", "network", "hybrid"]);
export type EntityType = z.infer<typeof entityTypeSchema>;

/**
 * assetType: what the investable instrument actually is.
 *
 * network_no_token means a protocol/network for which no token instrument
 * exists and no token exposure is being evaluated. If the investable instrument
 * is equity in an operating company, assetType is `equity` even if that company
 * runs a tokenless network. network_no_token is NOT a synonym for "equity
 * company that happens to run a network".
 */
export const assetTypeSchema = z.enum([
  "equity",
  "token",
  "equity_and_token",
  "network_no_token",
  "unknown",
]);
export type AssetType = z.infer<typeof assetTypeSchema>;

/** The eleven digital-asset categories. Governance tooling and identity are classified by primary function, not given their own category. */
export const digitalAssetCategorySchema = z.enum([
  "core_protocols_and_scaling",
  "developer_infrastructure_and_middleware",
  "data_oracles_and_indexing",
  "security_privacy_and_cryptography",
  "stablecoins_and_payments",
  "defi_and_capital_markets",
  "tokenization_and_real_world_assets",
  "depin_and_decentralized_compute",
  "crypto_ai_and_agentic_infrastructure",
  "consumer_social_and_gaming",
  "custody_compliance_and_institutional_infrastructure",
]);
export type DigitalAssetCategory = z.infer<typeof digitalAssetCategorySchema>;

export const DIGITAL_ASSET_CATEGORIES = digitalAssetCategorySchema.options;

/**
 * Network lifecycle, separate from financing stage.
 *
 * A pre-launch protocol may have raised a Series A; a mainnet-established
 * network may be bootstrapped. Financing stage and network maturity are
 * different questions and are never conflated onto one enum.
 */
export const digitalAssetLifecycleSchema = z.enum([
  "pre_launch",
  "testnet",
  "mainnet_early",
  "mainnet_established",
]);
export type DigitalAssetLifecycle = z.infer<typeof digitalAssetLifecycleSchema>;

/* -------------------------------------------------------------------------- */
/* Digital-asset metrics: contextual / display records only.                  */
/*                                                                            */
/* CRITICAL INVARIANT: none of these raw fields may directly modify a Thesis  */
/* Fit or Underwriting score. There is no "TVL up -> score up" anywhere. An   */
/* analyst may cite a properly sourced metric as evidence for an              */
/* EvidenceClaim; human judgment then sets rawAnchor and coverage.            */
/* -------------------------------------------------------------------------- */

const usd = z.number().finite().nonnegative();
const count = z.number().int().nonnegative();

export const networkMetricsSchema = z.object({
  tvlUsd: pointInTimeMetricSchema(usd).nullable().default(null),
  protocolFeesUsd: periodMetricSchema(usd).nullable().default(null),
  protocolRevenueUsd: periodMetricSchema(usd).nullable().default(null),
  activeAddresses: periodMetricSchema(count).nullable().default(null),
  transactionCount: periodMetricSchema(count).nullable().default(null),
  transactionVolumeUsd: periodMetricSchema(usd).nullable().default(null),
  operatorCount: pointInTimeMetricSchema(count).nullable().default(null),
  contributorCount: periodMetricSchema(count).nullable().default(null),
  treasuryAssetsUsd: pointInTimeMetricSchema(usd).nullable().default(null),
  incentiveSpendUsd: periodMetricSchema(usd).nullable().default(null),
});
export type NetworkMetrics = z.infer<typeof networkMetricsSchema>;

/** Token supply: each figure carries its own provenance and date. */
export const tokenSupplySchema = z.object({
  circulating: pointInTimeMetricSchema(count).nullable().default(null),
  total: pointInTimeMetricSchema(count).nullable().default(null),
  max: pointInTimeMetricSchema(count).nullable().default(null),
  emissionScheduleNote: z.string().min(1).nullable().default(null),
});
export type TokenSupply = z.infer<typeof tokenSupplySchema>;

export const tokenMarketMetricsSchema = z.object({
  circulatingMarketCapUsd: pointInTimeMetricSchema(usd).nullable().default(null),
  fdvUsd: pointInTimeMetricSchema(usd).nullable().default(null),
  tokenSupply: tokenSupplySchema.nullable().default(null),
});
export type TokenMarketMetrics = z.infer<typeof tokenMarketMetricsSchema>;

/** Network operating metrics and token-market valuation context, kept distinct. */
export const digitalAssetMetricsSchema = z.object({
  network: networkMetricsSchema.nullable().default(null),
  tokenMarket: tokenMarketMetricsSchema.nullable().default(null),
});
export type DigitalAssetMetrics = z.infer<typeof digitalAssetMetricsSchema>;

/* -------------------------------------------------------------------------- */

export const companyV7Schema = z.object({
  id: idSchema,
  // Identity fields: required, no default. A malformed v7 record must fail
  // rather than be quietly normalized into a "company".
  schemaVersion: schemaVersionV7Schema,
  entityType: entityTypeSchema,
  assetType: assetTypeSchema,

  name: z.string().min(1),
  description: z.string().min(1),
  domain: z.string().min(1).nullable(),

  /** null when not yet established. Never a scoring input. */
  digitalAssetCategory: digitalAssetCategorySchema.nullable().default(null),
  /**
   * boolean | null. NEVER `default(false)`: false is itself a claim, and an
   * unresolved orientation must stay representable. Orthogonal, contributes no
   * points.
   */
  institutionalOrientation: z.boolean().nullable().default(null),
  /** Network maturity, separate from financing stage. null when unknown. */
  digitalAssetLifecycle: digitalAssetLifecycleSchema.nullable().default(null),

  /** Contextual / display metric records. Never a direct scoring input. */
  digitalAssetMetrics: digitalAssetMetricsSchema.nullable().default(null),

  firstObservedAt: isoDateSchema,
  sourceIds: z.array(idSchema).default([]),
});

export type CompanyV7 = z.infer<typeof companyV7Schema>;
export { SCHEMA_VERSION_V7 };
