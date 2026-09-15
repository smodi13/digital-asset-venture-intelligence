# Digital-Asset V7 Research Methodology

Authoritative reference for the implemented v7 digital-asset domain (Phase 2B) and the frozen Phase 3B research contract. Describes what exists in code and configuration today. Does not describe planned or future functionality.

Status as of this document: **v7 is dormant.** No Screening judgments, EvidenceClaims, or SourceRecords exist for the 44-company research universe. Activation has not occurred.

## 1. v6/v7 parallel architecture and activation boundary

The codebase runs two schema generations side by side:

- **v6** (`lib/schemas/*.ts`, `SCHEMA_VERSION = 6`): the active, production system. Unchanged by Phase 2B.
- **v7** (`lib/schemas/v7/**`, `SCHEMA_VERSION_V7 = 7`): the digital-asset-native domain model, built alongside v6 but not wired into any production path.

Nothing in the active read path, scoring path, or research-build path imports the v7 namespace. `tests/scoring/digital-asset/firewall.test.ts` enforces this isolation. `lib/domain/migrate-v6-v7.ts` provides a shape-only adapter that is itself not imported by any active path. Phase 3 is expected to switch the canonical `SCHEMA_VERSION` to 7 in one atomic commit; that has not happened.

## 2. SCHEMA_VERSION_V7 = 7

Defined in `lib/schemas/v7/common.ts`. A v7 record must carry the literal value `7` for `schemaVersion`: no default is provided, so a malformed record fails validation rather than being silently coerced.

## 3. Eleven-category taxonomy

`digitalAssetCategorySchema` (`lib/schemas/v7/company.ts`) defines exactly 11 categories:

| Category |
|---|
| core_protocols_and_scaling |
| developer_infrastructure_and_middleware |
| data_oracles_and_indexing |
| security_privacy_and_cryptography |
| stablecoins_and_payments |
| defi_and_capital_markets |
| tokenization_and_real_world_assets |
| depin_and_decentralized_compute |
| crypto_ai_and_agentic_infrastructure |
| consumer_social_and_gaming |
| custody_compliance_and_institutional_infrastructure |

Governance tooling and identity are classified by primary function; they are not given their own category. `digitalAssetCategory` is nullable and never a scoring input.

## 4. entityType semantics

`entityTypeSchema`: `company | protocol | network | hybrid`.

Identity axis, not a score input. Orients which criteria and evidence are relevant.

## 5. assetType semantics

`assetTypeSchema`: `equity | token | equity_and_token | network_no_token | unknown`.

`network_no_token` means a protocol/network for which no token instrument exists and no token exposure is evaluated. It is not a synonym for "equity company that happens to run a network": if the investable instrument is equity in an operating company, `assetType` is `equity` even if that company runs a tokenless network.

Two invariants hold throughout the domain:
- No token is never automatically negative.
- Having a token is never automatically positive.

## 6. digitalAssetLifecycle enum

`digitalAssetLifecycleSchema`: `pre_launch | testnet | mainnet_early | mainnet_established`.

Network maturity, kept separate from financing stage. A pre-launch protocol may have raised a Series A; a mainnet-established network may be bootstrapped. Nullable.

## 7. Nullable institutionalOrientation

`institutionalOrientation: z.boolean().nullable().default(null)` on `companyV7Schema`. Never `default(false)`: false is itself a claim, and an unresolved orientation must stay representable as `null`. Orthogonal to scoring; contributes no points.

## 8. digitalAssetMetrics structure and no-auto-score rule

`digitalAssetMetricsSchema` = `{ network: networkMetricsSchema | null, tokenMarket: tokenMarketMetricsSchema | null }`.

- `networkMetricsSchema`: tvlUsd, protocolFeesUsd, protocolRevenueUsd, activeAddresses, transactionCount, transactionVolumeUsd, operatorCount, contributorCount, treasuryAssetsUsd, incentiveSpendUsd.
- `tokenMarketMetricsSchema`: circulatingMarketCapUsd, fdvUsd, tokenSupply (circulating/total/max + emissionScheduleNote).

Each metric is a `pointInTimeMetric` (single `asOf` date) or `periodMetric` (`periodStart`/`periodEnd`, start ≤ end), every non-null value carrying `metricProvenance` (kind, confidence, sourceIds, evidenceIds, note). A metric value is null when not established: never 0, never a fabricated estimate.

**Critical invariant**: none of these raw fields may directly modify a Thesis Fit or Underwriting score. There is no "TVL up → score up" path anywhere in the implemented code. An analyst may cite a properly sourced metric as evidence for an EvidenceClaim; human judgment then sets `rawAnchor` and `coverage`.

## 9. v7 SignalEvent subject rules

