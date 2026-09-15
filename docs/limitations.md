# Limitations

This document states what Digital Asset Venture Intelligence does not yet do. It is written first
and kept current deliberately, because the failure mode for a project like this
one is describing planned functionality as though it already exists.

## Current status

This repository contains architecture, canonical schemas, configuration,
provenance primitives, policy guards, tests, a deterministic scoring
architecture, and a research corpus of 39 companies (222 sources, 510 evidence
claims, 84 person records, 113 dated signal events; canonical record schema
version 6). It is an analyst screening tool, not an investment product: the
39 companies carry deterministic Screening analytics (Thesis Fit, Evidence
Coverage, Evidence Confidence) computed on read from human analytical inputs,
but no company is ranked, shortlisted, recommended, or underwritten, mandate
eligibility is `NOT_ASSESSED` for every company, and `snapshots.json` holds
zero persisted score records.

## What does not exist yet

**The corpus is 39 companies.** The remaining company universe has not been
researched; `docs/research-standard.md` is the protocol for it. The synthetic
early-phase companies live only in test fixtures and never enter the real
corpus.

**Corpus counts are implementation facts, not performance claims.** The
510-claim, 222-source figures describe what has been ingested. They are not a
measure of research quality or investment merit, and neither is any
claim-support count in `research-summary.json`.

**Numeric values are not extracted.** Every evidence claim carries the sourced
fact as prose, with `numericValue` null, including the Phase 3D derived capital
figures (their arithmetic is stated in `notes`, not parsed into a field).
Company financials (`totalRaised`, `lastRound`, `employeeCount`) are recorded as
`unknown` unless a later pass deliberately extracts them; Phase 3D did not
change this even where a lower bound exists (E2B "more than $37M", turbopuffer
"less than $1M"). No capital-efficiency ratio is computed, and for several
companies the public evidence is not sufficient to compute one at all. That is a
property of the evidence, not a missing feature.

**Public-data research cannot reconstruct private financial statements.** The
corpus records what companies and outside parties have said publicly. It does
not contain, and cannot derive, audited revenue, gross margin, burn, cash
position, or a full cap table. Where those are unknown they stay `unknown`.

**Current evidence is not always historically admissible.** Undated current
sources (company pages, founder posts, customer case studies) support current
`EvidenceClaim`s only. They create no historical `SignalEvent` and are excluded
from any historical test. All 67 Batch 1 events happen to carry an intrinsic
timestamp; later batches with undated pages will exclude a larger fraction.

**No predictive validation has been performed on real companies.** The 39
companies carry deterministic Screening analytics computed on read, but the
Screening weights and thresholds have been calibrated only against sealed
human-judgment cohorts, never against realised investment outcomes. Nothing in
the real corpus is ranked, shortlisted, assigned a Priority, or underwritten,
and Underwriting / Momentum / Convergence are unit-tested against synthetic
fixtures only. Research readiness labels (`ready`, `ready_with_caveat`,
`blocked`) are not scores. The claim-support metrics are research QA, not
evidence of investment performance.

**Independent corroboration is thin, and external publication is not
independent claim origin.** Phase 3D added 30 external sources, but most
economically important metrics remain company-reported: an outlet repeating a
company's ARR or NRR is an independent publisher, not an independent origin for
that figure. Under the strict rule (a `reported_fact` whose primary citation is
independent journalism or a regulatory record), only **4** claims in the whole
corpus have independent-origin support and only **1** has two independent
origins; **19** claims rest on a third-party estimate; **30** company-reported
claims carry an external publication that nonetheless does not establish the
metric. `research-summary.json` reports all of these, and a legacy company-level
source-coverage count, so the thinness is visible rather than hidden.

**Structured-secondary data can be estimated.** Figures from data vendors
(Sacra, CB Insights, Dealroom) are stored as `third_party_estimate` and are
never promoted to audited fact.

