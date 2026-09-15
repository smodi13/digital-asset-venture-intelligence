# Phase 6C: Real-Corpus Descriptive Diagnostics and Temporal Signal Firewall Review

Status: DESCRIPTIVE_DIAGNOSTIC_ONLY. Not calibration, not validation, not a
final test, not ranking, not Priority.

Runner: `scripts/diagnostics/phase6c-diagnostics.ts` (marked
`DESCRIPTIVE_DIAGNOSTIC_ONLY`, never imported by production app code).
Machine-readable output: `docs/phase6c-descriptive-diagnostics.data.json`.

## 0. Methodological caveat (read first)

The 39 companies in the corpus have been consumed by the Screening
calibration, validation, and final-test cohorts. For Phase 6C they are used
**only** for descriptive diagnostics, distribution inspection, plumbing tests,
double-count detection, hypothesis generation, and failure-mode discovery.

Nothing in this report may be used to justify: new thresholds, new weights,
new half-lives, new Priority rules, Fit cutoffs, Fit bands presented as
validated, or any investment recommendation. Proper calibration of any
parameter requires a new dataset and independent human labels.

No `ScoreSnapshot` is persisted. No production scoring behavior, threshold,
weight, half-life, or gate was changed. Companies are listed in canonical
(company id) order and are never ranked.

## 1. Baseline

| Check | Expected | Observed |
|---|---|---|
| HEAD | `274d971` | `274d971` (clean, `main` tracks `origin/main`) |
| companies | 39 | 39 |
| sources | 222 | 222 |
| EvidenceClaims | 510 | 510 |
| Person records | 84 | 84 |
| SignalEvents | 113 | 113 |
| persisted snapshots | 0 | 0 |
| research schema version | 6 | 6 |
| tests before 6C | 749 passing | 749 passing |
| Screening evidence-sufficiency state | `CALIBRATED_ACTIVE_FINAL_TEST_VALIDATED` | confirmed |
| conventional ranking / Priority / production Momentum / production Convergence / automated Underwriting entry | inactive | inactive |

Scoring as-of date for the whole phase: **2026-09-08**.

## 2. Judgment-packet reconciliation

Three locked Phase 5C human judgment packets (local audit artifacts,
git-ignored by design, not altered or regenerated):

| Cohort | File | Companies | Criterion judgments |
|---|---|---|---|
| calibration | `originationiq_phase5c_c_screening_calibration_v2.json` | 10 | 140 |
| validation | `originationiq_phase5c_f_validation_screening_judgments.json` | 15 | 210 |
| final test | `originationiq_phase5c_g_final_test_screening_judgments.json` | 14 | 196 |
| **total** | | **39** | **546** |

- 39 unique companies, each covering exactly 14 Screening criteria (39 x 14 = 546). PASS.
- Coverage values used: {0, 0.5, 1}. Raw anchors used: {25, 50, 75, 100, null}. Both in-rubric.
- All 641 cited claim ids resolve to canonical `EvidenceClaim` records; every cited claim has `provenance: "sourced"` (no derived / assumption / unknown citations, so no adapter admissibility edge cases arise).
- Coverage is complete. No STOP condition.

The `_v2` calibration packet is byte-identical to `_v1` in its `companies`
block; either yields the same result.

## 3. Diagnostic plumbing

`buildDiagnostics()` wires the existing, unchanged engines:

1. `adaptCriterionEvidence()` (the sanctioned research to scoring bridge) per criterion, using the packet's cited claim ids and the canonical `SourceRecord` set, as-of 2026-09-08.
2. `scoreScreeningCriterion()` -> `scoreScreeningDimension()` (7 dimensions) -> `scoreScreeningThesisFit()`.
3. `evaluateScreeningEvidenceEligibility()` with `mandateEligibility: "ELIGIBLE"` and no injected conflicts. **Phase 6C does not independently evaluate Mandate Eligibility for any company** - the runner hard-codes `ELIGIBLE` (matching the Phase 5C-D assumption) so the evaluator exercises only the Screening evidence-sufficiency mechanics. A `screeningEvidenceEligible: true` result therefore means "passes Screening evidence-sufficiency under the Phase 6C diagnostic assumption `mandateEligibility = ELIGIBLE`", **not** "is a mandate-qualified opportunity". No company mandate status is inferred.
4. Temporal Momentum and Signal Convergence via a **diagnostic-only** `SignalEvent` mapping (Section 15 / Section 8 note below). Engine internals (family weights, impact anchors, diminishing weights, half-lives, decay formula, dedup, direction rules, activation threshold, breadth target) are consumed verbatim.