`lib/schemas/v7/signal-event.ts`. `subjectType`: `company | protocol | network`. `hybrid` and `token` are never subjects: a hybrid entity's event resolves to whichever concrete subject the event concerns. A newly created v7 event requires `subjectType` with no default; the dormant v6→v7 adapter fills `subjectType = "company"` only for legacy v6 events.

Facts endure, events decay: the event record never disappears when a half-life expires. Half-life governs only a future recency-weighted analytical contribution. An exploit, regulatory action, governance event, token launch, or mainnet milestone stays permanently visible in provenance and history.

## 10. Fifteen digital-asset signal types

`DIGITAL_ASSET_SIGNAL_TYPES` (`lib/schemas/v7/signal-event.ts`), additive to the 16 inherited v6 signal types:

| Signal | Category | Allowed subjects | Directions |
|---|---|---|---|
| protocol_launch | network | protocol | positive, neutral |
| network_milestone | network | network | positive, neutral |
| developer_activity | ecosystem | company, protocol, network | positive, negative, neutral |
| contributor_growth | ecosystem | company, protocol, network | positive, negative, neutral |
| integration_growth | ecosystem | company, protocol, network | positive, neutral |
| onchain_activity_trend | network | protocol, network | positive, negative, ambiguous |
| fee_revenue_trend | network | company, protocol, network | positive, negative, ambiguous |
| liquidity_tvl_change | network | protocol, network | positive, negative, ambiguous |
| ecosystem_funding | capital | company, protocol, network | neutral, ambiguous |
| governance_change | market | protocol, network | positive, negative, neutral, ambiguous |
| major_integration_partnership | ecosystem | company, protocol, network | positive, neutral |
| exploit | risk | protocol, network | negative |
| regulatory_action | risk | company, protocol, network | negative, ambiguous |
| token_launch | capital | company, protocol, network | neutral, ambiguous, negative |
| token_economic_design_change | capital | company, protocol, network | positive, negative, neutral, ambiguous |

Subject-type and direction compatibility are enforced by zod refinements on `signalEventV7Schema`.

## 11. Provisional signal half-lives and persistence distinction

Half-lives (`DIGITAL_ASSET_SIGNAL_SPECS[type].halfLifeDays`) range from 120 days (developer_activity, liquidity_tvl_change) to 730 days (regulatory_action). They are labeled **PROVISIONAL V1 hypotheses, not calibration results**.

Distinction: half-life governs only the future recency-weighted *analytical contribution* of a signal. It never deletes or hides the underlying event record; the record's persistence and the signal's decaying analytical weight are separate concepts.

## 12. Seven digital-asset source classes

`DIGITAL_ASSET_SOURCE_TYPES` (`lib/schemas/v7/source-record.ts`), additive to the 11 inherited v6 source classes:

| Source class | Reliability prior | Independent | Can corroborate |
|---|---|---|---|
| official_protocol_source | 0.68 | no | no |
| official_network_source | 0.68 | no | no |
| governance_forum | 0.55 | no | no |
| block_explorer | 0.90 | yes | yes |
| onchain_analytics | 0.60 | yes | yes |
| code_repository | 0.75 | no | no |
| security_audit | 0.85 | yes | yes (within scope) |

All reliability priors are labeled provisional and uncalibrated.

## 13. Source-origin / corroboration rules

Invariants enforced on `sourceRecordV7Schema`:
- `isIndependent === false ⇒ canCorroborate === false` (schema refinement).
- `sourceType === "analyst_inference" ⇒ canCorroborate === false` always: analyst inference is never evidence.
- N publications repeating one origin are one voice, not N corroborations. `originatesFrom` links a record to the origin it derives from; `isPressReleaseReproduction` flags wire/press-release syndication.
- Two block explorers or analytics dashboards exposing the same underlying chain state/methodology are one origin, not two.

## 14. Fourteen Screening criteria

`lib/scoring/digital-asset/screening.ts`. Exactly 14 criteria, two per Thesis Fit dimension, equal within-dimension weights (0.50/0.50). Brand-new ids that do not reuse any inherited v6 Screening id. Weight status: `PROVISIONAL_DIGITAL_ASSET_V1_SCREENING_WEIGHTS`.

| Dimension | Criteria |
|---|---|
| capital_efficiency | observable_scale_vs_capital, operating_resource_intensity |
| growth_momentum | adoption_and_usage_momentum, developer_and_ecosystem_momentum |
| founder_alignment | team_execution_credibility, governance_and_incentive_alignment |
| market_quality | problem_urgency_and_market_depth, structural_and_regulatory_fit |
| business_model_quality | value_capture_model, economic_sustainability |
| gtm_quality | distribution_and_integration_pull, adoption_friction_and_ecosystem_access |
| competitive_position | technical_and_product_differentiation, defensibility_security_and_network_effects |

Each Screening criterion maps to one or more of the 39 Underwriting criteria (`DA_SCREENING_TO_UNDERWRITING`); the mapping is validated at module load against the Underwriting registry.

