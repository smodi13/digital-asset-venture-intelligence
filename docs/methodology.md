# Methodology

This document describes what is implemented today. Planned functionality is
listed in `docs/limitations.md` and is deliberately not described here as
though it exists.

Implemented in this phase: the canonical schemas, the provenance
classification, the explicit-unknown policy, the historical cutoff rule,
configuration validation, and deterministic hashing.

## 1. Canonical schemas

Eleven objects describe everything the system reasons about: `SignalEvent`,
`Company`, `Person`, `EvidenceClaim`, `SourceRecord`, `PipelineRecord`,
`PassRecord`, `ThesisConfiguration`, `ScoreSnapshot`, `HistoricalOutcome`, and
`OutreachDraft`.

Zod is the single schema authority. Every TypeScript type is derived from its
schema with `z.infer`, so there are no handwritten interfaces that could drift
out of step with validation. Each record carries a `schemaVersion`, and identity
is always a stable id, never a position in an array.

`SignalEvent` is the normalization target for every discovery source. Whatever
produces a signal, the rest of the system sees the same shape, which is what
lets a failing source degrade into missing rows rather than a broken page.

`SignalEvent` carries three separate dates plus the date of the underlying
occurrence. See section 4.

Two fields are deliberately absent. There is no `cutoffEligible`, because
eligibility depends on the cutoff being asked about and a stored flag would go
stale. There is no `adjustedStrength`, because adjusted strength depends on the
active thesis and on elapsed time. Anything thesis-dependent or time-dependent
is recomputed rather than persisted.

## 2. Provenance classification

Every material value carries one of five classifications:

| Classification | Meaning |
| --- | --- |
| `sourced` | Taken from a source. Carries a subtype saying who is vouching for it: `reported_fact`, `company_reported`, or `third_party_estimate`. |
| `derived` | Computed from other values. Records the input ids and the named calculation. |
| `assumption` | Chosen by the analyst. The basis is mandatory, and sensitivity testing defaults to required. |
| `estimated_range` | Bounded but not pinned. Carries `low`, `high`, and the basis for the bounds. |
| `unknown` | Not established. |

There is one vocabulary. Reconnaissance of earlier work found three
incompatible ones in circulation, and reconciling them after the fact is harder
than choosing once.

Separately from classification, each value carries a confidence level and a
model eligibility flag (`model_input`, `context_only`, or `caveat`) that
governs whether it may drive a calculation. Eligibility defaults to
`context_only`, so nothing feeds a model by accident. After the Phase 3D
evidence-hardening pass the corpus carries **zero** `model_input` claims: a
company-reported metric, a derived or rounded figure, a lower bound, an
unknown, or a qualitative label is not a quantitative underwriting input, and a
dedicated model-readiness extraction belongs to the later underwriting phase.

`company_reported` stays `company_reported` when an outside publication repeats
it. `third_party_estimate` stays an estimate. A journalist writing "the company
says ARR is $100M" does not make the ARR an independently established fact.
Independent origin is reserved for the case where an outside party's own
reporting is the source of a fact of record: a deal-structure detail a reporter
uncovered, a negotiation a reporter established, a historical fact a reporter
reported.

Each `SourceRecord` also carries a `supportRole` (added in Phase 3D) recording
what the source does for the company it supports, as distinct from its source
class. The same class of publication can corroborate a financing on one company
and only provide background on another.

## 3. The explicit-unknown policy

A value that is not established is `null`. It is never `0`, never the empty
string, never `"N/A"`, and never a sentinel phrase. The interface may show a
reader "Unknown"; the domain object stays null.

Two structural properties enforce this rather than leaving it to discipline.

`Datum<T>` is a discriminated union, so reading `.value` on an arbitrary datum
yields `T | null` and the compiler requires the null branch to be handled.

An estimated range has no scalar value at all: its `.value` is `null` and the
bounds live in `low` and `high`. A midpoint may be carried for display, but
because it is not in the value position, code that reads `.value` cannot pick
it up and quietly treat a range as a fact. Turning a range into a point
estimate has to be a deliberate, visible act.

An unknown value cannot raise a score. The confidence multiplier for `unknown`
is required by configuration validation to be exactly zero.

## 4. The historical cutoff rule

### Three dates, three questions

| Field | Question it answers |
| --- | --- |
| `publicationDate` | When does the source say it published? |
| `availabilityDate` | When is this exact information demonstrated to have been publicly available? |
| `ingestedAt` | When did this pipeline actually read the record? |
| `eventDate` | When did the underlying thing happen? |

`publicationDate` is what a source **says**. `availabilityDate` is what can be
**demonstrated**. They are usually the same and sometimes are not: an undated
page whose earliest archived snapshot is months after its claimed date has a
publication date it asserts and an availability date that can be proved.

`ingestedAt` is audit metadata. It records when this project read something and
is never used to decide what the past could have known.

### The rule

For a backtest, an event is eligible at a cutoff when:

```
publicationDate <= cutoff  AND  availabilityDate <= cutoff
```

Both comparisons are inclusive. `ingestedAt` takes no part.

Requiring both to precede the cutoff means a source cannot buy eligibility by
asserting an early date, and cannot lose it merely because this project found
it late.

### What the backtest is actually asking

The question is what information was publicly available on a past date. It is
**not** whether this particular software happened to be running then.

A press release publicly available in June 2024 and read by this pipeline in
September 2026 was available to any investor in December 2024. A December 2024
backtest may use it. Excluding it would measure the age of the project rather
than the quality of the framework.

### Two withdrawn rules

An early design used `min(publicationDate, observationDate) <= cutoff`, where
`observationDate` meant "when this pipeline saw it". That admitted information
published before a cutoff but not seen until after it.

The correction to `max(publicationDate, observationDate) <= cutoff` closed that
leak and introduced the opposite error: it excluded genuinely historical
evidence merely because this project read it recently.

Both are permanently withdrawn. The current rule is tested against both failure
directions, because a fix in one direction that breaks the other is not a fix.

### How an availability date is justified

`availabilityDate` on its own is not auditable: a date with no explanation is
indistinguishable from a guess. Every event therefore carries an
`availabilityEvidence` block recording which kind of timestamp established the
date and where it can be checked.