Cross-check against the Phase 5C-D calibration export: Screening Thesis Fit,
Evidence Coverage, and Scoring Confidence reproduce to 4+ decimal places for
all 10 calibration companies. (Two display-state labels differ from the
5C-D export - Avoca and David AI now read `INSUFFICIENT_EVIDENCE` - because
the 0.30 overall display-coverage floor (a display-state gate) and the
zero-only critical-dimension guard were added in commits
`36769ba`..`22c2307`, after the 5C-D export was produced. The current code is
authoritative.)

7 new plumbing tests were added (`tests/scoring/phase6c-diagnostics.test.ts`);
they assert reconciliation, canonical ordering, determinism, zero persisted
snapshots, and the 5C-D reproduction. They skip automatically when the
local-only packets are absent.

## 4. Screening distribution

39 companies, canonical order. Fit is continuous and ungated; there is no
`RANK_ELIGIBLE` state and no Fit threshold.

| Company | Cohort | Fit | Coverage | Confidence | Display | Ev-suff¹ | Net Momentum | Net Convergence |
|---|---|---|---|---|---|---|---|---|
| Applied Compute | calibration | 59.9 | 0.77 | 0.71 | SCREENED | yes | 11.0 | 33.3 |
| Arcade.dev | final_test | 65.8 | 0.66 | 0.70 | SCREENED | yes | 11.5 | 20.0 |
| Assort Health | final_test | 64.6 | 0.58 | 0.72 | SCREENED | yes | 12.6 | 25.0 |
| Avoca | calibration | 52.8 | 0.28 | 0.73 | INSUFFICIENT_EVIDENCE | no | 10.1 | 25.0 |
| Baseten | calibration | 61.1 | 0.41 | 0.73 | SCREENED | no | 12.5 | 25.0 |
| Braintrust | final_test | 49.5 | 0.08 | 0.88 | INSUFFICIENT_EVIDENCE | no | -4.2 | -18.3 |
| Browserbase | calibration | 62.6 | 0.68 | 0.66 | SCREENED | yes | 19.2 | 51.7 |
| Canva | calibration | 68.3 | 0.56 | 0.65 | SCREENED | no | 7.8 | 25.0 |
| CrewAI | validation | 60.5 | 0.59 | 0.65 | SCREENED | yes | 8.8 | 46.7 |
| Crosby | validation | 61.4 | 0.70 | 0.74 | SCREENED | yes | 3.6 | 25.0 |
| Decagon | validation | 57.5 | 0.41 | 0.70 | SCREENED | no | 0.0 | 0.0 |
| Dust | validation | 66.6 | 0.58 | 0.67 | SCREENED | no | 8.5 | 25.0 |
| E2B | final_test | 62.1 | 0.48 | 0.70 | SCREENED | no | 22.9 | 50.0 |
| ElevenLabs | validation | 61.7 | 0.42 | 0.72 | SCREENED | no | 10.4 | 25.0 |
| Exa | final_test | 57.0 | 0.40 | 0.71 | SCREENED | no | 11.0 | 25.0 |
| fal | final_test | 59.9 | 0.42 | 0.59 | SCREENED | no | 6.7 | 25.0 |
| Gamma | validation | 72.8 | 0.73 | 0.68 | SCREENED | yes | 7.4 | 41.7 |
| Basis | final_test | 54.0 | 0.25 | 0.73 | INSUFFICIENT_EVIDENCE | no | 7.9 | 25.0 |
| Glean | calibration | 62.5 | 0.43 | 0.75 | SCREENED | no | 11.3 | 25.0 |
| Granola | validation | 63.8 | 0.62 | 0.60 | SCREENED | yes | 11.8 | 28.3 |
| Linear | validation | 80.7 | 0.88 | 0.74 | SCREENED | yes | 25.7 | 45.0 |
| Listen Labs | validation | 58.5 | 0.40 | 0.67 | SCREENED | no | 6.8 | 25.0 |
| LlamaIndex | validation | 58.0 | 0.51 | 0.61 | SCREENED | yes | 10.7 | 32.5 |
| Lovable | final_test | 58.4 | 0.45 | 0.72 | SCREENED | no | 8.0 | 6.7 |
| Mintlify | validation | 67.2 | 0.72 | 0.68 | SCREENED | yes | 13.9 | 33.3 |
| Modal | final_test | 69.9 | 0.78 | 0.70 | SCREENED | yes | 11.0 | 25.0 |
| OpenEvidence | calibration | 57.0 | 0.47 | 0.76 | SCREENED | no | 7.0 | 25.0 |
| Parallel Web Systems | final_test | 51.8 | 0.19 | 0.72 | INSUFFICIENT_EVIDENCE | no | 6.1 | 20.0 |
| Resend | final_test | 72.5 | 0.77 | 0.64 | SCREENED | yes | 15.4 | 41.7 |
| Retell AI | validation | 76.9 | 0.78 | 0.76 | SCREENED | yes | 14.0 | 41.7 |
| Rillet | calibration | 55.0 | 0.36 | 0.73 | SCREENED | no | 15.5 | 25.0 |
| Serval | validation | 67.8 | 0.60 | 0.66 | SCREENED | no | 12.4 | 45.0 |
| Sierra | calibration | 65.1 | 0.59 | 0.77 | SCREENED | yes | 16.4 | 25.0 |
| turbopuffer | validation | 68.8 | 0.88 | 0.55 | SCREENED | no | 11.9 | 50.0 |
| Vercel | final_test | 53.7 | 0.36 | 0.60 | SCREENED | no | 3.5 | 6.7 |
| Wispr Flow | final_test | 64.1 | 0.59 | 0.70 | SCREENED | yes | 12.1 | 25.0 |
| David AI | calibration | 51.3 | 0.06 | 0.85 | INSUFFICIENT_EVIDENCE | no | 0.0 | 0.0 |
| Pace | validation | 59.6 | 0.47 | 0.67 | SCREENED | no | 17.4 | 51.7 |
| XBOW | final_test | 50.6 | 0.03 | 0.85 | INSUFFICIENT_EVIDENCE | no | 0.0 | 0.0 |

