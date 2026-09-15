import { z } from "zod";
import { SCHEMA_VERSION } from "@/lib/schemas/common";
import { companySchema, type Company } from "@/lib/schemas/company";
import { personSchema, type Person } from "@/lib/schemas/person";
import { evidenceClaimSchema, type EvidenceClaim } from "@/lib/schemas/evidence-claim";
import { sourceRecordSchema, type SourceRecord } from "@/lib/schemas/source-record";
import type { SignalEvent } from "@/lib/schemas/signal-event";
import { NOT_ESTABLISHED, availabilityProblem } from "@/lib/schemas/availability";
import { unknown } from "@/lib/provenance/constructors";
import { ingestSignalEventForReproducibleBuild } from "@/lib/domain/ingest";
import { parseCutoffDate } from "@/lib/backtest/cutoff";
import { stableHash } from "@/lib/hash/canonical";
import type { LoadedConfig } from "@/lib/config/load";
import {
  companyId as makeCompanyId,
  evidenceClaimId,
  personId as makePersonId,
  signalEventId,
  sourceId as makeSourceId,
} from "./ids";
import { buildResolver, isAutoResolvable, type ResolvableCompany } from "./entity/resolve";
import { dedupe } from "./dedupe";
import { ReviewCollector } from "./review";
import { headlineAdapter } from "./headline/adapter";
import {
  CORPUS_RESEARCH_STATUSES,
  type CompanyInput,
  type EvidenceInput,
  type EventInput,
  type HeadlineInput,
  type SourceInput,
} from "./input-schemas";

/**
 * The research pipeline.
 *
 * Research Input -> Source Validation -> Company Resolution ->
 * Evidence Normalisation -> Event Extraction -> Ingestion Boundary ->
 * Deduplication -> Corpus Validation
 *
 * Two properties govern every step.
 *
 * Deterministic. The same input and configuration always produce the same
 * corpus. Ids are derived from content, collections are sorted, and the run
 * timestamp is supplied rather than read from the clock. Without this the
 * manifest hash would change on every run and would stop meaning anything.
 *
 * Loud. A malformed record fails the run or goes to the review queue. It is
 * never silently dropped, because a silently dropped record is a gap that
 * looks exactly like a company simply not having that evidence.
 */

export interface PipelineInput {
  companies: readonly CompanyInput[];
  sources: readonly SourceInput[];
  evidence: readonly EvidenceInput[];
  events: readonly EventInput[];
  headlines: readonly HeadlineInput[];
}

export interface PipelineOptions {
  config: LoadedConfig;
  /**
   * The run timestamp, supplied rather than read from the clock.
   *
   * This is the research-build boundary established in Phase 2.1: production
   * ingestion reads the clock and takes no timestamp, while a reproducible
   * corpus build supplies one so an approved corpus can be regenerated exactly.
   * The production constructor is untouched.
   */
  researchRunAt: string;
  researchRunId: string;
  /** As-of date for staleness metrics. */
  asOf: string;
}

export interface PipelineOutput {
  companies: Company[];
  people: Person[];
  sources: SourceRecord[];
  claims: EvidenceClaim[];
  events: SignalEvent[];
  review: ReviewCollector;
  /** Companies excluded because their research status is not approved. */
  excludedCompanies: number;
}

function sortById<T extends { id: string }>(records: T[]): T[] {
  return [...records].sort((a, b) => a.id.localeCompare(b.id));
}

function isValidDate(value: string | null): boolean {
  return value === null || parseCutoffDate(value) !== null;
}

