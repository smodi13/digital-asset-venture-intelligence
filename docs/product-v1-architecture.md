# Product v1 architecture (Phase 4A + 4B + 4C)

Phase 4A productizes the completed v7 digital-asset Screening evaluation into a
usable investment product. Phase 4B extends the same read model and UI
conventions with Signal Engine, Source Intelligence, and a v7-accurate
Methodology page. Phase 4C completes the planned core module set with Market
Map, Follow-On Radar, and Relationship Intelligence. None of the three phases
reopens calibration, validation, or FINAL_TEST methodology work, or touches
the frozen research or judgment packets.

## Product data read model

`lib/digital-asset-product/` is the one sanctioned read layer for the product
frontend:

| Function | Returns |
| --- | --- |
| `listCompanies()` | All 44 companies, sorted alphabetically |
| `getCompanyBySlug(slug)` | One company's full analytical detail, or `null` |
| `getCompanyDirectory()` | Lightweight directory for navigation/search |
| `getSourcingWorklist()` | Worklist rows in default alphabetical order |
| `getPartnerHomeData()` | Editorial aggregates for the Partner Home page |
| `getReadModelMeta()` | Corpus generation timestamp and counts |
| `getSignalIntelligence()` (Phase 4B) | Every signal event, flattened with its company binding, most-recent-first |
| `getSourceIntelligence()` (Phase 4B) | Every cited source, flattened with its company binding, ordered by availability date |
| `getMarketMap()` (Phase 4C) | The 44 companies grouped into the 11 canonical categories (schema order, every category present even when empty), each with composition and coverage metadata |
| `getPeopleDirectory()` (Phase 4C) | Every person record, flattened with its company binding, alphabetical by name |
| `getRelationshipIntelligence()` (Phase 4C) | `getPeopleDirectory()` plus deterministic repeat-connection detection (a normalized person name recorded against more than one researched company) |

It reads only the committed, generated
`data/v7-product/companies.v7.json` (`node:fs`, server-only). No scoring
formula, YAML parsing, or file I/O happens in a React component.

## Deterministic generation path

```
research/v7/input/**              (44 frozen research packets, read-only)
judgments/v7/{calibration,validation,final_test}/**  (44 frozen judgment packets, read-only)
        |
        v
scripts/product/build-corpus.ts    (this phase's builder - orchestration only)
  compileJudgmentBatch()  (lib/judgments-v7/compile.ts, unchanged)
  scoreScreeningEntity()  (lib/scoring/digital-asset/screening-aggregate.ts, unchanged)
  computeCriterionConfidence()  (lib/scoring/digital-asset/evidence-confidence.ts, unchanged)
        |
        v
data/v7-product/companies.v7.json  (tracked, deterministic product corpus)
        |
        v
lib/digital-asset-product/         (typed read layer)
        |
        v
app/ (Partner Home, Sourcing Worklist, Company Detail)
```

`npm run product:build` regenerates the corpus. It is a pure function of the
frozen inputs plus the unchanged scoring engine: same inputs, same output byte
for byte (`tests/product/build-determinism.test.ts` pins this by running the
real script twice into isolated output directories).

The builder compiles all three cohort directories (`calibration`,
`validation`, `final_test`) with the existing, unmodified
`compileJudgmentBatch` pipeline and merges the results into one 44-company
corpus. Cohort membership survives on `ProductCompany.cohort` as audit/
methodology metadata only - it is never used to filter, order, or label the
primary product UI, and no navigable surface groups companies by cohort.

The builder never writes to `research/v7/input`, `judgments/v7`,
`data/v7-analytical-inputs`, or `data/v7-score-results` (guarded by
`tests/product/freeze-safety.test.ts`). It also never writes into
`data/generated/`: that directory is the active v6 corpus's firewall zone and
explicitly bans the scoring fields (`thesisFit`, etc.) the v7 product corpus
carries by design, so the product corpus lives at its own path,
`data/v7-product/`, alongside the existing `v7-analytical-inputs` and
`v7-score-results` siblings.

## Runtime source of truth

`data/v7-product/companies.v7.json` (tracked JSON) is the runtime source of
truth for the frontend. It is committed, so a clean clone works with no
regeneration step, matching the existing v7 pipeline's reproducibility
contract.

## Preserved analytical semantics

Every distinction the frozen scoring engine produces survives into the
product read model, undegraded:

- Thesis Fit, overall evidence coverage, overall evidence confidence - three
  separate values, never merged.
