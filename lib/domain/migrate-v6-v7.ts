import type { Company, SignalEvent } from "@/lib/schemas";
import {
  companyV7Schema,
  signalEventV7Schema,
  SCHEMA_VERSION_V7,
  type CompanyV7,
  type SignalEventV7,
} from "@/lib/schemas/v7";

/**
 * v6 -> v7 normalization adapter (DORMANT - Phase 2B).
 *
 * NOT imported by app/**, lib/screening-read/**, the active scoring path, or the
 * active research build path. tests/scoring/digital-asset/firewall.test.ts
 * enforces that. Phase 3 wires this in as part of the atomic activation.
 *
 * It ONLY normalizes record SHAPE. Supplying entityType = "company" and
 * assetType = "unknown" does not make the inherited AI corpus digital-asset
 * data; it makes a v6 record parse as a well-formed v7 record whose digital
 * asset classification is honestly unestablished.
 *
 * The adapter supplies explicit compatibility values for the required v7
 * identity fields precisely so that a future Phase 3 research record cannot
 * silently become "company" because a classifier was skipped: only this
 * adapter, operating on a known-v6 input, is allowed to default them.
 */

export function migrateCompanyV6ToV7(v6: Company): CompanyV7 {
  return companyV7Schema.parse({
    id: v6.id,
    schemaVersion: SCHEMA_VERSION_V7,
    entityType: "company",
    assetType: "unknown",
    name: v6.name,
    description: v6.description,
    domain: v6.domain,
    digitalAssetCategory: null,
    institutionalOrientation: null,
    digitalAssetLifecycle: null,
    digitalAssetMetrics: null,
    firstObservedAt: v6.firstObservedAt,
    sourceIds: v6.sourceIds,
  });
}

export function migrateSignalEventV6ToV7(v6: SignalEvent): SignalEventV7 {
  return signalEventV7Schema.parse({
    id: v6.id,
    schemaVersion: SCHEMA_VERSION_V7,
    subjectType: "company",
    subjectId: v6.companyId,
    subjectNameRaw: v6.companyNameRaw,
    signalType: v6.signalType,
    signalCategory: v6.signalCategory,
    signalDirection: v6.signalDirection,
    sourceId: v6.sourceId,
    rawStrength: v6.rawStrength,
    evidenceSummary: v6.evidenceSummary,
    evidenceIds: v6.evidenceIds,
    publicationDate: v6.publicationDate,
    availabilityDate: v6.availabilityDate,
    eventDate: v6.eventDate,
    // Pass the v6 record's own classification through rather than relying on
    // the v7 schema's default("completed"): a v6 reported_unconfirmed event
    // must not silently become "completed" merely because the adapter did
    // not name the field. See Phase 3B-0.1 section 5.
    eventStatus: v6.eventStatus,
    unconfirmedNote: v6.unconfirmedNote,
    analystInterpretation: v6.investmentInterpretation,
    interpretationBasis: v6.interpretationBasis,
  });
}
