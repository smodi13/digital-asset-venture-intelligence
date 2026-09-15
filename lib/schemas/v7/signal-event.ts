import { z } from "zod";
import { schemaVersionV7Schema, idSchema, isoDateSchema } from "./common";
import { eventStatusSchema, interpretationBasisSchema } from "@/lib/schemas/signal-event";

/**
 * v7 SignalEvent (PARALLEL / DORMANT).
 *
 * A newly-created v7 event REQUIRES subjectType. The concept a signal is about
 * is always concrete: a company, a protocol, or a network. `hybrid` and `token`
 * are never subjects. A hybrid entity's event resolves to whichever concrete
 * subject the event concerns. The dormant v6->v7 adapter fills
 * subjectType = "company" for a legacy v6 event.
 *
 * FACTS ENDURE, EVENTS DECAY: the event RECORD never disappears when a
 * half-life expires. Half-life governs only a future recency-weighted
 * analytical contribution. An exploit, a regulatory action, a governance
 * event, a token launch, or a mainnet milestone stays permanently visible in
 * provenance and history.
 */

export const subjectTypeSchema = z.enum(["company", "protocol", "network"]);
export type SubjectType = z.infer<typeof subjectTypeSchema>;

/** v6 categories that transfer unchanged, plus two digital-asset additions. */
export const signalCategoryV7Schema = z.enum([
  "demand",
  "supply",
  "team",
  "capital",
  "product",
  "market",
  "risk",
  "network",
  "ecosystem",
]);
export type SignalCategoryV7 = z.infer<typeof signalCategoryV7Schema>;

export const signalDirectionSchema = z.enum(["positive", "negative", "neutral", "ambiguous"]);
export type SignalDirection = z.infer<typeof signalDirectionSchema>;

/** The 15 digital-asset signal types. v6 types remain valid via the migration adapter. */
export const V6_SIGNAL_TYPES = [
  "customer_momentum",
  "enterprise_expansion",
  "executive_hire",
  "product_launch",
  "pricing_change",
  "geographic_expansion",
  "partnership",
  "funding",
  "technical_adoption",
  "hiring_acceleration",
  "founder_activity",
  "leadership_departure",
  "regulatory_milestone",
  "site_change",
  "media_coverage",
  "security_incident",
] as const;

export const DIGITAL_ASSET_SIGNAL_TYPES = [
  "protocol_launch",
  "network_milestone",
  "developer_activity",
  "contributor_growth",
  "integration_growth",
  "onchain_activity_trend",
  "fee_revenue_trend",
  "liquidity_tvl_change",
  "ecosystem_funding",
  "governance_change",
  "major_integration_partnership",
  "exploit",
  "regulatory_action",
  "token_launch",
  "token_economic_design_change",
] as const;

export const signalTypeV7Schema = z.enum([...V6_SIGNAL_TYPES, ...DIGITAL_ASSET_SIGNAL_TYPES]);
export type SignalTypeV7 = z.infer<typeof signalTypeV7Schema>;

export interface SignalTypeSpec {
  category: SignalCategoryV7;
  subjectTypes: readonly SubjectType[];
  directions: readonly SignalDirection[];
  /** PROVISIONAL V1 half-life hypothesis in days. NOT calibrated. */
  halfLifeDays: number;
}

/**
 * PROVISIONAL DIGITAL-ASSET V1 signal specifications.
 *
 * Half-lives are hypotheses, not calibration results. Subject compatibility is
 * enforced by the schema refinement below.
 */
export const DIGITAL_ASSET_SIGNAL_SPECS: Record<
  (typeof DIGITAL_ASSET_SIGNAL_TYPES)[number],
  SignalTypeSpec
> = {
  protocol_launch: { category: "network", subjectTypes: ["protocol"], directions: ["positive", "neutral"], halfLifeDays: 365 },
  network_milestone: { category: "network", subjectTypes: ["network"], directions: ["positive", "neutral"], halfLifeDays: 365 },
  developer_activity: { category: "ecosystem", subjectTypes: ["company", "protocol", "network"], directions: ["positive", "negative", "neutral"], halfLifeDays: 120 },
  contributor_growth: { category: "ecosystem", subjectTypes: ["company", "protocol", "network"], directions: ["positive", "negative", "neutral"], halfLifeDays: 180 },
  integration_growth: { category: "ecosystem", subjectTypes: ["company", "protocol", "network"], directions: ["positive", "neutral"], halfLifeDays: 270 },
  onchain_activity_trend: { category: "network", subjectTypes: ["protocol", "network"], directions: ["positive", "negative", "ambiguous"], halfLifeDays: 180 },
  fee_revenue_trend: { category: "network", subjectTypes: ["company", "protocol", "network"], directions: ["positive", "negative", "ambiguous"], halfLifeDays: 270 },
  liquidity_tvl_change: { category: "network", subjectTypes: ["protocol", "network"], directions: ["positive", "negative", "ambiguous"], halfLifeDays: 120 },
  ecosystem_funding: { category: "capital", subjectTypes: ["company", "protocol", "network"], directions: ["neutral", "ambiguous"], halfLifeDays: 540 },
  governance_change: { category: "market", subjectTypes: ["protocol", "network"], directions: ["positive", "negative", "neutral", "ambiguous"], halfLifeDays: 365 },
  major_integration_partnership: { category: "ecosystem", subjectTypes: ["company", "protocol", "network"], directions: ["positive", "neutral"], halfLifeDays: 365 },
  exploit: { category: "risk", subjectTypes: ["protocol", "network"], directions: ["negative"], halfLifeDays: 540 },
  regulatory_action: { category: "risk", subjectTypes: ["company", "protocol", "network"], directions: ["negative", "ambiguous"], halfLifeDays: 730 },
  token_launch: { category: "capital", subjectTypes: ["company", "protocol", "network"], directions: ["neutral", "ambiguous", "negative"], halfLifeDays: 365 },
  token_economic_design_change: { category: "capital", subjectTypes: ["company", "protocol", "network"], directions: ["positive", "negative", "neutral", "ambiguous"], halfLifeDays: 540 },
};

