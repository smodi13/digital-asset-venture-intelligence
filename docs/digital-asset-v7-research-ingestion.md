# Digital-Asset V7 Research Ingestion Harness

Phase 3B-0. Documents the packet format, validation, provenance, integrity,
dedupe, and deterministic compilation built to research the 44-entity Phase
3A universe in later phases. Cross-reference
`docs/digital-asset-v7-research-methodology.md` for the underlying v7 domain
model (schemas, categories, entityType, assetType) this harness validates
against.

## 1. Status: dormant

No real Phase 3A universe entity has been researched. `research/v7/input/`
holds no real packets. `data/v7-generated/` does not exist in the repository;
it is created only by running the build script, and only under a location the
operator chooses (never automatically at the repository root during tests).
The active v6 application, active corpus (`data/generated/**`), active
schemas (`lib/schemas/*.ts`), active config (`config/*.yaml`), and active
scoring (`lib/scoring/*.ts`, excluding `lib/scoring/digital-asset/**`) are
unchanged by this phase.

## 2. Purpose

Later phases will research three sealed cohorts drawn from the frozen Phase
3A universe: CALIBRATION (15 entities), VALIDATION (15 entities), and
FINAL_TEST (14 entities). This harness exists so the packet format,
validation rules, provenance rules, cross-record integrity checks,
deterministic compilation, and review workflow are proven against synthetic
fixtures before any real source or EvidenceClaim is produced.

## 3. The research packet

One human-reviewable YAML file per entity. Schema:
`lib/research-v7/packet-schema.ts` (`packetSchema`). Sections:

- **Identity**: `candidateId`, `canonicalId`, `canonicalName`, `slug`,
  `description`, `domain`, `firstObservedAt`, `category`, `entityType`,
  `assetType`, `institutionalOrientation`, `digitalAssetLifecycle`,
  `financingStage`, `cohort`.
- **Entity structure**: `entityStructure` (company/protocol/network
  relationships, unresolved entity-boundary notes).
- **People**: `people`, reusing `lib/schemas/person.ts` as-is, pinned to
  `schemaVersion` 7 at the packet boundary (see section 18).
- **Sources**: `sources`, the v7 `SourceRecord` shape
  (`lib/schemas/v7/source-record.ts`), extended in this phase with
  `availabilityDate` (see section 6).
- **Evidence claims**: `evidenceClaims`, reusing
  `lib/schemas/evidence-claim.ts` as-is, likewise pinned to `schemaVersion` 7
  (section 18). `companyId` must equal the packet's own `canonicalId`.
- **Signal events**: `signalEvents`, the v7 `SignalEvent` shape
  (`lib/schemas/v7/signal-event.ts`), extended in this phase with
  `eventStatus`, `unconfirmedNote`, `analystInterpretation`, and
  `interpretationBasis` (see section 6). No `ingestedAt` field: it is stamped
  by the compiler at build time, never supplied by a packet author.
- **Digital-asset metrics**: `digitalAssetMetrics`, the v7 metrics shape
  (`lib/schemas/v7/company.ts`).
- **Unknowns**: `unknowns`, what was searched, what could not be established,
  whether the gap is expected to matter.
- **Research notes**: `researchNotes`, entity-boundary uncertainty,
  source-origin uncertainty, likely contradictions, completeness notes.
- **`researchCutoff`**: must equal `2026-09-10` (section 5).

The packet is research data. It never contains investment scoring judgments.

## 4. Forbidden scoring fields

`FORBIDDEN_PACKET_FIELDS` in `lib/research-v7/packet-schema.ts`: `rawAnchor`,
`criterionScore`, `dimensionScore`, `thesisFit`, `thesis_fit`,
`screeningScore`, `underwritingScore`, `rank`, `investmentRank`,
`recommendation`, `investmentRecommendation`,
`screeningEvidenceEligibility`, `rankEligibility`, `priorityScore`.

Enforced two ways: `scanForForbiddenFields` recursively scans the raw
(pre-validation) packet object for these exact keys at any nesting depth and
fails with a named `forbidden_scoring_field` error before schema validation
runs at all, and the top-level packet schema is `.strict()` so an
unrecognized key at the top level also fails. `research_priority_note`
(Phase 3A workflow metadata) is explicitly not in the forbidden list: it is
not an investment rank and packets may carry it as an ordinary field if a
future phase adds it to the schema.

