import type { Packet } from "./packet-schema";
import type { CompanyV7 } from "@/lib/schemas/v7/company";
import type { Person } from "@/lib/schemas/person";
import type { SourceRecordV7 } from "@/lib/schemas/v7/source-record";
import type { EvidenceClaim } from "@/lib/schemas/evidence-claim";
import type { SignalEventV7 } from "@/lib/schemas/v7/signal-event";
import { validatePacket, issue, type Issue } from "./validate";
import {
  checkSourceOrigins,
  checkSourceDedupe,
  checkSourceCutoff,
  checkEvidenceClaims,
  checkSignalEvents,
  checkMetricDates,
  checkUniverseContract,
  checkEntityDedupe,
  checkPersonDedupe,
  collectEvidenceBearingSourceIds,
} from "./integrity";
import { allDuplicates } from "./ids";
import type { UniverseContract } from "./universe-contract";
import { buildManifestV7Entry, type ManifestV7, type ManifestV7Entry } from "./manifest";

/**
 * Deterministic validate-all-then-compile pipeline (Phase 3B-0, PARALLEL /
 * DORMANT).
 *
 * One bad packet fails loudly and produces NO output: schema validation and
 * cross-packet integrity checks run to completion across the whole batch
 * before any generated file is written, so a partially valid corpus is never
 * possible.
 */

export type SignalEventV7WithIngestion = SignalEventV7 & { ingestedAt: string };

export interface CompiledCorpus {
  companies: CompanyV7[];
  people: Person[];
  sources: SourceRecordV7[];
  evidenceClaims: EvidenceClaim[];
  signalEvents: SignalEventV7WithIngestion[];
}

export interface CompileInput {
  label: string;
  raw: unknown;
}

export interface CompileOptions {
  contract?: UniverseContract;
  batch: "CALIBRATION" | "VALIDATION" | "FINAL_TEST" | "SYNTHETIC";
  now?: Date;
}

export interface CompileResult {
  ok: boolean;
  issues: Issue[];
  corpus: CompiledCorpus | null;
  manifest: ManifestV7 | null;
  files: Record<string, string> | null;
}

function packetToCompany(p: Packet): CompanyV7 {
  return {
    id: p.canonicalId,
    schemaVersion: 7,
    entityType: p.entityType,
    assetType: p.assetType,
    name: p.canonicalName,
    description: p.description,
    domain: p.domain,
    digitalAssetCategory: p.category,
    institutionalOrientation: p.institutionalOrientation,
    digitalAssetLifecycle: p.digitalAssetLifecycle,
    digitalAssetMetrics: p.digitalAssetMetrics,
    firstObservedAt: p.firstObservedAt,
    sourceIds: [...p.sources.map((s) => s.id)].sort(),
  };
}