## 15. Thirty-nine Underwriting criteria

`lib/scoring/digital-asset/underwriting.ts`. Exactly 39 criteria (enforced at module load), brand-new ids, equal within-dimension weights (0.20 each for five-criterion dimensions, 1/6 each for six-criterion dimensions). Weight status: `PROVISIONAL_DIGITAL_ASSET_V1_UNDERWRITING_WEIGHTS`.

| Dimension (5 or 6 criteria) | Criteria |
|---|---|
| capital_efficiency | capital_deployment_productivity, treasury_and_runway_quality, financing_and_dilution_dependence, token_issuance_and_emissions, operating_resource_intensity |
| growth_momentum | fee_or_revenue_growth, user_customer_and_workload_growth, retention_and_repeat_usage, developer_and_contributor_growth, multi_period_adoption_durability |
| founder_alignment | team_domain_execution, technical_and_protocol_depth, governance_and_control_alignment, incentive_and_ownership_alignment, organizational_resilience_and_key_person_risk |
| market_quality | problem_urgency_and_willingness_to_pay_or_participate, addressable_market_depth, structural_tailwinds, regulatory_and_jurisdiction_fit, market_structure_and_liquidity_context, expansion_surface_and_adjacent_markets |
| business_model_quality | value_capture_mechanism, instrument_value_accrual_linkage, margin_and_supply_side_economics, economic_sustainability_without_subsidies, liquidity_quality_and_reflexivity, concentration_and_counterparty_risk |
| gtm_quality | structural_distribution_advantage, developer_and_ecosystem_pull, integration_depth_and_production_adoption, acquisition_repeatability, adoption_friction_and_compliance, expansion_and_composability_motion |
| competitive_position | technical_and_product_differentiation, security_architecture_and_audit_posture, exploit_history_and_response, switching_costs_and_workflow_embedment, network_effects_and_participant_concentration, forkability_commoditization_and_displacement |

Every criterion carries a one-sentence semantic definition in `DA_UNDERWRITING_CRITERION_SEMANTICS`, validated as complete at module load. Note the two canonical collision-avoidance ids, chosen specifically to avoid clashing with rejected older ids: `capital_deployment_productivity` and `structural_distribution_advantage`.

## 16. Applicability = applicable / not_applicable / unknown

`lib/scoring/digital-asset/applicability.ts`. Applicability and evidence coverage are different concepts.

| State | Meaning |
|---|---|
| applicable | Normal rawAnchor and coverage mechanics apply. |
| not_applicable | rawAnchor = null; no coverage; excluded from both the score denominator and the evidence-coverage denominator; carries an explicit reason. |
| unknown | Not silently excluded. Stays in the denominator as an unresolved-applicability / diligence gap. Contributes no positive score (neutral 50 fill). Remains distinguishable from not_applicable. |

Currently implemented selectors (`APPLICABILITY_SELECTORS`) cover two criteria explicitly: `token_issuance_and_emissions` (applicable only where token exposure exists or is committed) and `liquidity_quality_and_reflexivity` (applicable where token/protocol liquidity is economically material (token exposure, or entityType protocol/network)). Every other criterion is universally applicable by default. A criterion being absent because an entity has no token must not raise or lower the score.

`renormalizeDimension` rolls a dimension up: not_applicable criteria are removed from both denominators; unknown criteria stay in the denominator at neutral internal score 50 with 0 coverage; remaining weights are renormalized to sum to 1.

## 17. Critical dimensions

`DA_CRITICAL_DIMENSION_EVIDENCE_GUARD` / `criticalDimensions` in `config/digital-asset/scoring.yaml`: `capital_efficiency` and `growth_momentum`. Status `PROVISIONAL_DIGITAL_ASSET_V1`, `calibrated: false`. This is a zero-coverage veto only: any evidence coverage strictly greater than zero satisfies it; there is no positive minimum. The compound guard "growth_momentum AND (capital_efficiency OR business_model_quality)" described in earlier planning is explicitly **not** introduced in the implemented code.

## 18. Forbidden automatic positives

`DA_FORBIDDEN_AUTOMATIC_POSITIVE` (`lib/scoring/digital-asset/config.ts`, mirrored in `config/digital-asset/scoring.yaml`), 13 entries:

funding, ecosystem_funding, token_launch, token_price_appreciation, fdv_or_market_cap_appreciation, tvl_growth_alone, github_stars, repo_popularity, emission_funded_activity, article_count, publication_repetition, famous_logo_without_operating_evidence, prestige.

## 19. Mandate vs evidence-sufficiency distinction

`lib/scoring/digital-asset/mandate.ts`. `evaluateDigitalAssetMandate` returns two separate outputs: `eligibility` (`eligible | ineligible | unresolved`) and `evidenceSufficiency` (`sufficient | insufficient`).

