# Digital-Asset V7 Calibration (Phase 3C-2 / 3C-2.1 / 3C-2.2)

Authoritative reference for what Phase 3C-2, Phase 3C-2.1, and Phase 3C-2.2 authorized, built, measured, and froze. Cross-reference `docs/digital-asset-v7-judgment-protocol.md` (the judgment harness this phase's scorer consumes) and `docs/digital-asset-v7-research-methodology.md` (the domain model and scoring contract).

## 1. Status: CALIBRATION scoring is now authorized

Phase 3C-0/3C-1 built and froze the 15-entity CALIBRATION judgment corpus but explicitly did not build or run aggregate scoring ("aggregate scoring is a separate, later stage that this phase does not build", `docs/digital-asset-v7-judgment-protocol.md` section 11). Phase 3C-2 is the first phase authorized to reveal aggregate v7 Screening scoring outputs, and does so using only the frozen 15-company CALIBRATION research and judgment corpus. v7 remains dormant: nothing in this phase activates v7 in the live application or changes active v6 behavior.

## 2. What was built

- `lib/scoring/digital-asset/screening-aggregate.ts`: the aggregate Screening scorer (`scoreScreeningEntity`). Rolls each entity's 14 compiled `CriterionScoreInput` records up to 7 dimension scores and one overall Thesis Fit, reusing the exact renormalization algorithm already implemented and tested in `renormalizeDimension` (`lib/scoring/digital-asset/applicability.ts`), parameterized with one new optional argument (`baseWeights`, defaulted to the existing Underwriting weights so every existing call site and test is unaffected) so the same neutral-50-fill, same applicability-aware exclusion mechanics serve Screening's `DA_SCREENING_CRITERIA_WEIGHTS` (2 criteria per dimension) instead of only Underwriting's 39-criterion weights. No second scoring model was introduced.
- `scripts/judgments-v7/score.ts` / `npm run judgments:v7:score`: the CLI runner. Score and coverage come only from the frozen, already-validated `data/v7-analytical-inputs/entities.v7.json`. As of Phase 3C-2.1 it also reads (never writes) the frozen `judgments/v7/calibration/**` packets and `research/v7/input/**` packets, read-only, to resolve per-criterion confidence; this is a frozen, audited, git-committed batch, not an in-progress judgment session. Refuses to score a batch whose entities carry more than one distinct `researchBaselineCommit` or `methodologyConfigFingerprint`. Writes `data/v7-score-results/screening-scores.v7.json` and a manifest, both deterministic given a fixed `JUDGMENTS_V7_SCORE_RUN_AT` timestamp.
- `lib/scoring/digital-asset/evidence-confidence.ts` (Phase 3C-2.1): the narrow, v7-typed bridge from cited evidence to the domain-neutral confidence engine (`lib/scoring/confidence.ts`, reused unchanged). See section 6.
- `lib/judgments-v7/methodology-fingerprint.ts`: one additive export, `DA_CALIBRATION_CONFIG_FREEZE_FINGERPRINT`. Built on top of the existing `DA_METHODOLOGY_FINGERPRINT` plus `DA_EVIDENCE_SUFFICIENCY_PROVISIONAL`. It does not change `DA_METHODOLOGY_FINGERPRINT`'s own value, which every frozen CALIBRATION judgment packet is bound to; changing that value would retroactively invalidate all 15 frozen packets.
- `tests/scoring/digital-asset/screening-aggregate.test.ts`, `tests/scoring/digital-asset/evidence-confidence.test.ts`: focused tests for neutral-fill behavior, full-evidence behavior, the critical-dimension guard, determinism, and (Phase 3C-2.1) the ten confidence scenarios in section 6.

## 3. Calibration diagnostics methodology

For all 15 CALIBRATION entities: overall Thesis Fit, overall evidence coverage, per-dimension score/coverage, per-criterion positive/zero-coverage counts and anchor/final-score distributions, coverage-vs-deviation-from-neutral relationship, critical-dimension guard pass/fail with a criterion-level mechanical check (not just a coverage-number check), evidence-sufficiency threshold pass/fail (diagnostic only; the thresholds remain `active: false`), and a structural signal/event double-count and decay-leak check. Full detail and data in `local-artifacts/phase3c2-calibration/` (not tracked in git per this project's local-artifact policy): `initial-aggregate-reveal.{json,md}`, `calibration-score-table.csv`, `distribution-diagnostics.md`, `coverage-attenuation-diagnostics.md`, `critical-dimension-review.md`, `evidence-sufficiency-review.md`, `signal-firewall-review.md`, `proposed-calibration-changes.md`, `sensitivity-review.md`, `final-calibration-decision.md`, `final-calibration-results.{json,md}`, `calibration-config-freeze.txt`, `deterministic-score-proof.txt`, `input-freeze-before-scoring.txt`.

As of Phase 3C-2.1, confidence is implemented (section 6 below); as of Phase 3C-2 it was reported `NOT_IMPLEMENTED`. Rank eligibility is reported as `NOT_ASSESSED` throughout: it structurally requires mandate eligibility (`lib/scoring/digital-asset/mandate.ts`), and every CALIBRATION judgment packet's `mandateStatus` is literal-locked to `NOT_ASSESSED`. It is never fabricated to produce a display value or a ranking.

## 4. Exact elements changed or explicitly left unchanged

Changed (infrastructure, not calibration values):

- Added the aggregate scorer, its CLI runner, the additive calibration-config-freeze fingerprint, and its tests, all listed in section 2.
- `renormalizeDimension` gained one optional, default-preserving parameter. Behavior for every existing (Underwriting) caller is unchanged; verified by the pre-existing `tests/scoring/digital-asset/applicability.test.ts` passing unmodified.

Explicitly left unchanged, after review (see `local-artifacts/phase3c2-calibration/proposed-calibration-changes.md` and `final-calibration-decision.md`):

- Critical-dimension zero-only guard (`DA_CRITICAL_DIMENSION_EVIDENCE_GUARD`): 12/15 CALIBRATION entities fail it. Verified as genuine zero-coverage evidence on both criteria of the failing dimension, not a mapping or lookup defect. No change.
- Evidence-sufficiency thresholds (`DA_EVIDENCE_SUFFICIENCY_PROVISIONAL`, still `active: false`): all 15 entities fail `minOverallCoverage = 0.5`. Lowering it was proposed, reviewed under a bounded sensitivity analysis (no cliff/discontinuity found across 0.15-0.5), and rejected as overfitting to this specific 15-company sample rather than correcting a demonstrated defect. No change.
- Screening/Underwriting criterion weights, Thesis Fit dimension weights: no CALIBRATION diagnostic demonstrated a defect in any of them. No change.
- Signal/event firewall: confirmed structural (no signal-contribution channel exists in the Screening scoring path at all), not merely untested. No change (nothing to change).

Never touched, per the calibration change policy: the 14 criterion definitions, the 7 dimension definitions, criterion/category taxonomy, the `rawAnchor` scale, the frozen human judgments, the frozen research/evidence, and cohort assignments.

## 5. Final frozen scoring/config rules

| element | final value | status |
|---|---|---|
| Screening criterion weights | 0.5 / 0.5 per dimension (`DA_SCREENING_CRITERIA_WEIGHTS`) | provisional, unchanged |
| Thesis Fit dimension weights | `DA_THESIS_FIT_DIMENSION_WEIGHTS` (v6-inherited) | unchanged |
| Critical-dimension guard | zero-only, `capital_efficiency` + `growth_momentum`, coverage > 0 | provisional, unchanged |
| Evidence-sufficiency thresholds | `minOverallCoverage=0.5` (Phase 3C-2.2: reverted from the Phase 3C-2.1 value of 0.35, which rested on incorrect algebra; see section 7), `dimensionCoverageFloor=0.5`, `minDimensionsAtFloor=4`, `minOverallConfidence=0.6` (evaluable since Phase 3C-2.1, unchanged) | provisional, inactive |
| Blocking-conflict veto | not present; not fabricated | see section 7 |
| Forbidden automatic-positive registry | `DA_FORBIDDEN_AUTOMATIC_POSITIVE` (13 entries) | unchanged |

`V7_CALIBRATION_CONFIG_FREEZE_SHA256 = sha256:ac21028eb04722ce8bea6d14107435df0963da90259db041a69a6dc24f44b96f` (Phase 3C-2.2; supersedes the Phase 3C-2.1 value `sha256:b537ce425dd095b3c13d665a7d59d5daa5272316a29fd7510a1f1e87d19869ba`, itself superseding the Phase 3C-2 value `sha256:c63853346e21aa2a0b82251951bfc51cd2958eb770f99c27e368184083e864be`; `DA_CALIBRATION_CONFIG_FREEZE_FINGERPRINT`, `lib/judgments-v7/methodology-fingerprint.ts`). This binds later VALIDATION and FINAL_TEST scoring.

## 6. Evidence confidence and sufficiency finalization (Phase 3C-2.1)

Confidence is now implemented. `lib/scoring/digital-asset/evidence-confidence.ts` computes a deterministic per-criterion confidence scalar (0-1) from the frozen judgment packet's `citedEvidenceClaimIds` and `acknowledgedContradictionIds`, resolved against the frozen research packet's `EvidenceClaim`/`SourceRecordV7` graph. It is never analyst-entered and never derived from `rawAnchor`, Thesis Fit, or any company-attractiveness signal.

Conceptually: each cited claim's source is mapped to one of the 9 existing, domain-neutral reliability classes in `lib/scoring/confidence.ts` (`RELIABILITY_CLASS`), reusing that engine's math completely unchanged (origin dedup so repeated voices never compound, probabilistic combination across genuinely independent origins, a ceiling from the strongest class present, a discount for an acknowledged material contradiction). The 7 digital-asset-only source classes are mapped to the nearest existing class by the class's own base value and the source class's own `reliabilityPrior`/`isIndependent` (already encoded in `lib/schemas/v7/source-record.ts`, not invented). No freshness decay is applied yet (documented as a `ponytail:` simplification in the adapter). Dimension-level and overall confidence are coverage-weighted averages of criterion confidence, mirroring `lib/scoring/dimension.ts` and `lib/scoring/thesis-fit.ts` exactly.

Distinct from coverage by construction: zero coverage always yields zero confidence contribution (no fabrication), but confidence and coverage are computed from different inputs and do not imply each other. In the CALIBRATION cohort, confidence runs moderate-to-high (mean 0.74) while coverage stays low (mean 0.22): where evidence exists it is generally reliable, but the 14-criterion rubric is only lightly covered.

`minOverallConfidence=0.6` was reviewed in Phase 3C-2.1 and left unchanged: 11/15 entities already clear it once confidence is computed, and no structural issue was found. Full Phase 3C-2.1 audit trail in `local-artifacts/phase3c2-calibration/confidence-sufficiency-audit/`. `minOverallCoverage` went through a further correction in Phase 3C-2.2; see section 7.

## 7. Overall-coverage threshold, breadth-rule proof, and blocking-conflict semantics (Phase 3C-2.2)

**Breadth-rule semantics.** The implemented dimension-breadth check (`lib/scoring/digital-asset/screening-aggregate.ts`, `dimensionsAtCoverageFloor`/`dimensionBreadthPass`) counts how many of the 7 dimensions individually clear `dimensionCoverageFloor`, with no dimension-identity constraint: it is "ANY `minDimensionsAtFloor` of 7 dimensions at the floor," never a fixed set of four named dimensions.

**Why `minOverallCoverage` was reverted to 0.5.** Phase 3C-2.1 set `minOverallCoverage=0.35`, reasoning that the breadth rule's own bare minimum could only imply an overall coverage up to `(0.2+0.2+0.15+0.15) x 0.5 = 0.35` using the four highest-weighted dimensions. That reasoning was incorrect: because the breadth rule accepts ANY four dimensions, not specifically the four heaviest, the value it actually GUARANTEES is the MINIMUM over all `C(7,4)=35` four-dimension weight combinations, which is `(0.15+0.10+0.10+0.10) x 0.5 = 0.225`, not 0.35 (full enumeration in `local-artifacts/phase3c2-calibration/final-gate-proof/breadth-algebra-proof.md`). Once that error is corrected, `minOverallCoverage` is also re-classified: it is an independent, uncalibrated global evidence bar (breadth measures how many angles have any evidence; overall coverage measures weighted depth; neither document states they must be numerically coherent), so it is not required to equal any value the breadth rule implies at all. With the coherence rationale withdrawn and no other justification for 0.35 on record, the value reverts to its originally-authored placeholder, 0.5. This was decided from configuration semantics alone, before re-running the scorer; the resulting company pass/fail counts were not used to choose it.

**Blocking-conflict semantics.** No tracked v7 methodology document, config file, or scorer input type requires, defines, or evaluates a blocking-conflict veto for Screening evidence sufficiency (audited in `local-artifacts/phase3c2-calibration/final-gate-proof/blocking-conflict-audit.md`). `EvidenceClaim.contradicts`/`contradictedBy` and the judgment packet's `acknowledgedContradictionIds` exist and are real, but carry no materiality classification distinguishing an ordinary contradiction from one severe enough to block sufficiency; v6's analogous `BlockingConflict.severity` field was deliberately not carried into the v7 research/judgment schema. The frozen final state: contradictions affect evidence CONFIDENCE only (the Phase 3C-2.1 discount), no separate blocking-conflict veto is active anywhere in v7 Screening evidence sufficiency, and none is fabricated. A future version may add an explicit, structured materiality designation for evidence collected under that later methodology, never retrofitted onto the frozen CALIBRATION corpus.

**Config-freeze fingerprint completeness.** `DA_CALIBRATION_CONFIG_FREEZE_FINGERPRINT` (`lib/judgments-v7/methodology-fingerprint.ts`) now also covers the v7 confidence-computation path: the confidence adapter's own mapping tables (`DA_SOURCE_TYPE_RELIABILITY_CLASS`, `DA_COMPANY_ORIGIN_SOURCE_TYPES_ARRAY`, `lib/scoring/digital-asset/evidence-confidence.ts`) and the domain-neutral confidence-math registries they depend on (`RELIABILITY_CLASS`, `CONTRADICTION_FACTOR`, `DERIVED_CONFIDENCE_FACTOR`, `lib/scoring/config.ts`). Proven complete by 7 synthetic mutation tests (`tests/judgments-v7/config-freeze-fingerprint.test.ts`, no canonical file mutated): a changed `minOverallCoverage`, `minOverallConfidence`, dimension weight, confidence-adapter mapping, confidence-math registry value, or critical-dimension guard rule each independently changes the fingerprint.

**Holdout freeze rule (restated, unchanged in substance since Phase 3C-2):** this is the last point at which CALIBRATION outcomes may inform scoring, confidence, coverage, dimension-weight, critical-guard, or evidence-sufficiency tuning. VALIDATION may test the frozen system; it may not tune it. A fundamental defect discovered later must be handled by explicit invalidation/restart, never by quiet re-tuning against holdout results.

## 8. One-way calibration freeze

This was the last phase authorized to use CALIBRATION aggregate outcomes to tune v7 Screening scoring rules. Once VALIDATION research begins, no further tuning based on VALIDATION (or FINAL_TEST) performance is permitted under any circumstance. If a fundamental defect is discovered after this point, the correct response is to explicitly invalidate and restart the experiment, never to quietly re-tune a threshold or weight against holdout results.

## 9. v7 remains dormant

Nothing in this phase activates v7 in the application, changes `SCHEMA_VERSION` (still 6), changes the active v6 configHash, generated corpus, Screening assessments/behavior, or frontend, or writes to `data/generated/` or `data/analytical-inputs/`. All new dormant output lives under `data/v7-score-results/`, separate from both `data/v7-analytical-inputs/` (the judgment-compiled input this phase's scorer reads) and every active v6 path.