**Transaction primary/secondary splits may remain unavailable.** Where a
headline round mixed primary and secondary and the split was not disclosed
(Linear's Series C), primary capital is recorded as `unknown` and is not
inferred. Where a secondary component was independently reported (Gamma), the
primary figure is `derived` and rounded, not audited.

**No corpus-time page crawling.** The snapshot model, hashing, and diff utility
exist but are unused: the corpus build touches no network and fetches no page.
The only runtime external fetch anywhere in the product is the Sourcing route
pulling its fixed allowlist of public RSS feeds server-side (see below); it
never writes to the corpus.

**The headline phrase table is small.** It covers the common vocabulary of
corporate announcements. A headline it does not recognise goes to the review
queue rather than being guessed at, which is correct behaviour but does mean
recall depends on the table growing as real headlines arrive.

**Limited live sourcing.** Headline Radar, the one V1 discovery engine, fetches
a fixed server-side allowlist of three public RSS feeds (TechCrunch, Crunchbase
News) with no account or API key, extracts one candidate per story with a
deterministic phrase table, and hands candidates to a browser-local research
queue. It does no ranking and produces no Screening result. Builder Radar and
Company Change Radar are designed but not built; identity extraction routes
anything it cannot resolve to `needs_review` rather than guessing.

**No X integration.** The X Sourcing Engine is specified and not implemented.
When it exists it will require the reviewer to supply their own X API
credential, and it will remain optional: the rest of the application will work
without it.

**Scoring architecture: Screening is live on read, the rest is dormant.**
`lib/scoring/` is pure deterministic TypeScript. The Screening path runs on the
real 39-company corpus through `lib/screening-read`; every other component is
exercised only by synthetic fixtures. By component:

- *Live in production (read-time only):* the Screening criterion / dimension /
  Thesis Fit calculation and the **evidence-sufficiency** gate
  (`SCREENING_EVIDENCE_SUFFICIENCY`), calibrated and final-test validated
  across three sealed cohorts (Phase 5C). These compute deterministically from
  the tracked human analytical inputs each time a page is read. They produce a
  raw Fit number and a display-sufficiency state, never a rank, a band, a
  Priority, or a persisted snapshot. The evidence-sufficiency calibration is
  against sealed human-judgment cohorts, not against realised investment
  outcomes.
- *Implemented but dormant and unvalidated:* Underwriting Thesis Fit, Temporal
  Momentum, and Signal Convergence. The engines are complete and unit-tested;
  their parameters (weights, anchors, half-lives, thresholds) are unvalidated
  hypotheses pending backtesting. Momentum and Convergence are deliberately not
  surfaced as production decision metrics anywhere in the product.
- *Not implemented:* Action Priority as a decision function
  (`PRIORITY_THRESHOLDS_ACTIVE` is `false`; only a provisional `PriorityState`
  enum exists), the Underwriting-entry function, and any conventional numerical
  company ranking - which Phase 6A decided this product should not build.
- *Does not exist:* a **Trust engine**. Evidence Coverage and Evidence
  Confidence are separate outputs and are never collapsed into a single Trust
  metric. The composite-Priority / relevance-tier / Trust block in
  `config/scoring.yaml` is a retired vestige, read by no code.

**No backtest results.** The historical cutoff rule is implemented and tested.
The Backtest Lab that would use it is not built, and no result is claimed.

**No Underwriting-entry function.** The 39-subcriterion Underwriting scoring
methodology is implemented; the function that would let an analyst *commit* to
Underwriting from Screening output is not, and entering Underwriting remains an
explicit human decision.

**No pipeline persistence.** `PipelineRecord` and `PassRecord` define the domain
model. Nothing is stored, because no storage layer is present.

**No relationship graph, founder engagement, or analyst lab.**

## Limitations of what does exist

**Schemas may change.** The canonical objects carry a `schemaVersion` precisely
because they are expected to evolve before a first release. Ingesting the real
Batch 1 corpus took the schema to version 4 (`EvidenceClaim` gained
`supportingSourceIds`, `evidenceStatus`, `analystInterpretation`,
`diligenceQuestion`, `researchAssessmentId`; `SignalEvent` gained `eventStatus`;
`SourceType` gained `investor_industry`; `Company` gained `notes`). The Phase 3D
hardening pass took it to version 5: `SourceRecord` gained `supportRole` and
`SourceType` gained `customer_vendor`; `Company` gained `operatingOriginYear`
so a project origin that predates the current legal entity is not lost; and
`EvidenceClaim` gained `hardeningRef`, a deterministic pointer to the directive
that split a compound assessment or derived a rounded figure. Batch 2 ingestion
took it to version 6: `SignalType` gained `security_incident`, and
`EvidenceClaim.sourceId` became nullable so a pure analyst assumption with no
source relationship carries no source at all instead of an arbitrary anchor.
Later batches will surface more.

**The default thesis is a starting point, not a finding.** The weights in
`config/thesis.yaml` are a reasoned independent analyst framework. They have
not been validated against outcomes, because validating them is what the
Backtest Lab is for. Until that work is done, the weights are a hypothesis.

**The banned-name guard is word bounded, not exhaustive.** It detects the
specific terms listed in `lib/policy/banned-names.ts`. A term not on that list
will not be caught. The list is deliberately narrow to avoid flagging ordinary
English words, and that narrowness is a real limitation as well as a design
choice.

**The secret scan matches known credential formats.** A credential in a format
not listed in `lib/policy/rules.ts` would pass. The scan reduces risk; it does
not eliminate it, and it is not a substitute for never committing a credential.

**The manifest proves files are unmodified, not that they are correct.** A hash
match confirms a generated file has not been edited since generation. It says
nothing about whether the research that produced it was sound.

**Cutoff eligibility is only as good as the availability evidence.** The rule
correctly excludes anything published or demonstrably available after a cutoff.
It depends on `availabilityDate` being established from a real source timestamp
rather than assumed. Nothing in this repository can verify that an
`availabilityDate` was honestly derived; the schema can only require that one
exists. A later phase must record, per source class, what kind of timestamp
established it.

**The backtest-eligible corpus will be smaller than the screening corpus.**
Records whose historical availability cannot be demonstrated carry a null
`availabilityDate` and are excluded from every historical test. All 67 Batch 1
events happen to carry an intrinsic source timestamp, so all 67 are
historically admissible in principle; this reflects a deliberately
dated-source-only event selection, not a general rate, and later batches with
undated company pages will exclude a larger fraction.

**Signal half lives are unvalidated.** The values in `config/signals.yaml` are
reasoned starting points, not findings. They have not been tested against
outcomes and should be treated as calibration hypotheses until the Backtest Lab
can evaluate them.

## What this project does not claim

It contains no investment recommendation. It makes no claim about any company.
It is not investment advice. Its investment framework is independent and is not
affiliated with, endorsed by, or derived from the methodology of any investment
firm.