¹ `Ev-suff` = passes the Screening evidence-sufficiency mechanics under the
Phase 6C diagnostic assumption `mandateEligibility = ELIGIBLE` (Section 3).
Mandate Eligibility was not independently evaluated; this is not a
mandate-qualified label.

Screening Thesis Fit quantiles (all 39): min 49.5, p25 57.3, median 61.4,
p75 66.2, max 80.7, mean 61.8.

- 33 of 39 reach `SCREENED` display state; 6 read `INSUFFICIENT_EVIDENCE` (Avoca, Braintrust, Basis, Parallel Web Systems, David AI, XBOW), all driven by low overall coverage (0.03..0.28) and/or fewer than 2 dimensions at 0.40.
- 16 of 39 pass the Screening evidence-sufficiency mechanics under the Phase 6C diagnostic assumption `mandateEligibility = ELIGIBLE` (Mandate Eligibility was not independently evaluated - see Section 3). This is **not** a mandate-qualified opportunity set and **not** a ranking.
- Fit is compressed toward the neutral 50 prior: the whole range spans ~31 points and 80% of companies sit between 52 and 73. This is the expected consequence of `internalAdjustedScore = 50 + effectiveReliability * (anchor - 50)`: thin coverage pulls every dimension toward 50.

## 5. Coverage distribution

Overall Evidence Coverage (all 39): min 0.03, p25 0.41, median 0.51, p75 0.67,
max 0.88, mean 0.51.

Dimension coverage medians (all 39): capital_efficiency 0.30, growth_momentum
0.75, founder_alignment 0.20, market_quality 0.75, business_model_quality
0.50, gtm_quality 1.00, competitive_position 0.25.

- `gtm_quality`, `market_quality`, and `growth_momentum` are the best-covered dimensions in a public outside-in pass; `founder_alignment` and `competitive_position` are the thinnest (medians 0.20 and 0.25). This matches the Phase 5C rationale for a lighter Screening framework.
- `capital_efficiency` median coverage is 0.30 and its p25 is also 0.30. This is a **descriptive observation** about how thin public capital-efficiency evidence is on this corpus - it is **not a threshold**. The calibrated Screening critical-dimension guard is **zero-only**: a company fails it only when `capital_efficiency` coverage `> 0` or `growth_momentum` coverage `> 0` is violated (i.e. coverage is exactly 0). There is **no 0.30 critical-dimension coverage floor**. Several companies that otherwise reach `SCREENED` do fail evidence-sufficiency because `capital_efficiency` (or `growth_momentum`) coverage is 0.

## 6. Confidence distribution

Scoring Confidence (all 39): min 0.55, p25 0.67, median 0.70, p75 0.73,
max 0.88, mean 0.70.

- Confidence is tight: 0.65..0.77 for almost every `SCREENED` company. It reflects the reliability-class mix (mostly `company_private_kpi` at base 0.70 and `independent_reported_fact` at base 0.90), origin dedup, and freshness.
- The very high confidence outliers (Braintrust 0.88, David AI 0.85, XBOW 0.85) are an artifact of extreme sparsity: one or two well-sourced claims with near-zero coverage. High confidence on near-zero coverage is not a quality signal, and the display gate correctly marks all three `INSUFFICIENT_EVIDENCE`.

## 7. Evidence sufficiency

