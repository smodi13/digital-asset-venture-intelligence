/**
 * Synthetic packet fixtures for the v7 research harness (Phase 3B-0).
 *
 * Obviously synthetic: fake companies, fake people, example.com URLs. Never
 * research any of the 44 real Phase 3A universe entities here.
 */

export function baseSource(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "src-synthetic-01",
    schemaVersion: 7,
    publisher: "Synthetic Wire",
    title: "Synthetic Protocol ships v1",
    url: "https://example.com/synthetic-protocol-v1",
    sourceType: "official_protocol_source",
    tier: "b",
    reliability: 0.68,
    isIndependent: false,
    canCorroborate: false,
    accessedAt: "2026-08-01T00:00:00.000Z",
    publishedAt: "2026-07-15",
    availabilityDate: "2026-07-15",
    isPressReleaseReproduction: false,
    originatesFrom: null,
    supportRole: "primary_fact",
    ...overrides,
  };
}

/** An A-equity-only-company packet, the base case most fixtures start from. */
export function baseCompanyPacket(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    schemaVersion: 7,
    candidateId: "cand-synthetic-001",
    canonicalId: "co-synthetic-widgets",
    canonicalName: "Synthetic Widgets Inc",
    slug: "synthetic-widgets",
    description: "A synthetic equity-only company fixture, never a real entity.",
    domain: "synthetic-widgets.example.com",
    firstObservedAt: "2026-01-01",
    category: "custody_compliance_and_institutional_infrastructure",
    entityType: "company",
    assetType: "equity",
    institutionalOrientation: true,
    digitalAssetLifecycle: null,
    financingStage: "series_a",
    cohort: null,
    nameAliasNote: null,
    entityTypeCorrectionNote: null,
    assetTypeCorrectionNote: null,
    entityStructure: {
      relationships: [],
      protocolNetworkRelationship: null,
      unresolvedBoundaryNotes: [],
    },
    people: [
      {
        id: "per-synthetic-founder-01",
        schemaVersion: 7,
        name: "Ada Synthetic",
        aliases: [],
        currentRole: "CEO",
        companyTenures: [],
        priorCompanies: [],
        education: [],
        publicHandles: { github: null, x: null, linkedin: null, website: null },
        signalEventIds: [],
        sourceIds: [],
      },
    ],
    sources: [baseSource()],
    evidenceClaims: [
      {
        id: "clm-synthetic-01",
        schemaVersion: 7,
        companyId: "co-synthetic-widgets",
        claim: "Synthetic Widgets Inc shipped its v1 product in July 2026.",
        statedValue: null,
        numericValue: null,
        unit: null,
        sourceId: "src-synthetic-01",
        supportingSourceIds: [],
        sourceUrl: "https://example.com/synthetic-protocol-v1",
        publicationDate: "2026-07-15",
        metricAsOfDate: null,
        lastVerified: null,
        provenance: "sourced",
        sourceSubtype: "company_reported",
        confidence: "medium",
        modelEligibility: "context_only",
        topic: "product",
        notes: null,
        evidenceStatus: "supported",
        analystInterpretation: null,
        diligenceQuestion: null,
        researchAssessmentId: null,
        hardeningRef: null,
        verbatimExcerpt: null,
        contradicts: [],
        contradictedBy: [],
        contradictionNote: null,
      },
    ],
    signalEvents: [],
    digitalAssetMetrics: null,
    unknowns: [],
    researchNotes: {
      entityBoundaryUncertainty: null,
      sourceOriginUncertainty: null,
      likelyContradictions: null,
      completenessNotes: null,
    },
    researchCutoff: "2026-09-10",
    ...overrides,
  };
}
