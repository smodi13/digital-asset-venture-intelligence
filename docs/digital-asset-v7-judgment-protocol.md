# Digital-Asset V7 Judgment Protocol

Authoritative reference for the implemented v7 analyst-judgment harness (Phase 3C-0). Describes what exists in code today for turning frozen v7 research into human Screening-criterion judgments. Does not describe planned or future functionality. Cross-reference `docs/digital-asset-v7-research-methodology.md` (the v7 domain model and scoring contract) and `docs/digital-asset-v7-research-ingestion.md` (the research packet harness this judgment harness binds to).

## 1. Status: dormant

No real Screening judgment exists for any of the 15 CALIBRATION entities. `judgments/v7/calibration/` holds no real packets. `data/v7-analytical-inputs/` does not exist in the repository; it is created only by running the build script. Nothing here is authorized to activate v7, score a real entity, or change the active v6 application.

## 2. Research and judgment are separate

Research is frozen at commit `0c10a376c3ccc5df3429d397673b59ab97812b5f` (`FROZEN_RESEARCH_BASELINE_COMMIT`, `lib/judgments-v7/dates.ts`). A judgment packet cites frozen research; it never contains research. No judgment session may browse the web, add a `SourceRecord`, add an `EvidenceClaim`, or add a `SignalEvent`. If evidence is insufficient, the correct judgment is `unknown` applicability or an `evidenceGapNote`, never new research.

## 3. The judgment packet

One human-reviewable YAML file per (entity, cohort) judgment. Schema: `lib/judgments-v7/packet-schema.ts` (`judgmentPacketSchema`).

Identity: `schemaVersion` (7), `candidateId`, `entityId`, `cohort`, `researchBaselineCommit`, `researchPacketSha256`, `methodologyConfigFingerprint`, `mandateStatus`.

Criterion judgments: exactly 14 entries, one per implemented Screening criterion id (`DA_SCREENING_CRITERION_IDS`, `lib/scoring/digital-asset/screening.ts`). Each carries `criterionId`, `applicability`, `rawAnchor`, `coverage`, `citedEvidenceClaimIds`, `rationale`, `acknowledgedContradictionIds`, `evidenceGapNote`.

## 4. Forbidden computed-outcome fields

`FORBIDDEN_JUDGMENT_FIELDS` (`lib/judgments-v7/packet-schema.ts`), 13 entries: `dimensionScore`, `dimension_score`, `thesisFit`, `thesis_fit`, `overallScore`, `overall_score`, `rank`, `investmentRank`, `recommendation`, `investmentRecommendation`, `rankEligibility`, `screeningEvidenceEligibility`, `priorityScore`. Enforced by a recursive pre-parse scan (`scanForForbiddenFields`) plus `.strict()` schemas, the same two-layer pattern the research packet firewall uses. `rawAnchor` is explicitly not on this list: it is the intentional human criterion-level input, computed nowhere upstream of the analyst. (Phase 3C-0's final report miscounted this registry as 12; the registry itself was always correct at 13 entries, verified by `tests/judgments-v7/harness.test.ts`.)

## 5. Applicability semantics (unchanged from the implemented scoring contract)

`applicable | not_applicable | unknown`, exactly as `lib/scoring/digital-asset/applicability.ts` defines them. Applicability is a human analytical judgment; the packet schema affords no automatic derivation from `entityType`, `assetType`, or any raw metric. `not_applicable` requires `rawAnchor` and `coverage` to be `null` (schema-enforced). `unknown` requires the same. Only `applicable` requires a non-null `rawAnchor` and `coverage`.

## 6. rawAnchor semantics

`z.number().min(0).max(100)`, matching the internal-score formula already implemented in `renormalizeDimension` (`50 + coverage * (anchor - 50)`). `coverage` is `0 | 0.5 | 1`, the same vocabulary as `CriterionScoreInput.coverage`. Neither field has any automatic-positive path: the packet schema has no field through which a network metric, token metric, funding amount, or GitHub statistic could set an anchor. `DA_FORBIDDEN_AUTOMATIC_POSITIVE` (`lib/scoring/digital-asset/config.ts`) remains the authoritative registry; the judgment protocol does not duplicate it, only avoids providing any path around it.

## 7. Evidence-claim binding

`citedEvidenceClaimIds` and `acknowledgedContradictionIds` must resolve to `EvidenceClaim` ids that exist in the frozen research corpus (`lib/judgments-v7/integrity.ts`, `checkResearchAndMethodologyBinding`). Resolution is checked against every research packet supplied to validation, not only the bound entity's own packet, so a claim that exists but belongs to a different entity is reported distinctly (`claim_belongs_to_another_entity`) from a claim that does not exist anywhere (`missing_cited_claim_id`). No freehand new evidence can be introduced through a judgment packet: the schema carries no field for a new claim, source, or signal event.

## 8. Contradiction handling

A judgment may cite `acknowledgedContradictionIds` (claim ids representing a material contradiction the analyst has read and accounted for). As of Phase 3C-0.1, acknowledgment is structurally required wherever it is material: see section 8a.

### 8a. Criterion-specific contradiction acknowledgment (Phase 3C-0.1)

`checkContradictionAcknowledgment` (`lib/judgments-v7/integrity.ts`) uses only the contradiction graph the frozen research packet already carries: `EvidenceClaim.contradicts` / `contradictedBy` (`lib/schemas/evidence-claim.ts`). No second contradiction system is introduced.

For each criterion judgment, the required acknowledgment set is exactly the union of `contradicts` and `contradictedBy` across that criterion's OWN cited claims (`citedEvidenceClaimIds`), read symmetrically (whichever claim names the relationship, both ends are treated as linked, since research-v7's own integrity checks do not require an author to set both sides). A material contradiction elsewhere in the entity's research packet, unrelated to what this criterion cites, is never required here: a criterion that cites only an uncontested claim has an empty required set regardless of what else the packet contains.