Reported for three sets, all in canonical order (never sorted by Fit). The
third set is companies that pass the Screening evidence-sufficiency mechanics
**under the Phase 6C diagnostic assumption `mandateEligibility = ELIGIBLE`**
(Section 3); Mandate Eligibility was not independently evaluated, so this is
not a mandate-qualified set.

| Set | n | Fit median | Coverage median | Confidence median |
|---|---|---|---|---|
| all | 39 | 61.4 | 0.51 | 0.70 |
| SCREENED | 33 | 62.5 | 0.58 | 0.70 |
| evidence-sufficiency pass (mandate assumed ELIGIBLE) | 16 | 64.8 | (>= 0.50 by gate) | (>= 0.60 by gate) |

This subset has higher median Fit, but that is mechanical: the same
coverage that lifts a company over the evidence gate also reduces the
neutral-50 pull on its Fit. The gate is Fit-independent by construction
(`minScreeningThesisFit: null`), and this diagnostic does not change that.

## 8. Momentum distribution

Diagnostic `SignalEvent` -> `MomentumEvent` mapping (documented, not calibrated,
not production): `reported_unconfirmed` excluded (2 events); direction
positive=+1 / negative=-1 / neutral+ambiguous=0; family by `signalType`;
impact banded from `rawStrength`; evidence confidence from `claimConfidence`
(high 0.9, medium 0.7); age from `eventDate` to the 2026-09-08 as-of;
half-life default (180d); dedup key `companyId|signalType|eventDate`.

| Metric | min | p25 | median | p75 | max | mean |
|---|---|---|---|---|---|---|
| positive Momentum | 0.0 | 7.4 | 11.0 | 12.5 | 25.7 | 10.5 |
| negative Momentum | 0.0 | 0.0 | 0.0 | 0.0 | 4.2 | 0.3 |
| net Momentum | -4.2 | 7.2 | 11.0 | 12.5 | 25.7 | 10.2 |

- 35 of 39 companies have some positive Momentum; 3 have negative Momentum (the 3 security incidents); 3 have exactly zero net Momentum (their only events are `funding`, which is direction 0).
- Net Momentum is a narrow band: 26 of 39 companies fall between 7 and 15. Linear (25.7) and E2B (22.9) are the only companies materially above the pack, each on the strength of multiple recent positive customer / product events.
- Very recent events do not dominate: see Section 18.

## 9. Momentum family analysis

Sum of per-company family scores across the corpus:

| Family | Weight | Corpus family-score sum | Notes |
|---|---|---|---|
| operating_growth | 0.30 | **0.00** | No `signalType` maps here; the corpus has no dated "revenue grew" event type |
| customer_adoption | 0.25 | 12.03 | Dominant. Driven by `customer_momentum` (29) + `enterprise_expansion` (3) |
| product_technical | 0.15 | 6.29 | `product_launch` (15), `technical_adoption` (5), `pricing_change` (1) |
| gtm_ecosystem | 0.15 | 1.03 | `partnership` (3) only contributes; `funding` (52) is direction 0 |
| risk_deterioration | 0.15 | -0.80 | 3 `security_incident` events |

- **One family dominates**: `customer_adoption` accounts for ~62% of total positive family score. `operating_growth`, the highest-weighted family, is completely inert because the corpus records no operating-growth *event type* (operating growth lives in `EvidenceClaim`s instead, feeding Screening Fit). This is a structural mismatch between the momentum family taxonomy and the current `SignalEvent` type set, not a scoring bug.
- Funding does not dominate: 52 of 113 events are funding, all direction 0, contributing zero. This is the intended "funding alone contributes zero" behavior and it holds on the real corpus.
- No single company dominates positive Momentum (top contributor Linear is ~5% of the corpus sum).

## 10. Convergence distribution

Diagnostic mapping: proposition key `companyId|signalType|eventDate`; origin
key = `sourceId`; value = direction * `rawStrength`; family by `signalType`
(funding / executive_hire / regulatory_milestone map to no convergence family;
funding is a forbidden automatic-positive signal). Neutral / ambiguous events
(value 0) fall below the 0.25 activation threshold and never activate.

| Metric | min | p25 | median | p75 | max | mean |
|---|---|---|---|---|---|---|
| positive Convergence | 0.0 | 25.0 | 25.0 | 37.5 | 51.7 | 28.4 |
| negative Convergence | 0.0 | 0.0 | 0.0 | 0.0 | 18.3 | 1.4 |
| net Convergence | -18.3 | 25.0 | 25.0 | 37.5 | 51.7 | 27.0 |