## 5. Research cutoff

Frozen at `2026-09-10` (`RESEARCH_CUTOFF` in `lib/research-v7/dates.ts`).
`availabilityDate` is the decisive field for leakage, never `publicationDate`
and never `ingestedAt`. `checkCutoff` requires `availabilityDate` to be
present and on or before the cutoff; a present but after-cutoff
`publicationDate` fails independently. A missing `availabilityDate` is never
inferred from `publicationDate`: it fails as `availability_date_missing`,
distinctly from `availability_date_after_cutoff`. Applied to every signal
event, every non-null point-in-time (`asOf`) or period (`periodEnd`) metric
date, and every evidence-bearing source (section 18).

## 6. Additive schema changes made in this phase

Two nullable, defaulted fields were added to the dormant v7 schemas so the
packet could represent what the phase spec requires. Both are additive:
nothing existing breaks, `SCHEMA_VERSION_V7` stays `7`, and neither is
consumed by any active path.

- `lib/schemas/v7/source-record.ts`: `availabilityDate` (nullable,
  default `null`), distinct from `publishedAt` and `accessedAt`.
- `lib/schemas/v7/signal-event.ts`: `eventStatus` (`completed` |
  `reported_unconfirmed`, default `completed`), `unconfirmedNote`,
  `analystInterpretation`, `interpretationBasis`, mirroring the vocabulary
  already established in the active `lib/schemas/signal-event.ts`. A
  `reported_unconfirmed` event without `unconfirmedNote` fails validation; an
  `analystInterpretation` without a stated `interpretationBasis` fails
  validation. The schema's own `eventStatus` default exists only so
  `lib/domain/migrate-v6-v7.ts` can normalize record shape; the packet
  harness itself requires `eventStatus` to be explicit for every newly
  authored event (section 18) and never relies on that default.

## 7. Source-origin and independence rules

`lib/research-v7/integrity.ts` (`checkSourceOrigins`) and
`lib/research-v7/independence.ts`:

- `originatesFrom` must resolve to a known source id, or the packet fails
  with `origin_unresolved`.
- A cycle in the `originatesFrom` chain (direct or longer) fails with
  `origin_cycle`, naming the full cycle path. Unlike the active
  `lib/research/independence.ts` (which must never hang a production build on
  hand-authored v6 data and so silently truncates a cycle), a v7 packet author
  sets `originatesFrom` explicitly, so a cycle here is always an authoring
  mistake worth surfacing.
- `countIndependentSources` and `areSourcesIndependent` collapse shared
  origins, press-release reproductions, and non-corroborating source classes
  into a single voice: two block explorers sharing an `originatesFrom` origin,
  N onchain-analytics dashboards sharing one upstream provider, or ten outlets
  reprinting one announcement never count as more than one independent
  source. Number of URLs is never confidence.

## 8. Source deduplication

`lib/research-v7/dedupe.ts` (`findSourceDuplicates`):