| Method | Establishing timestamp |
| --- | --- |
| `regulatory_filing_timestamp` | A regulator or registry filing |
| `intrinsic_timestamp` | The source's own publication timestamp |
| `platform_event_timestamp` | A platform `created_at`, such as a forum post |
| `repository_event` | A commit, release, or star event |
| `archive_snapshot` | An archived capture, with the archive URL retained |
| `manual_verified` | A human check, which requires a stated note |
| `not_established` | Availability could not be demonstrated |

The schema enforces one rule absolutely: a non-null `availabilityDate` must
carry a method other than `not_established`, and a null date must carry
`not_established`. There is no way to record a historical date without saying
why it is defensible, and `manual_verified` without a note is rejected, because
a human assertion with no stated basis is the weakest evidence wearing the
label of the strongest.

### Failing closed

Any missing, malformed, or uninterpretable date makes an event ineligible.
Nothing is defaulted or repaired into an eligible value.

In particular, `availabilityDate` is **never filled in from
`publicationDate`**. That convenience would destroy the distinction the two
fields exist to draw. Where historical availability cannot be established,
`availabilityDate` is null and the event is not backtest eligible.

Being wrong toward exclusion costs recall. Being wrong toward inclusion
silently invalidates the backtest, so the failure direction is fixed.

### Two different subsets

A record with a null `availabilityDate` is perfectly good **current screening**
evidence and is not admissible in a **historical test**. The current screening
set and the backtest-eligible set are therefore different, and the second is
smaller. That is correct rather than a defect, and the Backtest Lab will report
what share of the corpus is historically admissible at all.

`isBacktestAdmissible()` separates "not available yet at this cutoff" from
"never admissible at any cutoff".

### `eventDate` is not part of the rule

`eventDate` describes when the underlying thing happened. A round closed in
January and announced in April was not knowable in February: occurrence and
availability are different questions.

### Ingestion integrity

`ingestedAt` is only useful if it is true, so the ingestion boundary in
`lib/domain/ingest.ts` is the only supported way to create a `SignalEvent`, and
it is enforced three ways:

1. **Type.** Adapters produce a `SignalEventDraft`, whose type has no
   `ingestedAt` field. Passing one is a compile error.
2. **Runtime.** Any `ingestedAt` on an incoming object is stripped before
   stamping, so an untyped or JSON-shaped caller cannot smuggle one through.
3. **Clock.** The production entry point reads the clock itself and accepts no
   timestamp argument. There is no parameter to pass a false value to.

Deterministic fixture generation needs a fixed timestamp, which is a real
requirement and not a reason to weaken any of the above. It is served by a
separately named function that says in its own name that it is not for
production use, and a test asserts nothing outside `scripts/` and `tests/`
calls it.

A schema refinement additionally rejects an `ingestedAt` that precedes the
`availabilityDate`: information cannot be read before it exists.

Note that backdating `ingestedAt` would corrupt the audit trail and change no
backtest result, which is asserted by test.

### Test coverage

`tests/cutoff-leakage.test.ts` pins the rule with 45 tests: the enumerated
cases A to H, 18 invalid-date cases across both dates, an exhaustive table over
every offset pair from two days before to two days after the cutoff (asserted
against the logical AND rule, against `max(publication, availability)`, and for
invariance under `ingestedAt`), and filtering regressions proving that a
late-ingested but historically available event **does** change the eligible set
and its hash, while an event whose demonstrated availability postdates the
cutoff **does not**.

## 5. Configuration validation

The investment methodology is data, not code. Four documents describe it:

- `config/thesis.yaml`, the investment criteria and dimension weights
- `config/signals.yaml`, what each observable signal is worth and whether it decays
- `config/scoring.yaml`, the mirrored dimension weights, the negative
  specification, and a retired vestigial composite-Priority / relevance-tier /
  Trust block kept only for schema and hash stability (no engine reads it; see
  section 12)
- `config/sources.yaml`, source classes and their reliability priors

Every document is validated through Zod on load. Bad configuration throws.
Nothing is repaired, defaulted, or ignored, because a silently corrected weight
becomes a scoring error that cannot be found afterwards.

Validation includes cross-document checks, which is where drift actually
happens. The dimension weights in `thesis.yaml` and `scoring.yaml` must agree
exactly. Every signal a thesis references must be defined. Every source class a
signal accepts must exist. A signal requiring corroboration must accept at
least one source class capable of corroborating.

Two rules encoded in configuration are worth stating directly.

**Facts endure, events decay.** See section 9. Every signal definition is a
temporal event and is required by schema to declare a half life. A definition
marked as not time sensitive is rejected, because that is how an enduring fact
would be smuggled into the event stream to avoid decay.

**Some quantities may never raise a score.** `config/scoring.yaml` carries an
explicit negative specification listing what must not automatically increase an
investment score: follower count, virality, investor followers, writing-style
confidence, unsupported social popularity, the number of articles repeating one
announcement, and total capital raised. Each entry states its reasoning. Later
scoring engines will be tested against this list rather than trusted to have
avoided it.

## 6. Deterministic hashing

Configuration documents and input id sets hash to stable values.

Object key order does not affect a hash: a configuration is a set of facts, not
a byte sequence, and a formatting change must not invalidate stored results.
Array order does affect a hash, because array order carries meaning here.
Changing any real value changes the hash. Non-finite numbers throw rather than
serialising to `null`, so a `NaN` weight cannot silently hash the same as a
missing one.

`ScoreSnapshot` records a thesis configuration hash and an input hash, so a
score computed later can be tied to exactly the configuration and exactly the
inputs that produced it. No score is computed in this phase; the infrastructure
that will make scores reproducible exists and is tested.

## 7. Generated data and the manifest

Datasets are produced by scripts, not written by hand, and `data/generated/`
carries a `MANIFEST.json` recording each file's path, schema version,
generation timestamp, generating script, record count, and SHA-256.

Verification recomputes each hash. A mismatch is a failure with no repair path:
if the bytes changed, either regenerate the data or explain why it was edited.
This is what makes "the data is generated, not hand written" a checkable claim
rather than an assurance, which matters because a hand-edited number inside a
generated file is indistinguishable from a sourced one.

## 8. Policy guards

Four guards run over every text-bearing file through one shared walker:

- no em dash (U+2014)
- no prohibited firm or prior-brand name, matched word bounded and never as a substring
- no credential-shaped value, with documented placeholders excluded
- no local absolute path in public deliverables