- 36 of 39 companies have nonzero Convergence, but the median is exactly 25.0, which is the value of **a single active family at breadth 1 of 3**. Convergence on this corpus is mostly a low-information "at least one positive signal type is present" indicator.
- Only ~10 companies reach 2 active positive families and 2 (Browserbase, Pace) reach the breadth needed for a materially higher score. The engine's breadth cap (`min(1, count/3)`) is doing its job; the corpus simply does not carry enough distinct dated propositions per company to exercise it.

## 11. Convergence family analysis

- Positive activation is concentrated in `customer_adoption` and `product_usage`. `gtm_distribution` fires only where a `partnership` event exists (3 companies). `unit_economics`, `competitive_displacement`, and `operating_growth` almost never activate from the event stream.
- Origin dedup behaves as expected: companies whose multiple events cite the same source (common for a single announcement covered by press + company blog) collapse to one origin per family. No company shows convergence inflation from publication repetition.
- Negative Convergence appears only for the 3 security incidents, each at 18.3 (one active negative family). Braintrust is net-negative overall; Lovable and Vercel keep a separately visible negative Convergence alongside positive Convergence.
- Family conflict exceptions: none. No `propositionKey` mapped to two families.

## 12. Momentum vs Convergence

Descriptive Pearson correlation on the 39-company corpus:
**net Momentum vs net Convergence = 0.79**.

On this corpus the two engines are substantially redundant. Both are driven by
the same sparse set of positive `customer_momentum` / `product_launch` events,
and with ~1..4 events per company neither breadth (Convergence) nor
recency-weighted magnitude with diminishing weights (Momentum) has enough
material to diverge. Examples of genuine divergence exist but are rare
(turbopuffer: Momentum 11.9 / Convergence 50.0; Rillet: Momentum 15.5 /
Convergence 25.0).

This is flagged, not acted on. The engines are **not** merged. The redundancy
is a property of a thin event corpus, and a richer `SignalEvent` stream
(more distinct dated propositions per company) is the precondition for
re-testing independence. See Section 20.

## 13. Fit vs temporal signals

Descriptive Pearson on the 39 companies:

| Pair | r |
|---|---|
| Fit vs Coverage | 0.88 |
| Fit vs net Momentum | 0.61 |
| Fit vs net Convergence | 0.62 |
| net Momentum vs signal-event count | 0.45 |
| net Convergence vs signal-event count | 0.53 |

- Fit is strongly a function of Coverage (0.88), as expected from the scaling formula.
- The temporal engines carry **some** information beyond fundamental Screening attractiveness (r ~ 0.6, not ~ 0.9), but a meaningful part of that shared variance is that better-covered companies also tend to have more and more-recent events. No composite is created and no Priority is calculated.

## 14. Evidence-density analysis

Median split on distinct source count per company (median = 5 sources):

| Group | n | Fit median | Coverage median | Confidence median | Eligible share | Net Momentum median |
|---|---|---|---|---|---|---|
| more sources (> 5) | 12 | 63.2 | 0.60 | 0.70 | 0.42 | 12.0 |
| fewer sources (<= 5) | 27 | 59.9 | 0.47 | 0.70 | 0.41 | 8.8 |

Correlations: Fit vs source count 0.13; Coverage vs source count 0.17;
Confidence vs source count -0.14; Fit vs EvidenceClaim count -0.25; Coverage
vs EvidenceClaim count -0.42.

- The **Phase 6A large-company / publicity-advantage hypothesis is not strongly borne out on this corpus.** Source count barely predicts Fit or Coverage, and eligible share is essentially identical across the two groups (0.42 vs 0.41).
- The negative Coverage vs EvidenceClaim-count correlation is notable: the companies with the most raw claims (large, heavily-covered firms like Canva, Glean, ElevenLabs) tend to have many `assumption`-provenance analyst-context claims that do not raise scored coverage, plus criteria the analyst still could not fill from public evidence. Raw claim volume is not coverage.
- Descriptive only. Correlation is not causation. The evidence gate is unchanged.

## 15. Fact / Event firewall

The same underlying proposition is, in several cases, present in all three
layers. `SignalEvent.evidenceIds` is empty for all 113 events, so there is
currently no metadata linking an event to the `EvidenceClaim`(s) stating the
same fact; the assessment below is by proposition text and date.