- Two distinct source ids resolving to the same normalized URL (tracking
  parameters stripped, `www.` and trailing slash normalized, reusing
  `lib/research/ids.ts`'s `normalizeUrlForIdentity`) is an ERROR
  (`duplicate_source_url`): an author-supplied id scheme makes this a real
  authoring mistake, not a modeling question.
- Two source ids sharing publisher, normalized title, and publication date
  under different URLs is a WARNING (`likely_duplicate_source`): suggestive,
  never merged automatically.
- Two articles with merely similar titles are never flagged or merged.

## 9. EvidenceClaim and SignalEvent integrity

`lib/research-v7/integrity.ts`. EvidenceClaim: unique ids, `sourceId` and
`supportingSourceIds` resolve to known sources, `contradicts` /
`contradictedBy` resolve to known claim ids, no claim contradicts itself,
`companyId` matches the owning packet. SignalEvent: unique ids, `sourceId`
resolves, `evidenceIds` resolve, `subjectId` (when non-null) resolves to a
known entity, subject/category/direction compatibility with `signalType`
(enforced by the v7 schema refinement), cutoff applied to
`publicationDate`/`availabilityDate`, `reported_unconfirmed` requires
`unconfirmedNote`.

## 10. Universe-contract and cohort validation

`lib/research-v7/universe-contract.ts` loads `final-universe.csv` and
`cohort-assignment.csv` from an explicitly supplied contract directory
(`--universe <path>` on every CLI command); no path under a user's home
directory or `local-artifacts/` is hardcoded into tracked source, and tests
validate against fixtures under `tests/research-v7/fixtures/`.
`checkUniverseContract` requires `candidateId` to exist in the universe;
`canonicalName`, `entityType`, and `assetType` to match unless the packet
carries a documented `nameAliasNote` / `entityTypeCorrectionNote` /
`assetTypeCorrectionNote`; `category` to match exactly (no override field);
and `cohort` to match the frozen assignment exactly, with no override field
at all, since cohort reassignment is never author-controlled.

## 11. Deterministic compilation

`lib/research-v7/compile.ts` (`compileBatch`). Validates every packet's
schema first, then runs every cross-packet integrity check, and only writes
output if the whole batch is error-free: one bad packet fails loudly and
produces zero files, never a partially valid corpus. Companies, people,
sources, evidence claims, and signal events are each sorted by id before
serialization, so repeated compilation of the same input (with the same
`now` timestamp) produces byte-identical JSON. An empty batch compiles
successfully to empty collections (`tests/research-v7/manifest-and-firewall.test.ts`,
"zero-research build case"): `npm run build` never requires real packets to
exist.

## 12. The v7 manifest

`lib/research-v7/manifest.ts`. `data/v7-generated/MANIFEST.v7.json`,
schema-distinct from and never written to the same path as the active
`data/generated/MANIFEST.json`. Records SHA-256 hashes, record counts, the
generator, and the batch label (`CALIBRATION` | `VALIDATION` | `FINAL_TEST` |
`SYNTHETIC`) for every generated file.

## 13. Generated objects

`data/v7-generated/{companies,people,sources,evidence-claims,signal-events}.v7.json`.
No `ScoreSnapshot`: no human Screening judgment exists yet, and the harness
does not fabricate an empty one to satisfy a shape. Metric records
(`digitalAssetMetrics`) are contextual and are proven, by
`tests/scoring/digital-asset/forbidden.test.ts` and the structural design of
`lib/schemas/v7/company.ts`, never to flow directly into any score.

## 14. Audit command

`lib/research-v7/audit.ts` (`buildAuditReport`), run via
`npm run research:v7:audit`. Reports packet/company/people/source/
evidence-claim/signal-event counts, unknown-gap count, source-class
distribution, independent vs. non-independent source counts, origin-chain
count, unresolved-reference count, duplicate-warning count,
`reported_unconfirmed` signal count, metric-record count, and
entityType/assetType/category/cohort distributions (cohort only when a
universe contract is supplied). Never reports investment scores, ranks, or
recommendations: none exist at this stage.

## 15. Commands

```
npm run research:v7:validate -- <packet-file-or-dir> [--universe <contract-dir>]
npm run research:v7:build    -- <packet-dir> --batch <BATCH> [--universe <contract-dir>] [--out <dir>]
npm run research:v7:audit    -- <packet-dir> [--universe <contract-dir>] [--out <report.json>]
```

Distinct from, and never overloading, the active `npm run research`. The
`--out` flag on `build` writes under the given root, never at the repository
root by default in a test run; the CLI writes real output only when a human
runs it against a real directory.

## 16. Promotion / activation boundary

This phase builds tooling only. Activation (switching the canonical
`SCHEMA_VERSION` to 7, wiring v7 into the active read/scoring path, producing
real research for the 44-entity universe) has not happened and is not
authorized by this document. `tests/scoring/digital-asset/firewall.test.ts`
extends its forbidden-import patterns to include `research-v7`, so no active
path (`app/**`, `lib/screening-read/**`, active `lib/scoring/*.ts`, active
`lib/research/**`, `scripts/research/**`, `lib/domain/manifest.ts`,
`lib/domain/ingest.ts`) may import this namespace.

## 17. Commands for later research batches

Once Phase 3B-0 is reviewed and Phase 3B-1 is authorized, a batch is
researched by: writing packets under `research/v7/input/`, running
`research:v7:validate` against the frozen universe/cohort contract,
resolving every ERROR, running `research:v7:build --batch CALIBRATION` (then
`VALIDATION`, then `FINAL_TEST`) once the batch is clean, and running
`research:v7:audit` to review the integrity report before the batch is
considered complete.

## 18. Phase 3B-0.1 strictness hardening

A follow-on hardening pass, before real research begins. No behavior change
to the active v6 application; three narrowly scoped fixes to the dormant
harness itself.

**Person / EvidenceClaim version safety.** `lib/schemas/person.ts` and
`lib/schemas/evidence-claim.ts` are genuinely version-neutral:
`schemaVersion` there is `z.number().int().positive()`, not a literal `6`,
and neither module reads the active `SCHEMA_VERSION` constant. Reuse is
retained rather than duplicating them under `lib/schemas/v7/`. But reuse
alone would let a packet author type `schemaVersion: 6` by mistake and have
it pass, since the shared schema accepts any positive integer. The packet
harness closes this: `packetPersonSchema` and `packetEvidenceClaimSchema`
(`lib/research-v7/packet-schema.ts`) each add a refinement requiring
`schemaVersion === 7`. A v7-generated corpus can never contain a Person or
EvidenceClaim claiming `schemaVersion` 6 merely because a shared,
version-neutral schema was reused. See
`tests/research-v7/version-safety.test.ts`.

**availabilityDate is required only for evidence-bearing sources.**
`checkSourceCutoff` (`lib/research-v7/integrity.ts`) no longer applies the
cutoff to every source in a packet; only to sources actually cited by an
admitted EvidenceClaim (`sourceId` or `supportingSourceIds`), SignalEvent
(`sourceId`), or digital-asset metric (`provenance.sourceIds`)
(`collectEvidenceBearingSourceIds`). A source kept only as a research lead or
gap, not yet cited by anything, may lack `availabilityDate`: it simply cannot
support a claim, event, or metric until one is established. The moment a
source is cited, it is fully subject to the cutoff. This is not a broad
bypass: there is no field or flag that exempts a cited source from the
cutoff, and `ingestedAt` (stamped only on generated `SignalEvent` output,
never author-supplied, never present on `SourceRecord` at all) can never
substitute for it. See `tests/research-v7/availability-strictness.test.ts`
for the full explicit proof (on-time, after-cutoff, publication/availability
distinction, missing-availability, ingestedAt non-substitution,
non-inference from publicationDate).

**eventStatus must be explicit for newly authored events.**
`signalEventV7Schema`'s `eventStatus.default("completed")` exists only so the
dormant `lib/domain/migrate-v6-v7.ts` adapter can normalize a v6 record's
shape (and that adapter now explicitly passes the v6 record's own
`eventStatus`, `unconfirmedNote`, `interpretationBasis`, and
`investmentInterpretation` through, rather than letting the v7 default
silently override them: a `reported_unconfirmed` v6 event must not become
`completed` merely because the adapter omitted the field). For a packet
authored directly against the v7 harness, `validatePacket`
(`lib/research-v7/validate.ts`) rejects any signal event whose raw input
omits the `eventStatus` key entirely, before the schema has a chance to
apply that default: the author must deliberately classify every event. This
runs as its own pre-parse scan
(`scanForMissingExplicitSignalEventFields` in `packet-schema.ts`), because
once zod applies a default the parsed output is indistinguishable from an
explicitly supplied value. See
`tests/research-v7/event-status-strictness.test.ts` and
`tests/domain/migrate-v6-v7.test.ts`.

**Explicit fixtures B, D, and M.** `tests/research-v7/fixture-b-d-m.test.ts`
names the token-protocol (`entityType: protocol`, `assetType: token`),
network (`entityType: network`), and unknown-applicability-related research
context cases explicitly, so they cannot disappear through incidental
coverage. `tests/research-v7/version-integrity.test.ts` proves, over a
richer synthetic batch, that every versioned generated record carries
`schemaVersion` 7, none carries `6`, no `ScoreSnapshot` or Screening judgment
exists, and the compiled corpus is built only from
`lib/schemas/v7/{company,signal-event}.ts` plus the version-neutral
`lib/schemas/{person,evidence-claim}.ts`, never the active v6 `Company` or
`SignalEvent` shapes.
