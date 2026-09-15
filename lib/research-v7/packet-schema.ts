import { z } from "zod";
import { idSchema, isoDateSchema } from "@/lib/schemas/common";
import {
  digitalAssetCategorySchema,
  digitalAssetLifecycleSchema,
  digitalAssetMetricsSchema,
  entityTypeSchema,
  assetTypeSchema,
} from "@/lib/schemas/v7/company";
import { sourceRecordV7Schema } from "@/lib/schemas/v7/source-record";
import { signalEventV7Schema } from "@/lib/schemas/v7/signal-event";
import { evidenceClaimSchema } from "@/lib/schemas/evidence-claim";
import { personSchema } from "@/lib/schemas/person";
import { RESEARCH_CUTOFF } from "./dates";

/**
 * The v7 research packet: one human-reviewable YAML file per entity
 * (Phase 3B-0, PARALLEL / DORMANT).
 *
 * The packet is RESEARCH DATA. It must never contain investment scoring
 * judgments (rawAnchor, criterionScore, thesisFit, rank, ...). See
 * FORBIDDEN_PACKET_FIELDS and scanForForbiddenFields below: the firewall is
 * enforced both by schema strictness (an unrecognized key fails validation)
 * and by an explicit named scan (so the error names the exact forbidden
 * field, not just "unrecognized key").
 */

export const FORBIDDEN_PACKET_FIELDS = [
  "rawAnchor",
  "criterionScore",
  "dimensionScore",
  "thesisFit",
  "thesis_fit",
  "screeningScore",
  "underwritingScore",
  "rank",
  "investmentRank",
  "recommendation",
  "investmentRecommendation",
  "screeningEvidenceEligibility",
  "rankEligibility",
  "priorityScore",
] as const;

/** research_priority_note (Phase 3A workflow metadata) is explicitly NOT a forbidden field. Do not add it here. */
const FORBIDDEN_FIELD_SET = new Set<string>(FORBIDDEN_PACKET_FIELDS);

export interface ForbiddenFieldHit {
  field: string;
  path: string;
}

/**
 * Fields that must be explicitly present in a newly authored packet's raw
 * input, even though the underlying dormant v7 schema defaults them.
 *
 * signalEventV7Schema defaults eventStatus to "completed" so the dormant
 * lib/domain/migrate-v6-v7.ts adapter can normalize a v6 record's shape
 * without re-deriving a field the v6 record never carried through the
 * adapter. That compatibility default must not let a newly authored v7
 * research event skip classifying itself as completed or
 * reported_unconfirmed: the author must decide, every time. Checked on the
 * RAW object (before zod applies its default) because a defaulted value is
 * indistinguishable from an explicitly supplied one once parsed.
 */
const REQUIRED_EXPLICIT_SIGNAL_EVENT_FIELDS = ["eventStatus"] as const;

export interface MissingExplicitFieldHit {
  field: string;
  path: string;
}

export function scanForMissingExplicitSignalEventFields(raw: unknown): MissingExplicitFieldHit[] {
  const hits: MissingExplicitFieldHit[] = [];
  if (raw === null || typeof raw !== "object") return hits;
  const events = (raw as Record<string, unknown>).signalEvents;
  if (!Array.isArray(events)) return hits;
  events.forEach((event, i) => {
    if (event === null || typeof event !== "object") return;
    for (const field of REQUIRED_EXPLICIT_SIGNAL_EVENT_FIELDS) {
      if (!(field in event)) hits.push({ field, path: `signalEvents[${i}].${field}` });
    }
  });
  return hits;
}

/** Recursively scan a raw (pre-validation) packet object for forbidden scoring fields, at any depth. */
export function scanForForbiddenFields(value: unknown, path = "$"): ForbiddenFieldHit[] {
  const hits: ForbiddenFieldHit[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => hits.push(...scanForForbiddenFields(item, `${path}[${i}]`)));
    return hits;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = `${path}.${key}`;
      if (FORBIDDEN_FIELD_SET.has(key)) hits.push({ field: key, path: nextPath });
      hits.push(...scanForForbiddenFields(v, nextPath));
    }
  }
  return hits;
}

/* -------------------------------------------------------------------------- */
/* Packet sections                                                            */
/* -------------------------------------------------------------------------- */

export const entityRelationshipSchema = z
  .object({
    description: z.string().min(1),
    relatedEntityId: idSchema.nullable().default(null),
    relationType: z.string().min(1).nullable().default(null),
  })
  .strict();

export const entityStructureSchema = z
  .object({
    relationships: z.array(entityRelationshipSchema).default([]),
    protocolNetworkRelationship: z.string().min(1).nullable().default(null),
    unresolvedBoundaryNotes: z.array(z.string().min(1)).default([]),
  })
  .strict();