Each guard has a paired negative test that plants the violation it is supposed
to detect in a temporary directory and asserts the guard fires. A guard that
passes on a clean tree proves nothing on its own.

## 9. Facts and events

**Facts endure. Events decay.**

`SignalEvent` is an event stream. Every entry records something that happened at
a point in time and therefore loses information value as it ages.

An enduring fact is a different kind of thing. A founder's background, a granted
regulatory approval, a company's product category, and the identity of a sitting
executive are as true now as when first recorded.

Putting an enduring fact into the event stream forces a choice between two wrong
answers. Decay it, and the most durable evidence in the corpus fades for no
reason. Exempt it from decay, and the event stream quietly becomes a mixed store
whose ageing rules vary per row.

The resolution is that enduring facts are not signals. They live on the objects
they describe and feed Thesis Fit directly, while the corresponding **event**
lives in the signal stream and feeds momentum.

| Enduring fact | Where it lives | Corresponding event |
| --- | --- | --- |
| Founder background | `Person.companyTenures`, `priorCompanies`, `education` | `founder_activity` |
| Regulatory approval status | `EvidenceClaim` with topic `regulatory` | `regulatory_milestone` |
| Product category | `Company.sector`, `Company.subsector` | `product_launch` |
| Executive identity | `Person.currentRole`, `Person.companyTenures` | `executive_hire` |

The mapping is declared in `ENDURING_FACT_HOMES` in
`lib/schemas/signal-event.ts` and asserted by `tests/config.test.ts`: no
enduring fact key may appear as a signal id, and every enduring fact must name
both a home and a corresponding event that does exist in the stream.

An earlier version of `config/signals.yaml` marked `founder_activity` and
`regulatory_milestone` as enduring. That conflated the two ideas. A founder's
history does not decay, but the observation that a founder shipped something
last week certainly does, and it is the second that a momentum score is asking
about. Likewise, an approval once granted stays granted, but the moment a
company clears a regulatory barrier is a dated event. Both are now time
sensitive, and the enduring halves live on the records above.

### Half lives are calibration hypotheses

The half lives in `config/signals.yaml` are reasoned starting values, not
findings. None has been validated against outcomes, because validating them is
what the Backtest Lab is for. They range from 120 days for founder activity,
the signal most about right now, to 730 days for a regulatory milestone, which
stays informative about a company's trajectory far longer. They are recorded in
configuration so they are visible and adjustable, and they should be reviewed
once a real corpus exists.

## 10. The research pipeline

The corpus is generated, never hand written. `research/input/*.yaml` is edited
by people; `data/generated/` is produced by `npm run research` and is never
edited by hand.

```
Research input -> Source validation -> Company resolution ->
Evidence normalisation -> Event extraction -> Ingestion boundary ->
Deduplication -> Corpus validation -> Search index -> Manifest
```

### Entity resolution

Deterministic, ordered strongest first, and the first hit wins:

1. A canonical id supplied by research
2. An exact normalised domain
3. A subdomain match at a dot boundary
4. An exact alias
5. An exact normalised name, capped below the auto-resolve threshold
6. A bounded fuzzy match, within one character on a name of six or more
7. Unresolved

Two rules do most of the work. **Domain matching never uses substrings**: a
dot boundary is required, so `notacme.example` does not match `acme.example`.
And **a domain that matches nothing does not fall through to a name match**,
because falling through is how a record about one company gets attached to
another that happens to share a word.

Ambiguity is a refusal rather than a weak answer. When two companies match, the
resolver returns every candidate and resolves to none. A wrong merge is
unrecoverable: once two companies share an id, nothing downstream can tell they
were ever separate. An unresolved record costs one review-queue entry. The
asymmetry is large, so the resolver declines whenever evidence is thin.

Name normalisation and domain normalisation are deliberately different
operations. Name rules strip corporate suffix words, because "Acme Inc" and
"Acme Labs" are usually one company. Domain rules do not, because `acme.ai` and
`acme-labs.io` are usually two.

### Deduplication

Union-find over **strong identity keys only**: a canonical domain, a
source-assigned record id, a verified organisation identifier. Similar names,
overlapping descriptions, and one record mentioning another never merge
anything. Records that share a normalised name but no strong key are reported
as a collision and kept separate.

### Source independence

Two records are the same voice when they are the same source, when one derives
from the other, when they share an origin, when both are reproductions of a
company announcement, or when the source class cannot corroborate at all.

Ten outlets carrying one press release count as one independent source, not
ten. `config/scoring.yaml` names counting reproductions as something that must
never raise a score; `lib/research/independence.ts` is where that is enforced.

**Publisher independence is not claim independence.** This is a company-level
count. Whether a *claim* has an independent origin is a narrower question,
answered per claim: the claim must be a `reported_fact` whose primary citation
is independent journalism or a regulatory record. A company-announced round
headline repeated by two outlets is one company-origin fact with external
coverage, not two independent origins. `research-summary.json` reports the
claim-level counts (`claimSupport.*`) separately from the legacy company-level
`evidenceCoverage.companiesWithTwoIndependentSources`, and neither is an
investment-confidence measure.

### The review queue

Records the pipeline cannot confidently process go to
`data/generated/review-queue.json` rather than into the corpus. A questionable
record is never forced in to improve coverage. Each item names the file, the
record, the problem, and the fix.

### Reported financing is not completed financing

A financing `SignalEvent` carries `eventStatus`. The default, `completed`,
means the round closed. `reported_unconfirmed` means a source reported a
possible round whose terms were not final. Such an event is kept as market
information, requires an `unconfirmedNote` stating what is unsettled, and is
routed to the review queue. It is never counted as capital raised, and a later
momentum engine must exclude it or weight it separately. Financing direction is
`ambiguous` regardless: raising capital is not a positive signal by itself.

### Reproducibility

The run timestamp is an input rather than a clock read, so the same research
input and configuration always produce a byte-identical corpus. Every generated
file carries the research run id, the configuration hashes, and a hash of the
research input tree, tying a corpus to the exact reviewed files that produced
it.

This uses the research-build boundary established earlier: the production
ingestion constructor still reads the clock and still accepts no timestamp
argument. Only the reproducible-build path supplies one.

### Corpus quality metrics