function isDigitalAssetType(t: SignalTypeV7): t is (typeof DIGITAL_ASSET_SIGNAL_TYPES)[number] {
  return t in DIGITAL_ASSET_SIGNAL_SPECS;
}

/** Subject types a signal type may carry. v6 types accept any concrete subject. */
export function allowedSubjectTypes(t: SignalTypeV7): readonly SubjectType[] {
  return isDigitalAssetType(t) ? DIGITAL_ASSET_SIGNAL_SPECS[t].subjectTypes : subjectTypeSchema.options;
}

export const signalEventV7BaseSchema = z.object({
  id: idSchema,
  schemaVersion: schemaVersionV7Schema,

  /** REQUIRED for a newly-created v7 event. No default. */
  subjectType: subjectTypeSchema,
  /** Resolved subject id, or null when entity resolution did not settle it. */
  subjectId: idSchema.nullable(),
  subjectNameRaw: z.string().min(1),

  signalType: signalTypeV7Schema,
  signalCategory: signalCategoryV7Schema,
  signalDirection: signalDirectionSchema,

  sourceId: idSchema,
  rawStrength: z.number().min(0).max(1),
  evidenceSummary: z.string().min(1),
  evidenceIds: z.array(idSchema).default([]),

  publicationDate: isoDateSchema.nullable(),
  availabilityDate: isoDateSchema.nullable(),
  eventDate: isoDateSchema.nullable().default(null),

  /** Whether the event occurred, or was only reported as possible. Reuses the v6 vocabulary. */
  eventStatus: eventStatusSchema.default("completed"),
  /** Mandatory when eventStatus is reported_unconfirmed: what specifically is not settled. */
  unconfirmedNote: z.string().min(1).nullable().default(null),
  /** The analyst reading of what this event means, or null where there is none. */
  analystInterpretation: z.string().min(1).nullable().default(null),
  /** How analystInterpretation is supported. Reuses the v6 vocabulary. */
  interpretationBasis: interpretationBasisSchema.default("unknown"),
});

export const signalEventV7Schema = signalEventV7BaseSchema
  .refine((e) => allowedSubjectTypes(e.signalType).includes(e.subjectType), {
    message: "subjectType is not compatible with this signalType.",
    path: ["subjectType"],
  })
  .refine(
    (e) => !isDigitalAssetType(e.signalType) || DIGITAL_ASSET_SIGNAL_SPECS[e.signalType].category === e.signalCategory,
    { message: "signalCategory does not match the digital-asset signal type.", path: ["signalCategory"] },
  )
  .refine(
    (e) => !isDigitalAssetType(e.signalType) || DIGITAL_ASSET_SIGNAL_SPECS[e.signalType].directions.includes(e.signalDirection),
    { message: "signalDirection is not allowed for this digital-asset signal type.", path: ["signalDirection"] },
  )
  .refine((e) => e.eventStatus !== "reported_unconfirmed" || e.unconfirmedNote !== null, {
    message:
      "A reported_unconfirmed event must state what is not confirmed. An unexplained unconfirmed event is indistinguishable from a completed one.",
    path: ["unconfirmedNote"],
  })
  .refine((e) => e.analystInterpretation === null || e.interpretationBasis !== "unknown", {
    message: "An analyst interpretation must state its basis.",
    path: ["interpretationBasis"],
  });

export type SignalEventV7 = z.infer<typeof signalEventV7Schema>;

/** Provisional half-life for a signal type, or null for a v6 type with no digital-asset hypothesis. */
export function signalHalfLifeDays(t: SignalTypeV7): number | null {
  return isDigitalAssetType(t) ? DIGITAL_ASSET_SIGNAL_SPECS[t].halfLifeDays : null;
}
