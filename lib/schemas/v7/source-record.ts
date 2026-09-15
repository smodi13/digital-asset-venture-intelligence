import { z } from "zod";
import { schemaVersionV7Schema, idSchema, isoDateSchema, isoDateTimeSchema } from "./common";

/**
 * v7 SourceRecord (PARALLEL / DORMANT).
 *
 * Adds seven digital-asset source classes. Independence stays DECIDABLE, never
 * counted: class independence + originatesFrom chain + isPressReleaseReproduction.
 *
 * Preserved invariants:
 *   - isIndependent === false  =>  canCorroborate === false
 *   - analyst_inference never corroborates
 *   - N publications repeating one origin are one voice
 */

/** v6 source classes, carried unchanged. */
export const V6_SOURCE_TYPES = [
  "regulatory",
  "official_company",
  "founder_or_executive",
  "independent_journalism",
  "specialist_industry",
  "investor_industry",
  "structured_secondary",
  "customer_vendor",
  "identified_social",
  "community",
  "analyst_inference",
] as const;

/** The seven digital-asset source classes. */
export const DIGITAL_ASSET_SOURCE_TYPES = [
  "official_protocol_source",
  "official_network_source",
  "governance_forum",
  "block_explorer",
  "onchain_analytics",
  "code_repository",
  "security_audit",
] as const;

export const sourceTypeV7Schema = z.enum([...V6_SOURCE_TYPES, ...DIGITAL_ASSET_SOURCE_TYPES]);
export type SourceTypeV7 = z.infer<typeof sourceTypeV7Schema>;

export const sourceTierSchema = z.enum(["a", "b", "c", "d"]);
export type SourceTier = z.infer<typeof sourceTierSchema>;

/** v6 support roles plus three digital-asset roles. */
export const sourceSupportRoleV7Schema = z.enum([
  "primary_fact",
  "direct_company_disclosure",
  "legal_entity_disclosure",
  "corroborating",
  "contextual",
  "customer_vendor",
  "third_party_estimate",
  "transaction_detail",
  "historical_context",
  "repeated_announcement",
  "onchain_fact",
  "governance_record",
  "audit_finding",
]);
export type SourceSupportRoleV7 = z.infer<typeof sourceSupportRoleV7Schema>;

export interface SourceClassProfile {
  reliabilityPrior: number;
  isIndependent: boolean;
  canCorroborate: boolean;
  /** true when N records that resolve to one origin must collapse to one voice. */
  originDedupRequired: boolean;
  note: string;
}

/**
 * PROVISIONAL digital-asset source-class profiles. Reliability priors are
 * uncalibrated hypotheses.
 */
export const DIGITAL_ASSET_SOURCE_PROFILES: Record<
  (typeof DIGITAL_ASSET_SOURCE_TYPES)[number],
  SourceClassProfile
> = {
  official_protocol_source: {
    reliabilityPrior: 0.68,
    isIndependent: false,
    canCorroborate: false,
    originDedupRequired: true,
    note: "First-party. Cannot corroborate itself. Roadmap is not shipped state.",
  },
  official_network_source: {
    reliabilityPrior: 0.68,
    isIndependent: false,
    canCorroborate: false,
    originDedupRequired: true,
    note: "First-party foundation/core-org comms. Cannot corroborate itself. Selective disclosure risk.",
  },
  governance_forum: {
    reliabilityPrior: 0.55,
    isIndependent: false,
    canCorroborate: false,
    originDedupRequired: true,
    note: "Participant/governance record. Not independent by default; cannot corroborate broad project claims alone. An EXECUTED governance record may still be a primary fact.",
  },
  block_explorer: {
    reliabilityPrior: 0.9,
    isIndependent: true,
    canCorroborate: true,
    originDedupRequired: true,
    note: "High reliability for facts of ledger state. Two explorers exposing the same transaction/state are ONE origin. Address labeling / interpretation is not automatically a chain fact.",
  },
  onchain_analytics: {
    reliabilityPrior: 0.6,
    isIndependent: true,
    canCorroborate: true,
    originDedupRequired: true,
    note: "May be independent but methodology-sensitive. originatesFrom must collapse republished/copied dashboards and shared upstream methodologies. N dashboards from one provider are not N voices.",
  },
  code_repository: {
    reliabilityPrior: 0.75,
    isIndependent: false,
    canCorroborate: false,
    originDedupRequired: true,
    note: "High reliability for repository facts. The project normally controls its repository. Commits/releases establish development facts. Stars/forks never establish customers, revenue, traction, or investment quality.",
  },
  security_audit: {
    reliabilityPrior: 0.85,
    isIndependent: true,
    canCorroborate: true,
    originDedupRequired: true,
    note: "Independent third-party WITHIN the explicit audit scope. May corroborate audit findings. 'Audited' never means 'safe'. Later code may be out of scope. Repeated marketing mentions of one audit remain one source.",
  },
};

export const sourceRecordV7Schema = z
  .object({
    id: idSchema,
    schemaVersion: schemaVersionV7Schema,

    publisher: z.string().min(1),
    title: z.string().min(1),
    url: z.url().nullable(),

    sourceType: sourceTypeV7Schema,
    tier: sourceTierSchema,
    reliability: z.number().min(0).max(1),

    isIndependent: z.boolean(),
    canCorroborate: z.boolean(),

    accessedAt: isoDateTimeSchema,
    publishedAt: isoDateSchema.nullable(),
    /**
     * The earliest point in time this exact information is DEMONSTRATED to
     * have been publicly available. Distinct from publishedAt (what the
     * source states) and accessedAt (when the researcher looked). Null when
     * historical availability cannot be established; never inferred from
     * publishedAt as a convenience. This is the decisive field for research
     * cutoff enforcement (see lib/research-v7/dates.ts).
     */
    availabilityDate: isoDateSchema.nullable().default(null),

    isPressReleaseReproduction: z.boolean().default(false),
    /** The origin this record derives from. Two records sharing an origin are one voice. */
    originatesFrom: idSchema.nullable().default(null),
    supportRole: sourceSupportRoleV7Schema.nullable().default(null),
  })
  .refine((s) => s.isIndependent || !s.canCorroborate, {
    message: "A source that is not independent must not be able to corroborate.",
    path: ["canCorroborate"],
  })
  .refine((s) => s.sourceType !== "analyst_inference" || !s.canCorroborate, {
    message: "analyst_inference never corroborates. It is not evidence.",
    path: ["canCorroborate"],
  });

export type SourceRecordV7 = z.infer<typeof sourceRecordV7Schema>;