`data/generated/research-summary.json` reports counts, evidence coverage,
claims by provenance, events by type and source, and the share of events that
are historically admissible, broken down by source type.

These are **research QA metrics**. None of them is an investment performance
measure. The backtest admissibility rate in particular measures what the
sources support, not how good the framework is, and a low rate is a property of
the sources.

### Batch 1 real-data validation

The pipeline has been run against a first real research corpus: the 19 active
Batch 1 companies. Phase 3B/3C ingested 74 source records and 141 evidence
claims from 133 dimension-level assessments, plus 67 dated signal events. The
Phase 3D evidence-hardening pass then took the schema to version 5 and the
corpus to **104 sources and 199 evidence claims** (67 signal events unchanged):
it added 30 external sources, split eight compound assessments into atomic
claims under human-reviewed directives, added derived capital figures with
their inputs, integrated 15 research-issue resolutions, and recorded
claim-level support honestly. Every company resolves by exact domain, every
event passes through the ingestion boundary, generation is byte-identically
reproducible, and the policy scan is clean. No company is scored, ranked, or
recommended; this exercise validates ingestion, normalisation, provenance,
entity resolution, source independence, historical availability, search, and
the manifest, not any investment conclusion. The remaining company universe has
not been researched, and `docs/research-standard.md` is the protocol for it.

### Batch 2 real-data ingestion

Phase 4B ingested the human-researched Batch 2 packet: 20 more active companies
(**39 total**), 59 source records (**163 total**), 46 dated events (**113
total**), and 208 evidence rows (**407 total**), being 68 high-impact atomic
claims plus 140 analyst dimension assessments. A dimension assessment carries an
analyst reading, not a sourced fact: it is stored as an `assumption`-provenance
`EvidenceClaim` with the reading in `analystInterpretation`, the open question in
`diligenceQuestion`, and the packet's readiness label (`supported`,
`supported_with_caveat`, `blocked`, and so on) recorded in `notes` and mapped to
the canonical `supported | mixed | insufficient` vocabulary. Readiness language
describes evidence only and is never a score. These assessments carry **no
source**: the packet supplied no source relationship, so `sourceId` is null
rather than an arbitrary anchor. `EvidenceClaim.sourceId` was made nullable for
this (schema version 6): a source relationship now always means evidentiary
support. A sourced or derived claim still requires a source, a source-less claim
may carry no supporting sources, and the independent-origin metrics never treat
a source-less assumption as corroboration. Company-reported metrics stay
`company_reported` however many outlets repeat them; third-party estimates stay
estimates; primary financing stays distinct from secondary tenders; fal's
March 2026 financing talks stay `reported_unconfirmed`; `model_input` remains 0.
The schema also gained a `security_incident` signal type
(`direction: negative`, `category: risk`), because the three Batch 2 breach
disclosures had no honest home in the prior vocabulary. A positive growth or
funding event does not offset one. Both changes are additive but a version-5
consumer would reject a version-6 object, so the canonical schema version was
incremented 5 → 6, consistent with every prior enum-level change. The stale `Glean` banned-name entry was
removed: Phase 4A promoted Glean (`glean.com`) into the approved research
universe, so the premise for blocking the name no longer holds; no other banned
term or the matcher itself changed.

## 11. Company page snapshots

The storage and hashing model for a future Company Change Radar. No page is
crawled yet.

A public snapshot record holds hashes, a page type, a watched region
description, and metadata. It does **not** hold the page body: storing HTML
publicly would republish copyrighted content at scale. A research-time private
cache may hold HTML so a diff can be computed; it is gitignored and never
becomes a public fixture.

Comparison is done on the normalised text of a configured region, not the whole
page. A page's navigation, footer, and cookie banner change constantly and mean
nothing, so the answer is aggressive normalisation of a narrow region rather
than a cleverer diff. Everything the normaliser removes has to be configured
explicitly, so a real change is never hidden by a rule nobody chose.

Diff output carries capped snippets, counts, and a change magnitude. Never a
page body.

## 12. Analytical scoring architecture

`lib/scoring/` implements the scoring architecture as pure deterministic
TypeScript. No score is produced by a language model, no weight is buried in
engine code, and nothing in this module has been run on a real company. The
functions are exercised only by synthetic fixtures under `tests/scoring/`.

Digital Asset Venture Intelligence does not produce one opaque company score, and it does not
implement a conventional numerical company leaderboard. The Phase 6A
decision-architecture review concluded that it should not become one. It
produces separate analytical outputs at distinct layers, which are never
collapsed into a single score or ranking:

1. **Mandate Eligibility** - is the company in scope? (deterministic)
2. **Evidence Sufficiency** - do we have enough evidence to responsibly compare
   and evaluate the company? (deterministic; calibrated and active - the
   Screening evidence-sufficiency gate below)
3. **Screening Attractiveness** - what does the current evidence imply across
   the 14 Screening criteria? (Screening Thesis Fit: a continuous analytical
   output, never an eligibility threshold and never a ranking)
4. **Temporal Information** - what recent changes (Temporal Momentum) and
   independently corroborating signals (Signal Convergence) exist? (implemented,
   dormant, unvalidated on real companies)
5. **Action Priority** - what deserves analyst attention now? (human-owned;
   inactive; `PriorityState` is provisional workflow vocabulary only)
6. **Underwriting Commitment** - should an analyst commit deeper diligence
   resources? (a human commitment, subject to deterministic preconditions;
   the entry function is not implemented)
7. **Investment Decision** - what is ultimately pursued or passed? (human)

These are not layers of one pipeline that resolve to a number. Evidence
Sufficiency and Mandate Eligibility are deterministic preconditions; Screening
Thesis Fit informs analyst judgment but authorises nothing; Action Priority and
the final investment decision are human. A `PASS` at the Action Priority layer
("no analyst attention right now") is a distinct concept from a final
investment PASS.

The **fact / event firewall** runs across these layers: an `EvidenceClaim` is
an analytical fact consumed by Screening; a `SignalEvent` is a dated change
consumed by the temporal layers. A single underlying proposition must not be
rewarded more than once merely because it surfaces as an `EvidenceClaim`, a
Momentum event, and a Convergence proposition. Convergence already deduplicates
by underlying origin within a family (see below); a general cross-layer
firewall is not implemented here and Phase 6C will test the principle
empirically against the 39-company corpus.