| Proposition class | Example | Screening | Momentum | Convergence | Classification |
|---|---|---|---|---|---|
| Customer / ARR growth | Rillet "600+ customers and doubled new ARR in the latest quarter" | `recent_operating_growth` + `adoption_growth_and_durability` criteria (claims `clm-9f62a178e2`, `clm-096de6b456`) | `customer_adoption` family (`customer_momentum` event 2026-08-17) | `customer_adoption` family | **POTENTIAL_DOUBLE_COUNT** |
| Revenue milestone | Glean "$300M ARR, up from $100M 15 months earlier" | `recent_operating_growth` criterion | `customer_adoption` (`customer_momentum` event) | `customer_adoption` | **POTENTIAL_DOUBLE_COUNT** |
| Usage / inference growth | Baseten "20x revenue, 40x inference-volume growth" | `growth_momentum` dimension criteria | `customer_adoption` | `customer_adoption` / `product_usage` | **POTENTIAL_DOUBLE_COUNT** |
| Funding round | Rillet "$100M Series C at $1B" | `observable_scale_vs_primary_capital` (completed primary capital as an enduring fact, often efficiency-neutral or negative) | `funding` event, direction 0, contributes nothing | no convergence family | **SAFE_SEPARATION** |
| Product launch | LlamaIndex "LlamaParse SDKs / Parse API v2" | `differentiated_capability_or_workflow` if cited | `product_technical` (`product_launch` event) | `product_usage` | **AMBIGUOUS** (criterion may or may not cite the same launch; no shared id to check) |
| Security incident | Vercel / Lovable / Braintrust disclosed incidents | not a Screening criterion input | `risk_deterioration` (negative) | `risk_deterioration` (negative) | **SAFE_SEPARATION** (Screening does not consume it; Momentum and Convergence report it in distinct roles - magnitude vs breadth) |
| Partnership | (3 companies) | `distribution_repeatability_and_expansion` if cited | `gtm_ecosystem` | `gtm_distribution` | **AMBIGUOUS** |
| Major customer win | enterprise_expansion events | `customer_proof` criterion | `customer_adoption` | `customer_adoption` | **POTENTIAL_DOUBLE_COUNT** |
| Founder / team events | `founder_activity` (0 in corpus), `executive_hire` (1) | `founder_problem_fit` / `active_team_complementarity` (enduring facts) | `gtm_ecosystem` (executive_hire) | none | **SAFE_SEPARATION** (enduring fact vs dated hire) |

Summary:

- **The growth family (customer / ARR / usage / customer-win) is the real exposure.** For companies like Rillet, Glean, Baseten, the exact same sentence ("ARR doubled", "20x revenue growth") is the evidentiary basis for a Screening `growth_momentum` criterion **and** a `customer_momentum` `SignalEvent` **and** therefore both temporal engines. The "enduring fact vs distinct dated change" distinction that would make this `SAFE_SEPARATION` does not hold when the claim and the event are the same dated statement.
- **This is a latent cross-layer double-counting risk, not an active defect.** The current system contains no active mathematical double-counting: Priority is inactive, no Fit + Momentum + Convergence composite exists, and no production decision co-weights these layers. It is cross-layer proposition overlap that *would become* double counting if the layers were co-weighted without de-duplication. It would only cause harm the moment a Phase 6D / Priority layer adds or otherwise co-weights Fit and the temporal signals.
- Funding and security-incident overlaps are genuinely safe: funding is neutralized in Momentum and absent from Convergence and Screening treats capital as an enduring fact; security incidents are absent from Screening and play distinct roles in the two temporal engines.
- No item was deleted or suppressed. This phase diagnoses only.

## 16. Proposition identity

Current canonical metadata is **not sufficient** to identify the same
underlying proposition across `EvidenceClaim` and `SignalEvent`:

- `SignalEvent.evidenceIds` exists in schema v6 and is the natural join, but is empty for all 113 events.
- There is no shared proposition key, and matching on text or `(companyId, topic, date)` is fragile.

Recommendation (to Phase 6D, not implemented here): **yes, an explicit
cross-layer proposition identity would materially improve safety**, and the
empirical overlap above supports it. The minimal path is:

1. Populate `SignalEvent.evidenceIds` during research ingestion so every event points at the claim(s) stating the same fact.
2. Before any layer co-weights Screening Fit with Momentum / Convergence, de-duplicate at the proposition level using that link (a proposition already rewarded in Fit is not independently rewarded again as temporal signal, or is explicitly assigned a distinct temporal role).
3. Add a dedicated `propositionKey` shared field only if `evidenceIds` proves insufficient (for example, a claim and an event that describe the same fact from different sources).

Per the Phase 6C boundary, the field is **not** added now.

## 17. Sparse-company behavior

23 companies have <= 2 `SignalEvent`s or < 10 `EvidenceClaim`s.

