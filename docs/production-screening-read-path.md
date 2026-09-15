# Production Screening Analytical Read Path (Phase 6D-B)

The sanctioned, production-safe way to obtain deterministic Screening analytics
for the 39-company corpus. This is the data contract the Phase 6D-C frontend
consumes. It builds no UI and changes no scoring semantics.

## Calculation flow

```
data/generated/*.json            (canonical research corpus, schema v6)
data/analytical-inputs/
  screening-assessments.json      (sanctioned human Screening inputs, tracked)
        |
        v
lib/scoring/*                     (existing calibrated, tested engine - UNCHANGED)
  evidence-adapter -> scoreScreeningCriterion
  -> scoreScreeningDimension -> scoreScreeningThesisFit
  -> screeningDisplayState / evaluateScreeningEvidenceEligibility
        |
        v
lib/screening-read/index.ts       (this read path - orchestration only, no formulas)
  getScreeningWorklist()
  getCompanyScreeningDetail(companyId)
  getScreeningReadModelMeta()
        |
        v
future Worklist / Company Detail frontend
```

There is exactly one calculation path. `lib/screening-read` contains no
threshold, weight, anchor, half-life, or scoring formula. It calls the same
deterministic modules that were calibrated and final-test validated in Phase 5C
and reproduced in Phase 6C.

## Input ownership

`data/analytical-inputs/screening-assessments.json` is the canonical production
store of human Screening judgment: per company, per Screening criterion, a raw
rubric anchor, discrete evidence coverage, cited `EvidenceClaim` ids,
reviewed-but-excluded claim ids, and a rationale.

- **Owned by** the Digital Asset Venture Intelligence analyst methodology.
- **Regenerated only** by `scripts/analytical-inputs/build-screening-assessments.ts`
  from the three frozen Phase 5C judgment packets. The build reconciles exactly:
  39 unique companies, 546 criterion assessments, 14 per company, every claim id
  resolvable, no duplicate company/criterion pair, `rawAnchor` / `coverage` /
  claim references / rationale copied verbatim.
- **Cohort labels are deliberately absent.** Calibration / validation /
  final-test split membership is methodology and audit metadata, not company
  analytical state, and never enters the production input or read model.
- It is **analytical input, not canonical research.** It does not alter the
  research corpus counts or semantics.

The committed JSON is the runtime source of truth. The Phase 5C packets are
git-ignored local audit artifacts and are not required at runtime, for tests, or
for a build.

## Mandate handling

Phase 6C hard-coded `mandateEligibility = ELIGIBLE` for diagnostics only. That
assumption does **not** enter production.

- The 39 companies have no independent production Mandate Eligibility.
- The read model reports `mandateStatus = "NOT_ASSESSED"` for every company.
- It is never inferred, never defaulted to `ELIGIBLE`, never derived from a
  diagnostic assumption, and the canonical `MandateEligibility` enum is
  unchanged.

## Evidence-sufficiency semantics

`evaluateScreeningEvidenceEligibility` requires a Mandate Eligibility value.
Because production mandate status is unknown:

- The read model emits `screeningEvidenceEligibility = null` (unresolved) and a
  note explaining it stays null until a real mandate assessment exists.
- The underlying **non-mandate evidence-bar mechanics** are exposed separately
  in `evidenceBar`. They come from an explicit deterministic helper,
  `evaluateScreeningEvidenceBarPreconditions` (in `lib/scoring/screening-eligibility.ts`),
  which owns exactly those mechanics and reads the calibrated thresholds from
  config. The read layer calls this helper directly: no mandate value, real or
  synthetic, is constructed anywhere in the production read path.
- `evaluateScreeningEvidenceEligibility` is unchanged in observable behavior. It
  now *composes* the Mandate Eligibility requirement with that same helper, so
  there is one authoritative source for the non-mandate thresholds and no
  duplication. The full evaluator still fails on mandate whenever mandate is not
  `ELIGIBLE`.
- `evidenceBar` exposes each calibrated precondition:
  overall coverage `>= 0.50`, overall confidence `>= 0.60`, at least 4 of 7
  dimensions with coverage `>= 0.50`, `capital_efficiency` and `growth_momentum`
  coverage `> 0` (zero-only guard, **no 0.30 floor**), no material blocking
  conflict, display state `SCREENED`, plus `nonMandateEvidenceBarPass` and the
  verbatim `failedPreconditions` list.

Display sufficiency is preserved exactly: `INSUFFICIENT_EVIDENCE` when overall
coverage `< 0.30` or fewer than 2 of 7 dimensions reach `0.40` coverage,
otherwise `SCREENED`. `SCREENED` is not "recommended", "evidence eligible", or
"mandate eligible".

## Fit precision

Internal calculations stay full precision. The read layer exposes full
numerical precision (`screeningThesisFit`, coverage, confidence) for
deterministic APIs. No Fit bands, no rounding in the engine, no quality label.
The future UI rounds Fit for presentation.