The **conceptual state-machine** (architecture only - no enum or persistence
was added to mirror it): `DISCOVERED -> RESEARCHING -> {OUT_OF_SCOPE |
INSUFFICIENT_EVIDENCE} | SCREENED -> EVIDENCE_ELIGIBLE -> [human action
priority] -> [human Underwriting commitment] -> [human decision]`. The
transitions up to `EVIDENCE_ELIGIBLE` are deterministic; everything after is a
human decision.

### Two Thesis Fit layers

Thesis Fit has two explicitly separate analytical modes, tagged on every
result (`AnalyticalMode` in `lib/scoring/mode.ts`):

- **Screening Thesis Fit** (`lib/scoring/screening.ts`): public-observable,
  top-of-funnel prioritization. The same seven dimensions and weights, but 14
  criteria instead of 39, each judged from evidence that an outside-in public
  sourcing pass can actually reach. Screening is not an investment
  recommendation.
- **Underwriting Thesis Fit** (`lib/scoring/underwriting.ts`): the
  39-criterion deep diligence framework below. It requires materially deeper
  evidence than Screening.

A first real-evidence coverage calibration on the locked 10-company cohort,
scored against the 39-criterion framework, found underwriting evidence
coverage between roughly 0.01 and 0.30 for every company, so none met the
underwriting display or ranking thresholds. The response was not to weaken the
underwriting framework. The underwriting dimensions, subcriteria, weights,
anchors, coverage and confidence mechanics, and rank-eligibility calibration
defaults are unchanged. The calibration established instead that sourcing needs
its own lighter, public-observable Screening layer.

A Screening result and an Underwriting result are different analytical
objects. They are never averaged together, silently substituted for one
another, compared without their mode label, or persisted under an ambiguous
generic score type: `ScoreSnapshot` carries a required `analyticalMode`, and
`assertResultMode` / `assertCriteriaMatchMode` fail loud on any attempt to
feed one mode's criteria to the other's calculator. Both modes reuse the same
shared scoring mechanics (raw anchors, discrete coverage, the single
deterministic confidence engine, `effectiveReliability`, neutral 50 fill) and
the same business model archetype enum, which contributes zero points in
either mode.

There is **no Screening company ranking**. `SCREENING_RANK_ELIGIBILITY_CALIBRATION_DEFAULTS`
is a **retired vestige** of an earlier composite-score / ranked-queue design
(`retired: true`, `status: RETIRED - NO POST-EVIDENCE SCREENING RANKING
ARCHITECTURE`). Phase 6A confirmed there is no post-evidence Screening ranking
architecture and none is planned; the object is kept only so code and tests can
assert this explicitly. It must not be calibrated or replaced with a Fit
threshold. Priority, Temporal Momentum, Signal Convergence, conventional
ranking, and Underwriting entry remain inactive and unchanged. No real company
is scored, ranked, or prioritised.

The separate Screening **evidence-sufficiency** gate
(`SCREENING_EVIDENCE_SUFFICIENCY`) has, as of Phase 5C-H, completed
calibration, holdout validation, and an untouched final-test holdout, and is now
`calibrated` and `active` (`status: CALIBRATED_ACTIVE_FINAL_TEST_VALIDATED`).
Activation approves the evidence-sufficiency gate for future Screening
workflows only; it does not activate ranking, Priority, Momentum, Convergence,
or any automatic investment recommendation. Every numeric threshold was frozen
before any holdout analysis and none moved during calibration, validation, or
the final test.

#### Screening display sufficiency rule

`screeningDisplayState` (`lib/scoring/screening-eligibility.ts`) marks a
Screening Thesis Fit `INSUFFICIENT_EVIDENCE` when **either** overall evidence
coverage is below `0.30`, **or** fewer than **2 of the 7** Screening dimensions
reach `0.40` evidence coverage; otherwise the result is `SCREENED`. Below 0.30
overall coverage the framework is dominated by missing neutral-prior (50) fills,
and the dimension-breadth clause stops a company whose evidence is concentrated
in a single analytical area from showing a normal Screening result. This is a
**display sufficiency rule, not a positive investment threshold**: it says
nothing about whether the company is attractive.

#### Screening evidence-sufficiency gate

`evaluateScreeningEvidenceEligibility` implements the evidence-sufficiency
gate, frozen in `SCREENING_EVIDENCE_SUFFICIENCY`
(`status: CALIBRATED_ACTIVE_FINAL_TEST_VALIDATED`, `calibrated: true`,
`active: true`, `holdoutValidationCompleted: true`). A company has *candidate
evidence eligibility*
only when: mandate eligibility is `ELIGIBLE`; the Screening display state is
`SCREENED`; overall evidence coverage is at least `0.50`; overall scoring
confidence is at least `0.60`; at least **4 of 7** Screening dimensions reach
`0.50` coverage; **both critical Screening dimensions have nonzero evidence
coverage** (see below); and there is no unresolved **material** blocking conflict
affecting entity identity, mandate eligibility, or investment interpretation. A minor discrepancy does not
block; a blocking conflict is only inferred where the canonical contradiction
architecture marks it material and relevant, never from prose.

There is deliberately **no minimum Screening Thesis Fit score**
(`minScreeningThesisFit` is `null`). This gate decides whether the *evidence* is
sufficient for comparative screening, not whether the company is attractive;
changing the Fit value alone (40, 60, 90) cannot change the output when
coverage, confidence, dimension breadth, mandate, and conflict status are
unchanged. The evaluator reads no Fit score.

**Fit presentation policy.** Screening Thesis Fit is a continuous analytical
output. It is always shown with `analyticalMode = "screening"`, alongside its
Evidence Coverage and Evidence Confidence. It is not a deterministic
eligibility threshold. Digital Asset Venture Intelligence does **not** band Fit into
investment-quality categories (no `STRONG` / `SOLID` / `MARGINAL` / `WEAK` or
similar), does not sort or select companies by Fit in production logic, and
does not derive band edges from the current 39 companies. Any future
descriptive Fit diagnostics on that corpus must not silently become universal
investment-quality categories.