/** Validate a batch of raw packets, run cross-packet integrity, and compile a deterministic corpus. Writes nothing itself. */
export function compileBatch(inputs: readonly CompileInput[], options: CompileOptions): CompileResult {
  const issues: Issue[] = [];
  const packets: Packet[] = [];

  for (const input of inputs) {
    const result = validatePacket(input.raw, input.label);
    issues.push(...result.issues);
    if (result.ok && result.packet) packets.push(result.packet);
  }

  // Schema-invalid packets make cross-packet integrity meaningless: stop here.
  if (issues.some((i) => i.severity === "ERROR")) {
    return { ok: false, issues, corpus: null, manifest: null, files: null };
  }

  const allSources = packets.flatMap((p) => p.sources.map((s) => ({ ...s, packetId: p.canonicalId })));
  const allEvidence = packets.flatMap((p) => p.evidenceClaims);
  const allSignals = packets.flatMap((p) => p.signalEvents);
  const allPeople = packets.flatMap((p) =>
    p.people.map((person) => ({ id: person.id, name: person.name, packetId: p.canonicalId, person })),
  );

  const sourceIdConflicts = allDuplicates(allSources.map((s) => s.id)).filter((id) => {
    const withId = allSources.filter((s) => s.id === id);
    return new Set(withId.map((s) => JSON.stringify({ ...s, packetId: undefined }))).size > 1;
  });
  for (const id of sourceIdConflicts) {
    issues.push(issue("ERROR", "duplicate_source_id_conflict", `Source id "${id}" is used by more than one packet with conflicting content.`));
  }

  for (const p of packets) {
    issues.push(...checkSourceOrigins(p.sources, p.canonicalId));
    issues.push(...checkMetricDates(p));
    if (options.contract) issues.push(...checkUniverseContract(p, options.contract));
    for (const claim of p.evidenceClaims) {
      if (claim.companyId !== p.canonicalId) {
        issues.push(
          issue(
            "ERROR",
            "evidence_claim_wrong_entity",
            `EvidenceClaim "${claim.id}" carries companyId "${claim.companyId}", which does not match this packet's canonicalId "${p.canonicalId}".`,
            { packetId: p.canonicalId, path: `evidenceClaims.${claim.id}.companyId` },
          ),
        );
      }
    }
  }
  issues.push(...checkSourceDedupe(allSources, "batch"));
  const evidenceBearingSourceIds = new Set<string>();
  for (const p of packets) {
    for (const id of collectEvidenceBearingSourceIds(p)) evidenceBearingSourceIds.add(id);
  }
  issues.push(...checkSourceCutoff(allSources, evidenceBearingSourceIds, "batch"));

  const sourceIdSet = new Set(allSources.map((s) => s.id));
  const evidenceIdSet = new Set(allEvidence.map((e) => e.id));
  const subjectIdSet = new Set(packets.map((p) => p.canonicalId));
  issues.push(...checkEvidenceClaims(allEvidence, sourceIdSet, "batch"));
  issues.push(...checkSignalEvents(allSignals, sourceIdSet, evidenceIdSet, subjectIdSet, "batch"));
  issues.push(...checkEntityDedupe(packets));
  issues.push(...checkPersonDedupe(allPeople));

  if (issues.some((i) => i.severity === "ERROR")) {
    return { ok: false, issues, corpus: null, manifest: null, files: null };
  }

  const now = (options.now ?? new Date()).toISOString();

  const corpus: CompiledCorpus = {
    companies: packets.map(packetToCompany).sort((a, b) => a.id.localeCompare(b.id)),
    people: [...new Map(allPeople.map((p) => [p.id, p.person])).values()].sort((a, b) => a.id.localeCompare(b.id)),
    sources: [...new Map(allSources.map((s) => [s.id, s])).values()]
      .map((s): SourceRecordV7 => {
        const { packetId, ...rest } = s;
        void packetId;
        return rest;
      })
      .sort((a, b) => a.id.localeCompare(b.id)),
    evidenceClaims: [...allEvidence].sort((a, b) => a.id.localeCompare(b.id)),
    signalEvents: allSignals.map((e) => ({ ...e, ingestedAt: now })).sort((a, b) => a.id.localeCompare(b.id)),
  };

  const files: Record<string, string> = {
    "data/v7-generated/companies.v7.json": JSON.stringify(corpus.companies, null, 2) + "\n",
    "data/v7-generated/people.v7.json": JSON.stringify(corpus.people, null, 2) + "\n",
    "data/v7-generated/sources.v7.json": JSON.stringify(corpus.sources, null, 2) + "\n",
    "data/v7-generated/evidence-claims.v7.json": JSON.stringify(corpus.evidenceClaims, null, 2) + "\n",
    "data/v7-generated/signal-events.v7.json": JSON.stringify(corpus.signalEvents, null, 2) + "\n",
  };

  const generator = "scripts/research-v7/build-corpus.ts";
  const entries: ManifestV7Entry[] = [
    buildManifestV7Entry({ path: "data/v7-generated/companies.v7.json", text: files["data/v7-generated/companies.v7.json"]!, generatedAt: now, generator, recordCount: corpus.companies.length }),
    buildManifestV7Entry({ path: "data/v7-generated/people.v7.json", text: files["data/v7-generated/people.v7.json"]!, generatedAt: now, generator, recordCount: corpus.people.length }),
    buildManifestV7Entry({ path: "data/v7-generated/sources.v7.json", text: files["data/v7-generated/sources.v7.json"]!, generatedAt: now, generator, recordCount: corpus.sources.length }),
    buildManifestV7Entry({ path: "data/v7-generated/evidence-claims.v7.json", text: files["data/v7-generated/evidence-claims.v7.json"]!, generatedAt: now, generator, recordCount: corpus.evidenceClaims.length }),
    buildManifestV7Entry({ path: "data/v7-generated/signal-events.v7.json", text: files["data/v7-generated/signal-events.v7.json"]!, generatedAt: now, generator, recordCount: corpus.signalEvents.length }),
  ];

  const manifest: ManifestV7 = { schemaVersion: 7, generatedAt: now, batch: options.batch, entries };
  files["data/v7-generated/MANIFEST.v7.json"] = JSON.stringify(manifest, null, 2) + "\n";

  return { ok: true, issues, corpus, manifest, files };
}