- Display state (`PROVISIONAL` / `INSUFFICIENT_EVIDENCE`) - an
  evidence-sufficiency reading, never an investment recommendation.
- `mandateStatus` and `rankEligibility` - both always `NOT_ASSESSED`, never
  defaulted to eligible and never fabricated.
- Seven dimension results and 14 criterion results per company, each with
  applicability, raw anchor, coverage, confidence, rationale, cited evidence,
  and evidence-gap notes.
- Evidence gaps (critical-dimension gaps, missing/thin dimensions, criterion
  gap notes, unresolved contradictions, open research questions) and a single
  `majorEvidenceGap` string for compact display.
- Signal events with `eventStatus` (`completed` vs `reported_unconfirmed`)
  carried verbatim - never silently converted to a confirmed fact.
- Source provenance (publisher, type, tier, independence, support role,
  availability date, and per-company claim count) and people/founder
  records.

## UI architecture

| Route | Page | Reads |
| --- | --- | --- |
| `/` | Partner Home | `getPartnerHomeData()` |
| `/worklist` | Sourcing Worklist | `getSourcingWorklist()` |
| `/signals` (Phase 4B) | Signal Engine | `getSignalIntelligence()` |
| `/sources` (Phase 4B) | Source Intelligence | `getSourceIntelligence()` |
| `/market-map` (Phase 4C) | Market Map | `getMarketMap()` |
| `/radar` (Phase 4C) | Follow-On Radar | `getSourcingWorklist()` (filtered client-side to local radar membership) |
| `/relationships` (Phase 4C) | Relationship Intelligence | `getRelationshipIntelligence()` |
| `/companies` | A-Z company directory | `getSourcingWorklist()` |
| `/companies/[id]` | Company Detail | `getCompanyBySlug()` |
| `/methodology` | v7 methodology (Phase 4B rewrite) | `getReadModelMeta()`, `lib/scoring/digital-asset/*` config |

`components/AppShell.tsx`, `components/PageHero.tsx`, and
`components/Reveal.tsx` are the shared shell, page header, and entrance-motion
primitives, reused from the existing design system rather than rebuilt.
`components/NavLinks.tsx` now lists all nine active modules (Partner Home,
Sourcing Worklist, Signal Engine, Source Intelligence, Market Map, Follow-On
Radar, Relationship Intelligence, Companies, Methodology) - the Phase 4B
"Coming later" placeholder list is gone now that every planned core module is
built. The horizontal mobile nav row uses `overflow-x-auto` with `shrink-0
whitespace-nowrap` list items so the longer label list scrolls instead of
wrapping or clipping; the vertical desktop sidebar accommodates the same nine
items as a plain list with no further restructuring needed.

### Signal Engine and Source Intelligence read path (Phase 4B)