- Insufficient public evidence is never a mandate exclusion: it yields `unresolved` eligibility with `insufficient` evidence sufficiency, never `ineligible`.
- Pseudonymous teams are not automatically excluded.
- No token is not an exclusion; token existence is not positive.
- Only a conclusive mandate conflict yields `ineligible`: `hardExclusionTriggered` or `noAccessibleInstrument` (conclusively no accessible investable instrument at all, distinct from "no token").

`config/digital-asset/thesis.yaml` `hardExclusions` (7 entries): pure_speculative_token_exposure, meme_token_speculation, passive_asset_vehicle, incidental_blockchain_marketing, credible_fraud_evidence, outside_venture_stage_scope, no_accessible_investable_instrument.

## 20. EvidenceClaim research contract

Per the frozen Phase 3B contract (`local-artifacts/phase3a-universe/research-contract.md`), every EvidenceClaim must be:
- Atomic: one analytical fact per claim (no compound claims bundling growth + network effects + efficiency into one assertion).
- Falsifiable.
- Sourced, with provenance classification.
- Dated where relevant, distinguishing point-in-time from period data.
- Scoped.
- Linked to the correct source origin.

No EvidenceClaim exists yet for any of the 44 primary entities.

## 21. Metric/date discipline

- Do not require token/network metrics for every entity: many are equity-only or evidence-thin by nature.
- Where metrics exist: record exact date/period, distinguish point-in-time from period, identify source methodology.
- Do not invent user counts from addresses; do not infer revenue from token price; do not equate TVL with revenue; do not equate volume with retained adoption; do not count incentives as organic demand without evidence.
- Missing = `null`, never 0 and never an estimate.

## 22. publicationDate / availabilityDate / ingestedAt semantics

`signalEventV7Schema` carries `publicationDate` (when the source published), `availabilityDate` (when the fact became publicly available/discoverable, may lag or lead publicationDate), and `eventDate` (when the underlying event occurred). All are nullable ISO dates. `SourceRecordV7` separately carries `accessedAt` (when analysis accessed the source, an ISO datetime) and `publishedAt` (when the source itself was published). These are kept structurally distinct so a record can never silently borrow the wrong date for a downstream recency calculation.

## 23. 2026-09-10 research cutoff

The Phase 3B research contract sets the universe-selection research cutoff at **2026-09-10**. This governs the standard Phase 3B research must meet for each of the 44 primary entities before any Screening or Underwriting judgment is formed.

## 24. 44-primary / 22-reserve universe methodology

`local-artifacts/phase3a-universe/final-universe.csv` holds 44 primary entities; `reserves.csv` holds 22 reserve entities. If a primary must be replaced for factual-eligibility reasons, the replacement must come from the same category's reserve pool and inherit the replaced entity's cohort assignment, unless explicitly approved otherwise.

## 25. CALIBRATION / VALIDATION / FINAL_TEST leakage rules

Frozen cohorts (`cohort-assignment.csv`), 44 entities total:

| Cohort | Size | Use |
|---|---|---|
| CALIBRATION | 15 | May be used to develop/refine digital-asset evidence-sufficiency thresholds. |
| VALIDATION | 15 | May evaluate frozen calibration decisions and trigger a redesign, only before FINAL_TEST evaluation begins. |
| FINAL_TEST | 14 | Sealed from methodology tuning. |

If FINAL_TEST results expose a material methodological defect, the methodology may be corrected, but the current FINAL_TEST is then **consumed**: a new, untouched holdout is required before any future final-test validation claim can be made. FINAL_TEST outcomes must never be inspected and then used to tune the same rules while still calling it "the final test."

## 26. Frozen cohort hash

`cohort-assignment.csv` is hashed (SHA-256) at freeze time in `cohort-hash.txt`:

```
d07a82de27dec22a163a84fe209716daefdde7dfaa6fb9c05851612bd6883ffd
```

## 27. No Screening judgments exist yet

No `rawAnchor`, criterion coverage judgment, criterion rationale, Thesis Fit, evidence-bar result, rank, or recommendation exists yet for any entity in the 44/22 universe. These are Phase 3C outputs, formed only after the Phase 3B research corpus exists, never before it, and never used to justify universe membership.

## 28. v7 remains dormant

As of this document, v7 is fully implemented in parallel to v6 but not activated: `SCHEMA_VERSION` remains 6, no production code path imports `lib/schemas/v7/**` or `lib/domain/migrate-v6-v7.ts`, `config/digital-asset/**` is not read by `lib/config/load.ts` and is not part of the active configHash, and `lib/scoring/digital-asset/**` is not wired into any active scoring path. `tests/scoring/digital-asset/firewall.test.ts` enforces this boundary. Activation is a Phase 3 event that has not occurred.