- **A single event can produce a normal-looking temporal profile.** Glean has exactly 1 event (`customer_momentum`) and shows net Momentum 11.3 (median-ish) and Convergence 25.0 (the modal value). David AI and XBOW have 1 event each, both `funding`, so they correctly show 0 / 0. Assort Health and Baseten (2 events, single active family) show above-median net Momentum (12.6, 12.5).
- **Convergence 25.0 is indistinguishable between "one genuine broad signal" and "one lone event".** Because the modal company activates exactly one family, the median company's Convergence carries almost no comparative information.
- `singleFamilyMomentum` is true for 14 of the 23 sparse companies: their entire Momentum rests on one family, usually `customer_adoption`.

Structural concern flagged: on this corpus, Momentum and (especially)
Convergence can look "average" for a company backed by a single dated event.
No minimum-event threshold is introduced. A frontend must show event counts
and contributing-family counts next to any temporal number.

## 18. Half-life diagnostics

Contribution proxy (`|direction| * evidenceConfidence`) bucketed by event age,
with all half-lives unchanged:

| Age band | Share of contribution |
|---|---|
| 0-30 days | 22% |
| 31-90 days | 19% |
| 91-180 days | 32% |
| 181-365 days | 24% |
| > 365 days | 2.8% |

No obvious pathology. Contribution is spread fairly evenly across the first
year and only 2.8% comes from events older than a year, so old events are not
excessively influential under the current 180-day half-life. The half-lives
are left unchanged; proper half-life calibration belongs in Backtest Lab
against realized outcomes, not this descriptive pass.

## 19. Negative-signal behavior

3 real negative `SignalEvent`s, all `security_incident`, `rawStrength` 0.55,
direction negative:

| Company | Negative Momentum | Positive Momentum | Net Momentum | Negative Convergence | `risk_deterioration` family score |
|---|---|---|---|---|---|
| Braintrust | 4.17 | 0.00 | -4.17 | 18.3 | -0.28 |
| Lovable | 3.92 | 11.89 | +7.96 | 18.3 | -0.26 |
| Vercel | 3.92 | 7.42 | +3.50 | 18.3 | -0.26 |

- Negative Momentum and negative Convergence stay **separately visible** in every case. Where positive events exist (Lovable, Vercel) the net figure is positive, but the negative components are still reported as their own numbers; nothing zeroes them out.
- The 2 `reported_unconfirmed` events (fal, Applied Compute - both financing talks) are correctly excluded from Momentum. Both are also `funding` (direction 0), so they would contribute nothing even if included.
- No implementation bug found. The engines execute the current semantics faithfully. Whether a serious negative event *should* be allowed to net against unrelated positive momentum is a **methodology question for ChatGPT / Phase 6D**, not a code defect - the code does exactly what the current design says. No production scoring logic was modified.

## 20. Structural issues found

1. **Latent cross-layer double-counting risk (Section 15).** Customer / ARR / usage growth feeds Screening `growth_momentum`, Temporal Momentum, and Signal Convergence from the same dated statement. Not an active production scoring defect (no composite co-weights the layers today); it would become double counting the moment Phase 6D co-weights them without de-duplication. Requires cross-layer proposition identity (Section 16) before any worklist score.
2. **Momentum / Convergence redundancy on the real corpus (r = 0.79, Section 12).** Driven by event sparsity, not by a design flaw. Needs a richer event stream to re-test; do not merge.
3. **`operating_growth` momentum family is structurally inert (Section 9).** The highest-weighted momentum family (0.30) never fires because operating growth is recorded as `EvidenceClaim`, not as a dated `SignalEvent` type. Either the family taxonomy or the `SignalEvent` type set needs reconciliation before Momentum weights mean what they say.
4. **Convergence is near-constant at 25 for the median company (Section 10).** With one active family being typical, Convergence currently adds little comparative information. Not a bug; a consequence of corpus depth.
5. **Sparse-company temporal signals can look average on one event (Section 17).** A frontend must display event and family counts alongside any temporal figure.
6. **`SignalEvent.evidenceIds` is unpopulated (Section 16).** The join that would make proposition de-duplication possible exists in the schema but carries no data.

## 21. Non-issues

- Screening Fit / Coverage / Confidence reproduce Phase 5C-D exactly; the engine wiring is correct.
- Funding does not create automatic positive Momentum or Convergence on the real corpus (52 funding events, zero contribution).
- Publication repetition does not inflate Confidence or Convergence; origin dedup works on real data.
- The Phase 6A publicity / large-company advantage is not strongly present in Screening outputs on this corpus (Section 14).
- Negative signals are reported separately and are not silently offset at the component level (Section 19).
- Half-lives show no obvious pathology (Section 18).
- No family-conflict exceptions in Convergence.
- The evidence-sufficiency gate and its critical-dimension guard behave as specified; 6 low-coverage companies are correctly held at `INSUFFICIENT_EVIDENCE`.
- Zero `ScoreSnapshot`s persisted; the real-corpus firewall test still passes.