Both routes flatten the existing per-company `signalEvents` / `sources`
arrays already on `ProductCompany` - no new corpus concept, no new frozen
input read. `scripts/product/build-corpus.ts` was extended (not replaced) to
carry three fields the v7 schemas already produced but the product read
model previously dropped: `ProductSignalEvent.subjectType`, and on
`ProductSource`: `availabilityDate`, `supportRole`, `claimCount`, and
`linkedCriteriaIds` (the last two computed deterministically from each
company's own cited claims, never fabricated).

`getSignalIntelligence()` and `getSourceIntelligence()` (in
`lib/digital-asset-product/index.ts`) bind each row to its company
(`entityId`, `candidateId`, `slug`, `companyName`, `category`) so
`components/signals/SignalEngineView.tsx` and
`components/sources/SourceIntelligenceView.tsx` can link every row back to
`/companies/[slug]` without a second lookup. Signal Engine's default order is
most-recent-first by event date, split into "Recent" (within 180 days) and
"Older" sections - explicitly chronological, never a ranking. Source
Intelligence orders by availability date then title - a provenance-neutral
order, never a reliability ranking.

Cross-linking is bidirectional: Company Detail's Signals and Sources
sections link out to `/signals` and `/sources`, and Partner Home's "Recent
signals" section links to `/signals`.

`components/ui.tsx` gained `ProductDisplayStateBadge` for the v7
`PROVISIONAL` / `INSUFFICIENT_EVIDENCE` vocabulary, alongside the existing
`DisplayStateBadge` (v6 `SCREENED` / `INSUFFICIENT_EVIDENCE`) which the legacy
`/companies/[id]/brief` and `/companies/[id]/export/evidence` export routes
still use unmodified.

The legacy v6 candidate-discovery Sourcing feature
(`components/sourcing/SourcingView.tsx`, `app/sourcing/page.tsx`) is no
longer in primary navigation (it targeted the old AI-company product's RSS
matching against the 39-company v6 corpus) but is left in place rather than
deleted, since removing a working feature is outside this phase's scope.

### Market Map, Follow-On Radar, and Relationship Intelligence (Phase 4C)

**Market Map** (`/market-map`, `components/market-map/MarketMapView.tsx`)
groups the 44 companies into the 11 canonical `DigitalAssetCategory` values in
schema order (`DIGITAL_ASSET_CATEGORIES`), never by company count - a
count-descending order would read as a market-importance ranking. Every
category renders even when empty, plus an "uncategorized" lane for the rare
company with no assigned category. Composition metadata (entity/asset type
counts, lifecycle counts, provisional/insufficient-evidence counts, average
coverage) is computed on read from existing per-company fields; nothing about
market size is asserted or estimated. Client-side filters (category, entity
type, asset type, lifecycle, display state, institutional orientation) narrow
the same dataset; the page is fully readable with no filter applied.

**Follow-On Radar** (`/radar`, `components/radar/`) is a user-controlled
monitoring list, not a portfolio record. `lib/radar/storage.ts` holds pure
functions (`parseRadarIds`, `serializeRadarIds`, `addRadarId`, `removeRadarId`)
over a plain string array of `entityId`s, unit-tested without a DOM. The
`useRadar()` hook (`components/radar/useRadar.ts`) wraps browser
`localStorage` (key `dvi:radar:v1`) via `useSyncExternalStore`, so every
mounted `RadarButton` and the Radar page itself stay in sync within a tab; a
missing or malformed stored value is always treated as an empty radar, never
a fabricated default holding. `RadarButton` (Company Detail, Companies,
Sourcing Worklist) toggles membership; `RadarView` renders the populated list
with deterministic, existing-fact-only attention labels (`Recent Signal`,
`Evidence Gap`, `Insufficient Evidence`, `Provisional Evidence`) and a stated
default order (recent signals, then evidence gaps, then alphabetical) - never
a composite score or an investment ranking. There is no server and no
database; radar membership never leaves the browser.

**Relationship Intelligence** (`/relationships`,
`components/relationships/RelationshipIntelligenceView.tsx`) reads
`getRelationshipIntelligence()`, which flattens each company's existing
`ProductPerson[]` (no new frozen input, no schema change) into a person-to-
company directory and computes "repeat connections": people whose normalized
name is recorded against more than one researched company's people records.
In the current 44-company corpus this returns zero repeat connections and the
page states that plainly, rather than fabricating a relationship graph. No
web browsing, no inference, and no `priorCompanies` (free-text, unresearched
employers) contributes to a repeat-connection match. Filters (search,
category, founder/non-founder) and a dense table (desktop) / card list
(mobile) keep the page readable without a force-directed graph.

Cross-linking added in this phase: Company Detail's Category field links to
`/market-map`; its People section links to `/relationships`; its header
carries a `RadarButton`. Partner Home gained an "Explore" section linking to
all three new routes and a `PartnerHomeRadarSummary` client component that
renders only when the local radar is non-empty (never a placeholder implying
holdings exist).

## Module roadmap

Built in Phase 4A: foundation (read model + generation pipeline), Partner
Home, Sourcing Worklist, Company Detail.

Built in Phase 4B: Signal Engine, Source Intelligence, the v7 Methodology
rewrite, targeted Company Detail cross-linking, and mobile/responsive fixes
(the horizontal nav overflow above).

Built in Phase 4C: Market Map, Follow-On Radar, Relationship Intelligence,
and the cross-module integration described above. This completes the planned
core product module set.

## Phase 4D: release candidate polish

Phase 4D is public-repository presentation, copy, metadata, and QA polish. It
made no changes to the read model, the generation pipeline, or any route
list above. See `docs/release-candidate.md` for its scope and QA status.

## Remaining known gaps

- The v6 Screening Brief / Evidence CSV export routes are untouched and still
  read the old 39-company v6 corpus; a future phase should either retire them
  or build v7 equivalents.
- Evidence-sufficiency thresholds for v7 (`DA_EVIDENCE_SUFFICIENCY_PROVISIONAL`)
  remain uncalibrated and inactive by design; `displayState` is computed
  mechanically from them today and is not itself a calibration claim.
- Relationship Intelligence's repeat-connection detection is name-based
  within the current corpus; it will need re-verification if a future corpus
  update introduces genuine cross-company person overlap.