The candidate confidence floor is **0.60**, not 0.65: it is consistent with the
existing scoring reliability architecture and matches the underwriting
confidence gate (`RANK_ELIGIBILITY_CALIBRATION_DEFAULTS.minOverallConfidence`).
Screening evidence is often high-quality company-reported metrics that may be
freshness-adjusted, and coverage plus dimensional breadth are the principal
protection against sparse evidence. Every threshold above was frozen **before**
any holdout analysis.

#### Critical-dimension zero-coverage guard (Phase 5C-F-D)

The 15-company validation holdout was reviewed in full. The scoring engine,
evidence adapter, confidence architecture, coverage mechanics, neutral-prior
math, and every frozen numeric threshold behaved correctly. Validation exposed
one structural evidence-eligibility flaw: a company could become a rank-evidence
candidate while an entire **20%-weight** Screening dimension had **zero**
evidence coverage, leaving that dimension filled entirely by the neutral prior
(observed for Serval and Dust, both with `capital_efficiency` coverage `0.00`).

`SCREENING_CRITICAL_DIMENSION_EVIDENCE_GUARD` names `capital_efficiency` and
`growth_momentum` as explicit critical Screening dimensions - the two largest
top-level weights (`0.20` each). The two names are stated literally, not derived
from the weight table, so a future weight change cannot silently move the
eligibility methodology. Candidate evidence eligibility is **false** if either
critical dimension has `evidenceCoverage <= 0`, with an explicit failure reason
naming the missing dimension (`critical dimension capital_efficiency has zero
evidence coverage`).

This is a **structural zero-coverage veto, not a numeric threshold retune**. Any
coverage strictly greater than zero satisfies it: there is no positive minimum
(not `0.25`, `0.30`, `0.35`, `0.40`, or `0.50`). Granola (`capital_efficiency`
`0.20`) and LlamaIndex (`capital_efficiency` `0.30`, `growth_momentum` `0.25`)
remain eligible. The Phase 5C-G final-test holdout and its methodology review
found no unexplained rejection caused by this guard and justified no positive
minimum, so it remains a zero-coverage veto. All existing numeric thresholds
(`0.30` display coverage, 2 dimensions at `0.40`, `0.50` rank coverage, `0.60`
rank confidence, 4 dimensions at `0.50`, no minimum Screening Fit) remain frozen.
The critical dimensions remain exactly `capital_efficiency` and
`growth_momentum`.

**Evidence confidence is not evidence coverage.** Scoring confidence measures
confidence *in the covered evidence*; Evidence Coverage measures how complete
the company analysis is. The Phase 5C-D calibration made the distinction
concrete: one company reached 0.85 confidence on 6% coverage. The two stay
separate outputs and are never combined into a single trust score. Confidence
never substitutes for coverage.

#### Calibration and validation history

The Screening evidence-sufficiency architecture was developed against real
evidence in three sealed cohorts. No numeric threshold, criterion, weight,
scoring formula, or eligibility rule was changed by calibration, validation, or
the final test. The only structural change was the validation-discovered
critical-dimension zero-coverage guard described above.

- **Calibration cohort completed** (Phase 5C-D). Thresholds were frozen before
  any holdout analysis. Calibration made concrete that evidence confidence is
  distinct from evidence coverage (one company reached `0.85` confidence on
  `0.06` coverage).
- **Validation cohort completed** (Phase 5C-F). Full review of the 15-company
  validation holdout confirmed the scoring engine, evidence adapter, confidence
  architecture, coverage mechanics, and every frozen threshold behaved
  correctly. It exposed one structural flaw, fixed by the **critical-dimension
  zero-coverage guard** (`capital_efficiency`, `growth_momentum`). After the
  guard, validation was **8 candidate-eligible / 7 ineligible**.
- **Final-test cohort completed** (Phase 5C-G), on an untouched holdout. The
  frozen scoring run produced **14 companies: 10 `SCREENED` / 4
  `INSUFFICIENT_EVIDENCE`; 5 candidate-evidence eligible / 9 ineligible**. The
  five eligible companies are a diagnostic list of evidence eligibility only -
  not a ranking, not an investment recommendation, and not encoded anywhere as a
  production selection target. The final-test sample is empirically sparser than
  validation; the four display-suppressed companies do not by themselves
  indicate a methodology defect, and a lower eligibility rate is not a reason to
  lower thresholds. The system does not target a predetermined eligibility
  percentage.
- **Final-test methodology review: PASS** (independent, Phase 5C-G). No obvious
  methodology defect. The frozen architecture behaved coherently across
  validation and final test: sparse companies are suppressed by display
  sufficiency; evidence confidence stayed distinct from coverage;
  high-confidence but incomplete research can fail candidate evidence
  eligibility; Screening Thesis Fit does not control evidence eligibility; gate
  failures map to explicit frozen conditions; the critical-dimension guard
  created no unexplained final-test rejection; **no threshold change is
  justified from the final-test results**, and none was made.

**Final-test reporting clarifications** (Phase 5C-H). The deterministic
final-test calculations are valid; several narrative statements in the initial
report were corrected as follows:

1. *Coverage vs confidence.* The largest final-test coverage/confidence
   separation is **XBOW** (coverage `0.0300`, confidence `0.8500`, absolute
   separation `0.8200`), not Braintrust (`0.0800` / `0.8813` / `0.8013`).
2. *Dimensional breadth.* The four-dimensions-at-`0.50` requirement is
   independently binding for **0** final-test companies: no company clears
   overall coverage `>= 0.50` while failing the four-dimension requirement.
   Vercel and Lovable satisfy the four-dimension requirement but fail overall
   coverage (Vercel also fails the confidence floor; Lovable fails candidate
   eligibility solely because overall coverage is below `0.50`). E2B and Exa are
   not independently breadth-bound because they also fail overall coverage.
   Overall coverage and dimensional breadth are not mathematically identical,
   but breadth contributes zero unique final-test rejections. The breadth rule
   is retained.
3. *Confidence-only failure.* Companies below the `0.60` confidence floor:
   **Vercel, fal**. Companies failing candidate eligibility **only** because of
   confidence: **0**. Vercel also fails overall coverage; fal also fails overall
   coverage and dimensional breadth. No well-covered company fails on confidence
   alone.
4. *Modest Fit.* No subjective binary claim about "modest Fit" is made.
   Mechanically, the eligible-company Screening Thesis Fit range is
   `64.0875`-`72.5359`. Candidate evidence eligibility does not read Screening
   Thesis Fit; no Fit threshold is introduced.