## 22. Phase 6D readiness

**YES WITH SPECIFIC GUARDRAILS.**

### Analytical maturity is not uniform across these outputs

The frontend must not present all five values as peers. Two tiers:

**Tier 1 - frontend-ready primary analytical outputs** (calibrated Screening
evidence architecture, reproduced exactly in Section 3):

- Screening Thesis Fit
- Screening display state
- Evidence Coverage
- Evidence Confidence
- dimension-level Screening results
- evidence gaps / provenance

**Tier 2 - temporal outputs, to be treated initially as descriptive,
provisional, and secondary:**

- Temporal Momentum
- Signal Convergence

They are Tier 2 because Phase 6C found: Momentum vs Convergence correlation
= 0.79 (Section 12); Convergence median = 25.0, the lone-family value
(Section 10); single-event sparse-company profiles can look normal
(Section 17); `operating_growth` Momentum is structurally inert (Section 9);
`SignalEvent.evidenceIds` are unpopulated (Section 16); cross-layer
proposition linkage is absent (Section 15). Their event mapping is a
diagnostic assumption, not calibrated methodology.

Do not hide or remove the temporal signals - but a future frontend must:

- show contributing **event counts**, **family counts**, **positive
  components**, and **negative components** next to every Momentum /
  Convergence figure;
- visually subordinate them to the Tier 1 outputs, so the UI never implies
  Momentum / Convergence carry the same analytical maturity as the calibrated
  Screening evidence architecture.

(No UI is implemented in Phase 6C.)

### Guardrails

1. **No composite, no ranking, no Priority number.** Present the values side by side; do not sum, average, or weight them into one score, and do not sort the worklist by any of them by default. Canonical or analyst-chosen ordering only.
2. **Fit always shown with its display state and Coverage.** Never show a Fit number for an `INSUFFICIENT_EVIDENCE` company without the label; Fit near 50 means "little evidence", not "average company".
3. **Coverage and Confidence are two separate axes.** Never combine into a single "trust" or "completeness" bar. High Confidence + low Coverage (Braintrust, David AI, XBOW) must read as "thin", not "good".
4. **Momentum and Convergence shown with event count and contributing-family count.** A temporal number backed by one event must be visibly distinguishable from one backed by five.
5. **Momentum and Convergence labelled descriptive / provisional / secondary, not production**, and visually subordinated to the Tier 1 Screening outputs (see "Analytical maturity" above). They currently run only through this diagnostic mapping; the mapping is not calibrated methodology.
6. **Negative Momentum / Convergence shown as their own figures**, never only as a net.
7. **No proposition de-duplication across layers yet**, so the worklist must not present "Fit and Momentum both high" as independent corroboration for growth-driven companies - annotate that they may rest on the same fact.
8. **Explicitly mark that no company on the list is an investment recommendation** and that the 39 companies were consumed by calibration.

## 23. Priority readiness

**NO.** (Expected default; Phase 6C provides no evidence to the contrary.)

- The current 39 companies cannot calibrate Priority: they are consumed.
- Priority would combine Fit with temporal signals, and the latent cross-layer double-counting risk (Section 15) plus the Momentum / Convergence redundancy (Section 12) must be resolved first, ideally via cross-layer proposition identity.
- A new dataset with independent human labels remains required, as does a defined Priority policy (what the states mean, who owns the decision).
- `PRIORITY_THRESHOLDS_ACTIVE` stays `false`.

## 24. Tests

- Before Phase 6C: 749 passing.
- After: **756 passing** (36 files). 7 added in `tests/scoring/phase6c-diagnostics.test.ts` for diagnostic plumbing only (reconciliation, canonical ordering, determinism, zero snapshots, 5C-D reproduction, stat helpers). No existing test weakened or removed.

## 25. Build

- `npm run typecheck`: pass.
- `npm run lint`: pass (0 warnings).
- `npm run build`: pass.

## 26. Research regression

Canonical corpus unchanged: 39 companies, 222 sources, 510 EvidenceClaims,
84 Person, 113 SignalEvents, schema v6, 0 persisted snapshots. No file under
`research/` or `data/generated/` was modified (`git status` shows only the
three new Phase 6C paths). 265 research tests pass.

## 27. QMD decision

**YES** - QMD should be refreshed after ChatGPT review, because this phase
adds a tracked diagnostic document (`docs/phase6c-descriptive-diagnostics.md`).
Not run during this phase.

## 28. Graphify decision

**Not required.** The changes are one diagnostic runner under `scripts/`, one
test file, and two docs artifacts. No production module, schema, or
architectural boundary changed. Graphify may be refreshed opportunistically
but nothing in Phase 6C warrants it.