Two error codes:

- `unacknowledged_contradiction`: a required contradiction id is missing from `acknowledgedContradictionIds`.
- `unrelated_acknowledged_contradiction`: an acknowledged id resolves to a real claim of this entity, but has no contradiction relationship to this criterion's cited evidence set. (Existence and cross-entity ownership of an acknowledged id are checked separately, by the same `missing_cited_claim_id` / `claim_belongs_to_another_entity` codes used for `citedEvidenceClaimIds`.)

This is a disclosure requirement, not a scoring rule. Acknowledging a contradiction never changes `rawAnchor`, `coverage`, `applicability`, criterion weights, dimension weights, or any threshold: the schema affords no path from `acknowledgedContradictionIds` to any of those fields, and `tests/judgments-v7/contradiction-acknowledgment.test.ts` (case 10) proves an acknowledged anchor is stored exactly as the analyst supplied it. Where a contradiction leaves a criterion genuinely indeterminate, the analyst still chooses `applicability: unknown` (or any other already-implemented uncertainty mechanic) as a judgment call; acknowledgment does not automatically select it.

## 9. Research and methodology binding

Every judgment packet is bound to three things, all checked in `lib/judgments-v7/integrity.ts`:

- `researchBaselineCommit` must equal `FROZEN_RESEARCH_BASELINE_COMMIT`.
- `researchPacketSha256` must equal `hashResearchPacket(<the currently supplied research packet for that entity>)` (`lib/judgments-v7/research-binding.ts`), a canonical hash over the parsed, validated research `Packet` object. A whitespace or key-order edit to the YAML does not change this hash; any real value change does. A mismatch is `stale_research_packet`.
- `methodologyConfigFingerprint` must equal the live `DA_METHODOLOGY_FINGERPRINT` (`lib/judgments-v7/methodology-fingerprint.ts`), a deterministic hash over the exact registries a Screening judgment depends on (Screening weights, the Screening-to-Underwriting mapping, Underwriting weights, dimension weights, the critical-dimension guard, the forbidden-automatic-positive registry). A mismatch is `config_drift_detected`: it proves the judgment was made under a scoring configuration that no longer matches what is now live, rather than silently reinterpreting an old judgment under new rules.

`lib/scoring/digital-asset/**` exposes no scoring/config loader hash of its own (`config/digital-asset/**` is not part of the active v6 configHash), so this fingerprint is the narrowest mechanism that closes that gap without touching the active config-hash system.

## 10. Mandate treatment

`lib/scoring/digital-asset/mandate.ts` (`evaluateDigitalAssetMandate`) is structurally separate from Screening-criterion judgment: it takes boolean inputs (`hardExclusionTriggered`, `noAccessibleInstrument`, `coreQuestionsResolvable`), not per-criterion evidence. This phase's judgment packet does not perform mandate assessment: `mandateStatus` is literal-locked to `NOT_ASSESSED`. Mandate eligibility is out of scope until a later phase builds its own evidence-gathering and judgment path for it.

## 11. Blind judgment workflow