**Current status.** The evidence-sufficiency gate is **calibrated and active**
(`SCREENING_EVIDENCE_SUFFICIENCY.status = CALIBRATED_ACTIVE_FINAL_TEST_VALIDATED`,
`calibrated: true`, `active: true`, `holdoutValidationCompleted: true`).
Evidence eligibility is distinct from investment attractiveness. Priority,
Temporal Momentum, Signal Convergence, ranking, and Underwriting remain
inactive and unchanged; the final-test results were not used for threshold
tuning.

#### Reviewed-but-excluded adapter behaviour

`adaptCriterionEvidence` honours `reviewedButExcluded` **before** any
qualifying-provenance classification, so an analyst can pass a reviewed but
excluded claim of any canonical provenance (including an untraceable derived
claim that would otherwise throw) straight into the adapter purely to audit it,
with no caller-side filtering. A reviewed-but-excluded claim is recorded in the
audit trace but is never scoring evidence: it produces no `CitedEvidence` and
cannot move confidence, coverage, effective reliability, or the adjusted score.
Whether it may still force a contradiction is decided separately: `assumption`,
`unknown`, `estimated_range`, and untraceable derived claims are audit-only and
cannot create a material contradiction alone; a `sourced` or valid-traceable
derived excluded claim may create a material contradiction only through explicit
canonical contradiction metadata linking it to an admitted qualifying claim for
the same criterion. Qualifying-evidence validation is not weakened: an
*admitted* untraceable derived claim still throws, and an admitted `unknown`
claim remains inadmissible.

`schemaVersion` on a persisted record versions the canonical research corpus
and stays at 6; it is unrelated to the scoring-domain types
(`AnalyticalMode`, the screening and underwriting result types), which are
application logic, not persisted research data.

### Underwriting Thesis Fit

Seven weighted dimensions (`config` in `lib/scoring/config.ts`): capital
efficiency and growth momentum at 0.20, founder alignment and market quality at
0.15, business model quality, go to market quality, and competitive position at
0.10. Each dimension has five or six subcriteria (39 in total: 5 each for
capital efficiency, growth momentum, and founder alignment; 6 each for market
quality, business model quality, go to market quality, and competitive
position) whose weights sum to exactly 1. All weight tables are validated on
module load, and a regression test in `tests/scoring/config.test.ts` locks the
7 dimensions and the 39-subcriterion total.

A raw subcriterion score is restricted to 0, 25, 50, 75, 100, or null
(`INSUFFICIENT_EVIDENCE`). Arbitrary values such as 63 or 88 fail validation:
this is an anti false precision rule. A numeric anchor with no cited supporting
or opposing claim also fails validation. Coverage is discrete: 0.0
insufficient, 0.5 partial, 1.0 sufficient. Assumptions and unknowns never raise
coverage.

Confidence is trust in the factual evidence, and it is not an analyst-entered
number. The analyst supplies judgment only (`AnalystCriterionAssessment`: the
rubric anchor, cited claim ids, unknowns, discrete coverage, rationale). The
confidence scalar is derived deterministically from the cited evidence by
`resolveConfidence` (`lib/scoring/confidence.ts`), which returns a
`ComputedCriterionEvidence` record. No public scoring API accepts a free
confidence override: `scoreCriterion` takes the analyst assessment and an
evidence descriptor, never a confidence number, and the assessment schema is
strict: a `confidence`, `computedConfidence`, `effectiveReliability`, or
`reliabilityCap` key on analyst input fails validation rather than being
silently stripped. A caller cannot cite weak evidence and assert
`confidence = 0.95`.

Confidence is modelled with typed reliability
classes that carry a base quality and a maximum cap (for example an independent
reported fact bases at 0.90 and caps at 0.95; a structured third party estimate
bases at 0.50 and caps at 0.70; assumption and unknown are 0). The strongest
class cap present bounds the aggregate, so evidence cannot be manually promoted
past its class however high a per-item quality is supplied.
Evidence sharing
one underlying origin is collapsed before aggregation, so publication count
never manufactures confidence. Genuinely independent origin groups combine as
`1 - product(1 - qi)`, then the reliability cap is applied. A deterministic
derived claim is `0.95 * min(input confidences)` and never exceeds its weakest
input. An unresolved factual contradiction multiplies confidence by 1.00
(none), 0.85 (minor), or 0.65 (material); ordinary mixed business evidence is
not a contradiction and takes no penalty. Freshness applies only to
time-sensitive current-state evidence and is configurable; enduring facts do
not decay.

Per criterion: `effectiveReliability = confidence * coverage`, and
`adjustedScore = 50 + effectiveReliability * (rawAnchor - 50)`. A null anchor
fills 50 internally and is never displayed as a real assessment. Dimension and
overall roll-ups are weighted sums, with confidence taken as a coverage
weighted mean over covered criteria. Display states (`INSUFFICIENT_EVIDENCE`,
`PROVISIONAL`, `SCORED`) keep a thinly evidenced number from reading as a
normal score.

### Business model archetypes

A typed enum (subscription software, usage consumption software, compute or
inference infrastructure, and so on). Archetype contributes zero points. It
only orients which economics and evidence are relevant. Archetype-aware is not
archetype-neutral: a structurally weak model is not normalised upward for being
normal for its type, and a model is not judged against the wrong yardstick.

### Temporal Momentum and Signal Convergence

Both are **implemented but dormant**: they have not been run on real companies,
and every parameter (event-family weights, impact anchors, diminishing weights,
half-lives, decay formula, deduplication, activation threshold, breadth target)
is an **unvalidated hypothesis** pending later diagnostics and backtesting.
None was changed in this reconciliation.

Momentum's intended role is **recent directional information** - not
fundamental company quality, mandate eligibility, evidence completeness, or
automatic investment priority. Convergence's intended role is **the breadth of
independently corroborating recent signals** - not fundamental company quality,
evidence coverage, mandate eligibility, or an automatic investment
recommendation.

Momentum outputs `positiveMomentum`, `negativeMomentum`, and `netMomentum`
separately, never a net value alone. Five weighted event families. An event
contributes `direction * impact * evidenceConfidence * 2^(-ageDays /
halfLifeDays)`. Funding alone contributes zero automatic positive momentum: an
ambiguous direction is 0, and an uncompleted or non-primary financing carries
no completed-capital benefit. Repeated underlying events are deduplicated. The
strongest three surviving contributions in a family are combined with
diminishing weights 1.00, 0.60, 0.35 and clamped to `[-1, 1]`.