## Evidence gaps

Derived deterministically from existing analytical state: critical-dimension
gaps (with a `blocksEvidenceBar` flag for zero coverage), missing dimensions,
thin dimensions (below the `0.50` bar floor), criterion coverage gaps
(zero-coverage or neutral-prior fill), unresolved conflicts (cited claims with
`contradicts` / `contradictedBy` and no `contradictionNote`), reviewed-but-
excluded evidence, and concrete research questions. The worklist row carries the
single most material gap as a short string. Gaps answer "what information is
missing or weak?" - never a priority score, an investment priority, or a
recommended company.

## Provenance path

Screening result -> dimension -> criterion -> `EvidenceClaim` -> `SourceRecord`.
Every criterion result carries hydrated `ClaimRef`s (id, text, topic,
provenance, dates, source ids, contradiction fields, diligence question). The
company detail carries de-duplicated `citedClaims` and `citedSources`
(`SourceRef`: id, publisher, title, url, type, published date, `originatesFrom`).
Raw article bodies and `verbatimExcerpt` are not exposed. No local paths.

## Diagnostic firewall

`lib/screening-read` and `app/` must not import
`scripts/diagnostics/phase6c-diagnostics` and must not consume
`docs/phase6c-descriptive-diagnostics.data.json`. Enforced by
`tests/screening-read/firewall.test.ts`. The Phase 6C diagnostic outputs are
used only as a regression oracle inside `tests/screening-read/read-model.test.ts`
(the committed JSON is tracked, so this is reproducible in a clean clone).

## No ScoreSnapshot persistence

Persisted `ScoreSnapshot` count remains **0**. `data/generated/snapshots.json`
is untouched. The read path computes Screening analytics on every read from
canonical research plus the sanctioned assessment inputs. The only in-process
state is memoisation of the immutable committed input files; nothing computed is
cached, and `__resetScreeningReadCache()` clears it for tests. No Momentum or
Convergence state is computed or persisted.

## Frontend contract

`lib/screening-read/types.ts`:

- `ScreeningWorklistRow` - identity, `analyticalMode`, display state, Fit,
  Coverage, Confidence, `evidenceBar` mechanics, `mandateStatus`,
  `screeningEvidenceEligibility` (null), `majorEvidenceGap`, `sourceCount`,
  `recentSignal`.
- `CompanyScreeningDetail` - full Screening summary, 7 dimensions, 14 criteria
  (anchor, coverage, adjusted score, confidence, neutral-fill flag, supporting
  and reviewed-but-excluded claim refs, rationale, contradiction), evidence
  gaps, `citedClaims` / `citedSources`, canonical `signalEvents`.
- `ScreeningReadModelMeta` - as-of date, dataset version, corpus timestamp,
  `persistedScoreSnapshots: 0`, counts.

Worklist ordering is canonical company id ascending - a deterministic neutral
order. The read layer never performance-ranks companies and never sorts by Fit,
Coverage, Confidence, Momentum, or Convergence. No Priority. No ranking. No
Underwriting result. Momentum and Convergence are not exposed through this
contract; `SignalEvent`s are exposed as canonical dated facts only.

`recentSignal` on the worklist row summarises the company's most recent
`SignalEvent` (date, type, direction) and carries its canonical
`eventStatus` (`completed` | `reported_unconfirmed`) verbatim. This is not a
signal score. It lets the frontend label a reported-but-unconfirmed event
honestly instead of presenting it as an established fact. `reported_unconfirmed`
events are never converted to `completed` and never dropped. `signalEvents` on
the company detail carry the same `eventStatus`.

## Server-only

`lib/screening-read` reads files with `node:fs`. Use it from server components,
route handlers, server actions, and scripts only. Importing it into a client
component fails the build, which is the intended guard; no route handler is
added in this phase (it would be architectural ceremony - Phase 6D-C wires the
surfaces).

## Clean-clone reproducibility

A fresh clone contains the committed corpus (`data/generated/`), the committed
analytical inputs (`data/analytical-inputs/screening-assessments.json`), and the
committed Phase 6C oracle (`docs/phase6c-descriptive-diagnostics.data.json`).
`npm ci && npm test && npm run build` and the Screening read model all work with
no `~/Downloads` file, no git-ignored Phase 5C artifact, no absolute path, no
Graphify output, no QMD database, no Claude session data.

## Known limitations

- No independent Mandate Eligibility for the 39 companies, so full Screening
  evidence eligibility is unresolved.
- The 39 companies were consumed by Phase 5C calibration / validation /
  final-test; Screening outputs are descriptive, not a performance claim.
- `SignalEvent.evidenceIds` is empty corpus-wide; cross-layer proposition
  de-duplication is not possible yet (and Momentum / Convergence are not
  productionised regardless).
- No sourcing, no Priority, no ranking, no Underwriting entry - out of scope
  for this phase.