Nothing in this phase's tooling computes or displays an aggregate Thesis Fit, dimension score, rank, recommendation, rank eligibility, or cross-company distribution during primary judgment entry. `validateJudgmentPacket` and `compileJudgmentBatch` report only structural and binding facts (issues, counts, applicability, per-criterion anchors). `buildJudgmentAuditReport` (`lib/judgments-v7/audit.ts`) is explicit about this in its own doc comment: aggregate scoring is a separate, later stage that this phase does not build. A future `judgments:v7:score` command (not built in this phase) would be the first place an aggregate becomes visible, and only after a judgment packet is frozen.

## 12. Aggregate-score separation

Three separate stages, matching the research harness's own validate/build/audit split:

```
npm run judgments:v7:validate -- <packet-file-or-dir> [--research <research-packet-dir>]
npm run judgments:v7:build    -- <packet-dir> --batch <BATCH> [--research <research-packet-dir>] [--out <dir>]
npm run judgments:v7:audit    -- <packet-dir> [--research <research-packet-dir>] [--out <report.json>]
```

`--research` defaults to `research/v7/input/`. There is no `judgments:v7:score` command in this phase; aggregate scoring is explicitly out of scope until a future phase authorizes it.

## 13. Cohort firewall

`judgments/v7/calibration/` is the only real judgment directory this phase creates. `compileJudgmentBatch` rejects a judgment packet whose `cohort` does not match the `--batch` the build targets (`wrong_cohort`), and separately rejects a judgment whose declared `cohort` does not match its bound research packet's actual cohort (`cohort_mismatch`). There are currently no VALIDATION or FINAL_TEST research packets, so no VALIDATION or FINAL_TEST judgment can be authored yet regardless.

## 14. Deterministic compilation

`compileJudgmentBatch` (`lib/judgments-v7/compile.ts`) validates every packet's schema first, then runs every cross-record binding check, and only writes output if the whole batch is error-free. Entities are sorted by id; each entity's criteria are sorted by criterion id; the manifest (`data/v7-analytical-inputs/MANIFEST.v7.json`, `lib/judgments-v7/manifest.ts`) records a SHA-256 per generated file. Given the same inputs and the same `now` timestamp, repeated compilation produces byte-identical output (`tests/judgments-v7/harness.test.ts`, fixture T).

## 15. Generated analytical input

`data/v7-analytical-inputs/entities.v7.json`. Per entity: `entityId`, `candidateId`, `cohort`, `mandateStatus`, the three binding fields, and `criteria`, an array of exactly the `CriterionScoreInput` shape already defined in `lib/scoring/digital-asset/applicability.ts` (`criterionId`, `applicability`, `rawAnchor`, `coverage`). No rationale text, no evidence ids, no analyst note: those stay in the human judgment packet (the audit trail); the analytical input is only what a future dormant scorer would consume. Never written to `data/analytical-inputs/` (active v6) or `data/v7-generated/` (dormant v7 research).

## 16. Active-v6 firewall

`tests/scoring/digital-asset/firewall.test.ts` extends its forbidden-import patterns to include `judgments-v7`, alongside the existing `schemas/v7`, `config/digital-asset`, `scoring/digital-asset`, `migrate-v6-v7`, and `research-v7` patterns. No active path (`app/**`, `lib/screening-read/**`, active `lib/scoring/*.ts`, active `lib/research/**`, `scripts/research/**`, `lib/domain/manifest.ts`, `lib/domain/ingest.ts`) may import `lib/judgments-v7/**`, `judgments/v7/**`, or `data/v7-analytical-inputs/**`.

## 17. Research-freeze firewall

`tests/judgments-v7/research-freeze-firewall.test.ts` proves judgment compilation writes no `evidenceClaims`, `sources`, or `signalEvents` collection, and proves the real `research/v7/input/**` packets on disk are byte-unchanged after running the harness against synthetic fixtures. Research is input to judgment, never output from it.

## 18. Commands for future 3C-1A/B/C

Once Phase 3C-0 is reviewed and a later phase is authorized: author a judgment packet under `judgments/v7/calibration/`, run `judgments:v7:validate` against the frozen `research/v7/input/` corpus, resolve every ERROR, run `judgments:v7:build --batch CALIBRATION` once a batch of packets is clean, and run `judgments:v7:audit` to review completion before the batch is considered frozen. Aggregate scoring (a `judgments:v7:score` command or equivalent) is not built in this phase and requires separate authorization; when it exists, it should read only frozen, validated `data/v7-analytical-inputs/**` output, never an in-progress judgment session.