/** A packet source entry: the v7 SourceRecord shape, validated as-is. */
export const packetSourceSchema = sourceRecordV7Schema;

/**
 * A packet Person entry.
 *
 * lib/schemas/person.ts is version-neutral (schemaVersion is a plain positive
 * integer, not literal 6, and nothing in the module reads the active
 * SCHEMA_VERSION constant), so it is reused as-is rather than duplicated
 * under lib/schemas/v7/. Reuse alone does not stop an author typing
 * schemaVersion: 6 by mistake, so this refinement pins it to 7: a v7 corpus
 * must never contain a record that claims schemaVersion 6 merely because a
 * shared, version-neutral schema was reused. See
 * tests/research-v7/version-safety.test.ts.
 */
export const packetPersonSchema = personSchema.refine((p) => p.schemaVersion === 7, {
  message: "A v7 packet Person must carry schemaVersion 7, not the reused schema's default.",
  path: ["schemaVersion"],
});

/**
 * A packet evidence claim entry.
 *
 * lib/schemas/evidence-claim.ts is likewise version-neutral: reused as-is,
 * with the same schemaVersion pin as packetPersonSchema above. companyId
 * carries the packet's canonicalId (enforced in lib/research-v7/compile.ts).
 */
export const packetEvidenceClaimSchema = evidenceClaimSchema.refine((c) => c.schemaVersion === 7, {
  message: "A v7 packet EvidenceClaim must carry schemaVersion 7, not the reused schema's default.",
  path: ["schemaVersion"],
});

/** A packet signal event entry: the full v7 SignalEvent shape, refinements included (no ingestedAt: stamped at compile time). */
export const packetSignalEventSchema = signalEventV7Schema;

export const unknownGapSchema = z
  .object({
    id: idSchema,
    whatWasSearched: z.string().min(1),
    whatCouldNotBeEstablished: z.string().min(1),
    expectedToMatter: z.boolean(),
  })
  .strict();

export const researchNotesSchema = z
  .object({
    entityBoundaryUncertainty: z.string().min(1).nullable().default(null),
    sourceOriginUncertainty: z.string().min(1).nullable().default(null),
    likelyContradictions: z.string().min(1).nullable().default(null),
    completenessNotes: z.string().min(1).nullable().default(null),
  })
  .strict();

export const packetSchema = z
  .object({
    schemaVersion: z.literal(7),

    // Identity
    candidateId: z.string().min(1),
    canonicalId: idSchema,
    canonicalName: z.string().min(1),
    slug: z.string().min(1),
    description: z.string().min(1),
    domain: z.string().min(1).nullable().default(null),
    firstObservedAt: isoDateSchema,
    category: digitalAssetCategorySchema.nullable().default(null),
    entityType: entityTypeSchema,
    assetType: assetTypeSchema,
    institutionalOrientation: z.boolean().nullable().default(null),
    digitalAssetLifecycle: digitalAssetLifecycleSchema.nullable().default(null),
    financingStage: z.string().min(1).nullable().default(null),
    cohort: z.enum(["CALIBRATION", "VALIDATION", "FINAL_TEST"]).nullable().default(null),

    /**
     * Documented corrections against the frozen universe contract. Each is a
     * reason string, present only when the packet author is knowingly
     * deviating from the universe/reserves CSV on a factual basis. Absent
     * (null) means "matches the contract; no correction claimed". cohort has
     * no correction field: cohort reassignment is never author-controlled.
     */
    nameAliasNote: z.string().min(1).nullable().default(null),
    entityTypeCorrectionNote: z.string().min(1).nullable().default(null),
    assetTypeCorrectionNote: z.string().min(1).nullable().default(null),

    entityStructure: entityStructureSchema.default({
      relationships: [],
      protocolNetworkRelationship: null,
      unresolvedBoundaryNotes: [],
    }),

    people: z.array(packetPersonSchema).default([]),
    sources: z.array(packetSourceSchema).default([]),
    evidenceClaims: z.array(packetEvidenceClaimSchema).default([]),
    signalEvents: z.array(packetSignalEventSchema).default([]),
    digitalAssetMetrics: digitalAssetMetricsSchema.nullable().default(null),

    unknowns: z.array(unknownGapSchema).default([]),
    researchNotes: researchNotesSchema.default({
      entityBoundaryUncertainty: null,
      sourceOriginUncertainty: null,
      likelyContradictions: null,
      completenessNotes: null,
    }),

    researchCutoff: isoDateSchema.default(RESEARCH_CUTOFF),
  })
  .strict();

export type PacketInput = z.input<typeof packetSchema>;
export type Packet = z.infer<typeof packetSchema>;