Convergence uses seven families, deduplicates evidence by underlying origin,
and reports positive and negative convergence separately. Deduplication by
origin within a family is necessary but not sufficient: one atomic proposition
must not create breadth by being relabelled into several families.
`familyStrengthsFromPropositions` assigns each `propositionKey` to exactly one
primary family and collapses repeats of that proposition to one contribution,
so three publications of one fact stay one fact. Duplicate records for one
`propositionKey` must agree on primary family; a conflicting assignment throws
`ConvergenceFamilyConflictError` before convergence is calculated rather than
silently picking a family, because the evidence mapping is ambiguous. Two genuinely distinct propositions from the same publication may still
support two families. A family counts
toward breadth only at strength 0.25 or above. Positive convergence is
`100 * mean(active positive strengths) * min(1, activeCount / 3)`, so one
family cannot produce a high score.

### Canonical research evidence becomes scoring evidence deterministically

`lib/scoring/evidence-adapter.ts` is the only bridge from the canonical
research corpus (`EvidenceClaim` + `SourceRecord`) to the scoring confidence
engine. It exists so that neither Claude nor an analyst ever hand-picks a
scoring reliability class or a confidence number: `adaptCriterionEvidence`
maps the claims an analyst assigned to one Screening criterion into a
`ConfidenceResolutionInput` plus an audit trace, and the scoring formulas in
`confidence.ts` and `config.ts` run unchanged.

Research confidence metadata is not scoring confidence. `EvidenceClaim.confidence`,
`EvidenceClaim.evidenceStatus`, `SourceRecord.reliability`, and `SourceRecord.tier`
are never read by the adapter and cannot alter a mapped reliability class or
raise computed confidence. The Phase 5 reliability classes and their base/cap
table stay authoritative.

Admissibility is decided by provenance. An `assumption`, `unknown`, or
`estimated_range` claim is inadmissible for positive or negative scoring
coverage. A `derived` claim is admissible only when it carries explicit,
resolvable canonical input claim ids; a derived claim without them raises
`UntraceableDerivedClaimError`, and dependencies are never inferred from prose,
source urls, `researchAssessmentId`, or notes. Schema v6 has no field for those
input ids, so every real v6 derived claim is inadmissible for real scoring.

Company-reported claims retain a single company origin across publications. A
`company_reported` KPI carried by the company blog, TechCrunch, Forbes, and an
investor blog is still one `company:<companyId>` origin, and repetition never
promotes it to an independent reported fact. For non-company evidence the
adapter follows `SourceRecord.originatesFrom` to its root (failing loud on a
cycle), collapses a company-origin press-release reproduction to the company,
and fails loud rather than treating an ambiguous non-company reproduction as
independent.

The Screening currentness policy is fixed in the adapter. Freshness is
disabled for `observable_scale_vs_primary_capital` (which may rest on completed
historical capital facts) and `founder_problem_fit` (enduring background); it
is enabled for the other twelve Screening criteria, which evaluate a current
company state. When it is enabled the observation date is the first present of
`metricAsOfDate`, `publicationDate`, `lastVerified`, aged against the caller's
scoring as-of date; a missing or future date fails loud.

### Underwriting comparative evidence eligibility, Action Priority, and the firewall

`evaluateRankEligibility` is a pure function and a **deterministic Underwriting
analytical-mode comparative evidence gate**, not a company ranking and not the
human Underwriting-entry decision. Any such comparative evidence eligibility is
conceptually downstream of Underwriting analysis and must not be conflated with
the human commitment of diligence resources described under *Underwriting
handoff* below. Its thresholds are
`RANK_ELIGIBILITY_CALIBRATION_DEFAULTS` (rank-eligibility calibration defaults),
not finalized investment policy: they
require an eligible mandate, overall coverage at least 0.65, overall confidence
at least 0.60, at least five of seven dimensions covered to 0.50, every
dimension weighted 0.15 or more covered to 0.35, and no material blocking
conflict on entity identity, mandate eligibility, or investment
interpretation. A minor non-investment identity discrepancy, such as a disputed
founding year, does not block it.

**Underwriting handoff.** Screening evidence eligibility and Mandate
eligibility are deterministic preconditions. Screening Thesis Fit informs
analyst judgment but does not automatically authorise Underwriting. Action
Priority may later inform workflow but does not automatically authorise
Underwriting. Entering Underwriting is ultimately an explicit human commitment
of diligence resources. The Underwriting-entry function is not implemented in
this phase, and the 39-subcriterion Underwriting methodology is unchanged.

**Action Priority is human-owned and inactive.** The `PriorityState` enum
exists (`OUT_OF_SCOPE`, `RESEARCH`, `ESCALATE`, `MONITOR`, `PASS`) as
provisional workflow vocabulary; `PRIORITY_THRESHOLDS_ACTIVE` is `false` and no
automatic Escalate / Monitor / Pass decision function exists. `PASS` here means
"no analyst attention right now" and is **not** a final investment PASS - a
future action-priority state and a final investment decision are distinct
concepts. Human ownership of the action decision remains even if a suggestion
model is later calibrated.

**Any future deterministic Priority suggestion requires fresh data.** It may
not reuse the current 39-company corpus or the Phase 5C final test. It requires
a new non-overlapping company dataset, a frozen human-label rubric fixed before
evidence review, independent diligence-priority labels, score-stripped evidence
packets, labellers who did not design the thresholds, and separate calibration
/ validation / final-test folds.

**Status of the current 39-company corpus.** It may be used for architecture
exploration, descriptive diagnostics, hypothesis generation, rubric drafting,
and testing deterministic plumbing. It is **consumed** for the purpose of
validating any future post-Screening threshold architecture: it must not be
reused as independent calibration, validation, or final-test evidence for that
work, and the Phase 5C final test can no longer serve as an untouched final
test.

No real-company Thesis Fit, Momentum, Convergence, ranking, or Priority state
has been generated or persisted. `snapshots.json` holds zero records, and a
regression guard in `tests/scoring/firewall.test.ts` proves no scoring artifact
reached the research corpus.