export function runPipeline(
  input: PipelineInput,
  options: PipelineOptions,
): PipelineOutput {
  const review = new ReviewCollector();
  const { config, researchRunAt } = options;

  /* ---------------------------------------------------------------------- */
  /* 1. Source validation                                                   */
  /* ---------------------------------------------------------------------- */

  const sourceIdByUrl = new Map<string, string>();
  const sourceRecords: SourceRecord[] = [];
  const reliabilityByType = new Map(
    config.sources.sourceClasses.map((cls) => [cls.id, cls.reliability]),
  );
  const tierByType = new Map(config.sources.sourceClasses.map((cls) => [cls.id, cls.tier]));

  for (const source of input.sources) {
    const id = makeSourceId({
      url: source.url,
      publisher: source.publisher,
      title: source.title,
    });
    sourceIdByUrl.set(source.url, id);

    if (!isValidDate(source.publishedAt)) {
      review.add({
        reason: "invalid_date",
        sourceFile: "research/input/sources.yaml",
        recordKey: source.url,
        detail: `publishedAt "${String(source.publishedAt)}" is not a valid calendar date`,
      });
      continue;
    }

    const parsed = sourceRecordSchema.safeParse({
      id,
      schemaVersion: SCHEMA_VERSION,
      publisher: source.publisher,
      title: source.title,
      url: source.url,
      sourceType: source.sourceType,
      tier: tierByType.get(source.sourceType) ?? "c",
      reliability: reliabilityByType.get(source.sourceType) ?? 0.4,
      accessedAt: researchRunAt,
      publishedAt: source.publishedAt,
      isPressReleaseReproduction: source.isPressReleaseReproduction,
      originatesFrom: null,
      supportRole: source.supportRole,
      termsNote: source.termsNote,
    });
    if (!parsed.success) {
      review.add({
        reason: "schema_invalid",
        sourceFile: "research/input/sources.yaml",
        recordKey: source.url,
        detail: issues(parsed.error),
      });
      continue;
    }
    sourceRecords.push(parsed.data);
  }

  // Resolve originatesFrom now that every source has an id.
  for (const source of input.sources) {
    if (!source.originatesFromUrl) continue;
    const childId = sourceIdByUrl.get(source.url);
    const parentId = sourceIdByUrl.get(source.originatesFromUrl);
    if (!childId) continue;
    if (!parentId) {
      review.add({
        reason: "missing_source",
        sourceFile: "research/input/sources.yaml",
        recordKey: source.url,
        detail: `originatesFromUrl "${source.originatesFromUrl}" is not itself listed in sources.yaml`,
      });
      continue;
    }
    const record = sourceRecords.find((s) => s.id === childId);
    if (record) record.originatesFrom = parentId;
  }

  /* ---------------------------------------------------------------------- */
  /* 2. Companies and people                                                */
  /* ---------------------------------------------------------------------- */

  const companies: Company[] = [];
  const people: Person[] = [];
  let excludedCompanies = 0;

  for (const company of input.companies) {
    if (!CORPUS_RESEARCH_STATUSES.includes(company.researchStatus)) {
      // Not an error. A company still in research simply does not enter the
      // corpus yet, and the count is reported so the gap is visible.
      excludedCompanies += 1;
      continue;
    }

    const id = makeCompanyId({ name: company.name, domain: company.domain });
    const founderIds: string[] = [];

    for (const founder of company.founders) {
      const pid = makePersonId({ name: founder.name, companyId: id });
      founderIds.push(pid);
      const parsedPerson = personSchema.safeParse({
        id: pid,
        schemaVersion: SCHEMA_VERSION,
        name: founder.name,
        aliases: [],
        currentRole: founder.role,
        companyTenures: [
          {
            companyId: id,
            companyName: company.name,
            role: founder.role ?? "Founder",
            startDate: null,
            endDate: null,
            isFounder: true,
            sourceIds: [],
          },
        ],
        priorCompanies: founder.priorCompanies,
        education: [],
        publicHandles: {
          github: founder.github,
          x: null,
          linkedin: founder.linkedin,
          website: null,
        },
        signalEventIds: [],
        sourceIds: [],
      });
      if (parsedPerson.success) people.push(parsedPerson.data);
      else {
        review.add({
          reason: "schema_invalid",
          sourceFile: "research/input/companies.yaml",
          recordKey: `${company.name} / ${founder.name}`,
          detail: issues(parsedPerson.error),
        });
      }
    }

    const parsed = companySchema.safeParse({
      id,
      schemaVersion: SCHEMA_VERSION,
      name: company.name,
      aliases: company.aliases,
      domain: company.domain,
      // Unknown stays unknown. A founding year absent from the research input
      // is recorded as not established, never inferred from anything.
      foundedYear:
        company.foundingYear === null
          ? unknown<number>("not disclosed in the research input")
          : {
              provenance: "sourced" as const,
              value: company.foundingYear,
              sourceSubtype: "company_reported" as const,
              confidence: "medium" as const,
              modelEligibility: "context_only" as const,
              asOf: null,
              evidenceIds: [],
            },
      operatingOriginYear: company.operatingOriginYear,
      hqLocation: company.headquarters,
      sector: company.sector,
      subsector: company.subsector,
      stage: company.stage,
      employeeCount: unknown<number>("not disclosed in the research input"),
      totalRaised: unknown<number>("not disclosed in the research input"),
      lastRound: unknown("not disclosed in the research input"),
      investorIds: [],
      founderIds,
      description: company.description,
      notes: company.notes,
      sourceIds: company.sourceUrls
        .map((url) => sourceIdByUrl.get(url))
        .filter((v): v is string => typeof v === "string"),
      firstObservedAt: company.firstObservedAt,
      lastUpdatedAt: researchRunAt,
      isPrivate: company.isPrivate,
      properties: {
        reason_sourced: { type: "string", value: company.reasonSourced },
        research_status: { type: "string", value: company.researchStatus },
        known_investors: { type: "string_list", value: company.knownInvestors },
      },
    });

    if (!parsed.success) {
      review.add({
        reason: "schema_invalid",
        sourceFile: "research/input/companies.yaml",
        recordKey: company.name,
        detail: issues(parsed.error),
      });
      continue;
    }

    // A cited URL that is not in sources.yaml is a research error, not a
    // silent omission: the citation would resolve to nothing.
    for (const url of company.sourceUrls) {
      if (!sourceIdByUrl.has(url)) {
        review.add({
          reason: "missing_source",
          sourceFile: "research/input/companies.yaml",
          recordKey: company.name,
          detail: `sourceUrl "${url}" is not listed in sources.yaml`,
        });
      }
    }

    companies.push(parsed.data);
  }

  /* ---------------------------------------------------------------------- */
  /* 3. Deduplication                                                       */
  /* ---------------------------------------------------------------------- */

  const dedupeResult = dedupe(
    companies.map((company) => ({
      id: company.id,
      domain: company.domain,
      name: company.name,
    })),
  );
  for (const group of dedupeResult.duplicateGroups) {
    review.add({
      reason: "duplicate_candidate",
      sourceFile: "research/input/companies.yaml",
      recordKey: group.canonicalId,
      detail: `${group.memberIds.length} records share a strong identity key (${group.mergedOn.join(", ")})`,
      candidates: group.memberIds,
    });
  }
  for (const collision of dedupeResult.nameCollisions) {
    // Reported, never merged. A shared name is suggestive and not sufficient.
    review.add({
      reason: "duplicate_candidate",
      sourceFile: "research/input/companies.yaml",
      recordKey: collision.normalizedName,
      detail:
        "several companies normalise to the same name but share no strong identity key, so they were kept separate",
      candidates: collision.ids,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* 4. Entity resolution                                                   */
  /* ---------------------------------------------------------------------- */

  const resolvable: ResolvableCompany[] = companies.map((company) => ({
    id: company.id,
    name: company.name,
    domain: company.domain,
    aliases: company.aliases,
  }));
  const resolver = buildResolver(resolvable);

  /* ---------------------------------------------------------------------- */
  /* 5. Evidence claims                                                     */
  /* ---------------------------------------------------------------------- */

  const claims: EvidenceClaim[] = [];
  const claimIdByText = new Map<string, string>();

  for (const item of input.evidence) {
    const resolution = resolver.resolve({
      companyId: undefined,
      name: item.company,
      domain: item.company.includes(".") ? item.company : null,
    });
    if (!isAutoResolvable(resolution)) {
      review.add({
        reason: resolution.candidates.length > 0 ? "ambiguous_company" : "unresolved_company",
        sourceFile: "research/input/evidence.yaml",
        recordKey: `${item.company}: ${item.claim.slice(0, 60)}`,
        detail: resolution.detail,
        candidates: resolution.candidates,
      });
      continue;
    }
    const resolvedCompanyId = resolution.companyId;
    if (resolvedCompanyId === null) continue;

    // A source-less claim is a pure analyst assumption: no source relationship
    // was supplied by the research packet, so none is invented here.
    let sourceRecordId: string | null = null;
    if (item.source !== null) {
      const resolved = sourceIdByUrl.get(item.source);
      if (!resolved) {
        review.add({
          reason: "missing_source",
          sourceFile: "research/input/evidence.yaml",
          recordKey: item.claim.slice(0, 60),
          detail: `source "${item.source}" is not listed in sources.yaml`,
        });
        continue;
      }
      sourceRecordId = resolved;
    }

    for (const [label, value] of [
      ["publicationDate", item.publicationDate],
      ["metricAsOfDate", item.metricAsOfDate],
      ["lastVerified", item.lastVerified],
    ] as const) {
      if (!isValidDate(value)) {
        review.add({
          reason: "invalid_date",
          sourceFile: "research/input/evidence.yaml",
          recordKey: item.claim.slice(0, 60),
          detail: `${label} "${String(value)}" is not a valid calendar date`,
        });
      }
    }

    // Supporting sources must also resolve. A citation to a source that is not
    // registered would silently vanish and overstate nothing, but it would
    // hide a research error, so it is reported.
    const supportingSourceIds: string[] = [];
    for (const url of item.supportingSources) {
      const supportingId = sourceIdByUrl.get(url);
      if (!supportingId) {
        review.add({
          reason: "missing_source",
          sourceFile: "research/input/evidence.yaml",
          recordKey: item.claim.slice(0, 60),
          detail: `supporting source "${url}" is not listed in sources.yaml`,
        });
        continue;
      }
      if (supportingId !== sourceRecordId) supportingSourceIds.push(supportingId);
    }

    const id = evidenceClaimId({
      companyId: resolvedCompanyId,
      sourceId: sourceRecordId,
      claim: item.claim,
      assessmentKey: item.researchAssessmentId,
    });
    claimIdByText.set(item.claim.trim(), id);

    const parsed = evidenceClaimSchema.safeParse({
      id,
      schemaVersion: SCHEMA_VERSION,
      companyId: resolvedCompanyId,
      claim: item.claim,
      statedValue: item.value,
      numericValue: item.numericValue,
      unit: item.unit,
      sourceId: sourceRecordId,
      supportingSourceIds: [...new Set(supportingSourceIds)].sort(),
      sourceUrl: item.source,
      publicationDate: item.publicationDate,
      metricAsOfDate: item.metricAsOfDate,
      lastVerified: item.lastVerified ? `${item.lastVerified}T00:00:00.000Z` : null,
      provenance: item.provenance,
      sourceSubtype: item.sourceSubtype,
      confidence: item.confidence,
      modelEligibility: item.modelEligibility,
      topic: item.topic,
      notes: item.notes,
      verbatimExcerpt: item.excerpt,
      evidenceStatus: item.evidenceStatus,
      analystInterpretation: item.analystInterpretation,
      diligenceQuestion: item.diligenceQuestion,
      researchAssessmentId: item.researchAssessmentId,
      hardeningRef: item.hardeningRef,
      contradicts: [],
      contradictedBy: [],
      contradictionNote: null,
    });

    if (!parsed.success) {
      review.add({
        reason: "schema_invalid",
        sourceFile: "research/input/evidence.yaml",
        recordKey: item.claim.slice(0, 60),
        detail: issues(parsed.error),
      });
      continue;
    }
    claims.push(parsed.data);
  }

  // Second pass: link contradictions now that every claim has an id.
  for (const item of input.evidence) {
    if (item.contradictsClaims.length === 0) continue;
    const selfId = claimIdByText.get(item.claim.trim());
    if (!selfId) continue;
    const self = claims.find((c) => c.id === selfId);
    if (!self) continue;
    for (const otherText of item.contradictsClaims) {
      const otherId = claimIdByText.get(otherText.trim());
      if (!otherId) {
        review.add({
          reason: "contradictory_claim",
          sourceFile: "research/input/evidence.yaml",
          recordKey: item.claim.slice(0, 60),
          detail: `contradictsClaims references "${otherText.slice(0, 60)}", which is not a claim in this corpus`,
        });
        continue;
      }
      if (!self.contradicts.includes(otherId)) self.contradicts.push(otherId);
      const other = claims.find((c) => c.id === otherId);
      // Contradiction is symmetric. Both records keep the link, because
      // deleting the losing claim would destroy the record of the disagreement.
      if (other && !other.contradictedBy.includes(selfId)) other.contradictedBy.push(selfId);
      review.add({
        reason: "contradictory_claim",
        sourceFile: "research/input/evidence.yaml",
        recordKey: item.claim.slice(0, 60),
        detail: "two claims contradict each other; both retained, a human should record which is correct",
        candidates: [selfId, otherId],
      });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 6. Events, from research input and from adapters                       */
  /* ---------------------------------------------------------------------- */

  const definedSignals = new Set(config.signals.signals.map((s) => s.id));
  const baseStrengthById = new Map(
    config.signals.signals.map((s) => [s.id, s.baseStrength]),
  );
  const events: SignalEvent[] = [];
  const seenEventIds = new Set<string>();

  const addEvent = (params: {
    file: string;
    recordKey: string;
    companyHint: { id?: string | null; name?: string | null; domain?: string | null };
    sourceUrl: string;
    signalType: string;
    category: string;
    direction: string;
    publicationDate: string | null;
    availabilityDate: string | null;
    availabilityEvidence: typeof NOT_ESTABLISHED;
    eventDate: string | null;
    evidenceSummary: string;
    confidence: string;
    humanVerified: string;
    verifiedBy: string | null;
    verifiedAt: string | null;
    interpretation: string | null;
    interpretationBasis: string;
    rawStrength: number | null;
    discriminator?: string | null;
    eventStatus: "completed" | "reported_unconfirmed";
    unconfirmedNote: string | null;
    extraProblems?: string[];
  }): void => {
    for (const problem of params.extraProblems ?? []) {
      review.add({
        reason: "ambiguous_event_classification",
        sourceFile: params.file,
        recordKey: params.recordKey,
        detail: problem,
      });
    }

    if (!definedSignals.has(params.signalType as never)) {
      review.add({
        reason: "unknown_signal_type",
        sourceFile: params.file,
        recordKey: params.recordKey,
        detail: `signal type "${params.signalType}" is not defined in config/signals.yaml`,
      });
      return;
    }

    const availability = availabilityProblem(
      params.availabilityDate,
      params.availabilityEvidence,
    );
    if (availability !== null) {
      review.add({
        reason: "missing_availability_evidence",
        sourceFile: params.file,
        recordKey: params.recordKey,
        detail: availability,
      });
      return;
    }

    for (const [label, value] of [
      ["publicationDate", params.publicationDate],
      ["availabilityDate", params.availabilityDate],
      ["eventDate", params.eventDate],
    ] as const) {
      if (!isValidDate(value)) {
        review.add({
          reason: "invalid_date",
          sourceFile: params.file,
          recordKey: params.recordKey,
          detail: `${label} "${String(value)}" is not a valid calendar date`,
        });
        return;
      }
    }

    const sourceRecordId = sourceIdByUrl.get(params.sourceUrl);
    if (!sourceRecordId) {
      review.add({
        reason: "missing_source",
        sourceFile: params.file,
        recordKey: params.recordKey,
        detail: `source "${params.sourceUrl}" is not listed in sources.yaml`,
      });
      return;
    }
    const sourceRecord = sourceRecords.find((s) => s.id === sourceRecordId);

    const resolution = resolver.resolve({
      companyId: params.companyHint.id ?? undefined,
      name: params.companyHint.name ?? null,
      domain: params.companyHint.domain?.includes(".") ? params.companyHint.domain : null,
    });

    const resolved = isAutoResolvable(resolution);
    if (!resolved) {
      review.add({
        reason:
          resolution.candidates.length > 0
            ? "ambiguous_company"
            : resolution.confidence > 0
              ? "low_confidence_match"
              : "unresolved_company",
        sourceFile: params.file,
        recordKey: params.recordKey,
        detail: resolution.detail,
        candidates: resolution.candidates,
      });
      // An unresolved event is still recorded, with companyId null, because
      // the observation is real even when the subject is uncertain. It simply
      // attaches to no company until a human resolves it.
    }

    const companyKey = resolution.companyId ?? params.companyHint.name ?? params.sourceUrl;
    const id = signalEventId({
      companyKey,
      sourceId: sourceRecordId,
      signalType: params.signalType,
      publicationDate: params.publicationDate,
      discriminator: params.discriminator ?? null,
    });

    // Belt and braces. A discriminator should make this impossible, but a
    // build must not crash on a data condition: a collision is reported and
    // the later record is held back rather than silently overwriting.
    if (seenEventIds.has(id)) {
      review.add({
        reason: "duplicate_candidate",
        sourceFile: params.file,
        recordKey: params.recordKey,
        detail: `event id ${id} collides with an already ingested event; supply a distinct research event id to separate them`,
        candidates: [id],
      });
      return;
    }
    seenEventIds.add(id);

    try {
      // Every event passes through the ingestion boundary. No script builds a
      // finished SignalEvent directly, which is asserted by test.
      const event = ingestSignalEventForReproducibleBuild(
        {
          id,
          schemaVersion: SCHEMA_VERSION,
          companyId: resolved ? resolution.companyId : null,
          companyNameRaw: params.companyHint.name ?? "unknown",
          entityMatchConfidence: resolved ? resolution.confidence : 0,
          entityMatchMethod: resolved ? resolution.method : "unresolved",
          sourceId: sourceRecordId,
          sourceUrl: params.sourceUrl,
          sourceRecordId: null,
          sourceReliability: sourceRecord?.reliability ?? 0.4,
          publicationDate: params.publicationDate,
          availabilityDate: params.availabilityDate,
          availabilityEvidence: params.availabilityEvidence,
          eventDate: params.eventDate,
          signalType: params.signalType as never,
          signalCategory: params.category as never,
          signalDirection: params.direction as never,
          eventStatus: params.eventStatus,
          unconfirmedNote: params.unconfirmedNote,
          rawStrength:
            params.rawStrength ?? baseStrengthById.get(params.signalType as never) ?? 0.5,
          evidenceSummary: params.evidenceSummary,
          evidenceIds: [],
          claimConfidence: params.confidence as never,
          humanVerified: params.humanVerified as never,
          verifiedBy: params.verifiedBy,
          verifiedAt: params.verifiedAt,
          contradicts: [],
          contradictedBy: [],
          investmentInterpretation: params.interpretation,
          interpretationBasis: params.interpretationBasis as never,
        },
        researchRunAt,
      );
      events.push(event);
    } catch (cause) {
      review.add({
        reason: "schema_invalid",
        sourceFile: params.file,
        recordKey: params.recordKey,
        detail: (cause as Error).message,
      });
    }
  };

  for (const item of input.events) {
    addEvent({
      file: "research/input/events.yaml",
      recordKey: `${item.company}: ${item.signalType}`,
      companyHint: { name: item.company, domain: item.company },
      sourceUrl: item.source,
      signalType: item.signalType,
      category: item.category,
      direction: item.direction,
      publicationDate: item.publicationDate,
      availabilityDate: item.availabilityDate,
      availabilityEvidence: item.availabilityEvidence,
      eventDate: item.eventDate,
      evidenceSummary: item.evidenceSummary,
      confidence: item.confidence,
      humanVerified: item.humanVerified,
      verifiedBy: item.verifiedBy,
      verifiedAt: item.verifiedAt,
      interpretation: item.interpretation,
      interpretationBasis: item.interpretationBasis,
      rawStrength: item.rawStrength,
      eventStatus: item.eventStatus,
      unconfirmedNote: item.unconfirmedNote,
      discriminator: item.researchEventId,
    });

    // An unconfirmed report is real market information and is not a completed
    // event. It is recorded, and it is also surfaced so a human confirms the
    // outcome rather than the corpus quietly carrying a maybe as a fact.
    if (item.eventStatus === "reported_unconfirmed") {
      review.add({
        reason: "unconfirmed_financing",
        sourceFile: "research/input/events.yaml",
        recordKey: `${item.company}: ${item.signalType}`,
        detail:
          item.unconfirmedNote ??
          "reported but not confirmed; confirm the outcome before any use as a completed event",
      });
    }
  }

  const headlineResult = headlineAdapter.collect({ headlines: input.headlines });
  for (const rejected of headlineResult.rejected) {
    review.add({
      reason: "unsupported_event_classification",
      sourceFile: "research/input/headlines.yaml",
      recordKey: rejected.detail.slice(0, 80),
      detail: rejected.detail,
    });
  }
  for (const candidate of headlineResult.candidates) {
    if (candidate.classification === null) continue;
    addEvent({
      file: "research/input/headlines.yaml",
      recordKey: candidate.source.title.slice(0, 80),
      companyHint: candidate.companyHint,
      sourceUrl: candidate.source.url,
      signalType: candidate.classification.signalType,
      category: candidate.classification.category,
      direction: candidate.classification.direction,
      publicationDate: candidate.temporal.publicationDate,
      availabilityDate: candidate.temporal.availabilityDate,
      availabilityEvidence: candidate.temporal.availabilityEvidence,
      eventDate: candidate.temporal.eventDate,
      evidenceSummary: candidate.evidenceSummary,
      confidence: "medium",
      humanVerified: "unverified",
      verifiedBy: null,
      verifiedAt: null,
      interpretation: null,
      interpretationBasis: "unknown",
      // The adapter's classification confidence is not the event's strength.
      // Strength comes from the signal definition; classification confidence
      // only decides whether the record enters the corpus or goes to review.
      rawStrength: null,
      // Adapter candidates describe events that happened. An adapter has no way
      // to know that a report is unconfirmed, so that classification stays a
      // human decision made in events.yaml.
      eventStatus: "completed" as const,
      unconfirmedNote: null,
      extraProblems: candidate.problems,
    });
  }

  return {
    companies: sortById(companies),
    people: sortById(people),
    sources: sortById(sourceRecords),
    claims: sortById(claims),
    events: sortById(events),
    review,
    excludedCompanies,
  };
}

function issues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/** A stable hash of the research input tree, tying a corpus to its input. */
export function hashResearchInput(input: PipelineInput): string {
  return stableHash({
    companies: input.companies,
    sources: input.sources,
    evidence: input.evidence,
    events: input.events,
    headlines: input.headlines,
  });
}
