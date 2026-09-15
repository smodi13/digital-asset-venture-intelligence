# Research input guide

How to populate the company universe.

This document is the contract between research and engineering. Research fills
`research/input/*.yaml`; `npm run research` turns those files into the
validated corpus in `data/generated/`. Nothing else writes generated data, and
nothing hand-edits it.

## The two directories

| Directory | Who writes it | What it holds |
| --- | --- | --- |
| `research/input/` | People | Hand-authored YAML, reviewed and diffed in Git |
| `data/generated/` | `npm run research` | Validated JSON, hashed in `MANIFEST.json` |

Never edit `data/generated/` by hand. A hand-edited number inside a generated
file is indistinguishable from a sourced one, and the manifest hash check will
fail the build anyway.

## Five files

| File | Contents |
| --- | --- |
| `companies.yaml` | The universe. One record per company. |
| `sources.yaml` | Every URL cited anywhere. Must be filled first. |
| `evidence.yaml` | Checkable claims about companies. |
| `events.yaml` | Things that happened at a point in time. |
| `headlines.yaml` | Headlines for the deterministic classifier. |

Fill `sources.yaml` first. Every URL used elsewhere has to exist there, and a
citation to a missing source goes to the review queue rather than being
silently dropped.

## 1. Company input

```yaml
- name: "Example Company"
  domain: "example.com"          # The strongest identity. Supply it if it exists.
  aliases: ["Example", "Example Inc"]
  sector: "Application software"
  subsector: "Finance operations"
  stage: series_b                 # pre_seed | seed | series_a..series_d_plus | growth | bootstrapped | unknown
  headquarters: "Columbus, Ohio"
  foundingYear: 2018              # null when not publicly disclosed
  founders:
    - name: "Given Family"
      role: "Chief executive"
      priorCompanies: ["Prior Company"]
      github: null
      linkedin: null
  knownInvestors: ["Example Partners"]
  description: "One or two sentences on what the company sells and to whom."
  reasonSourced: "Why this company entered the universe at all."
  researchStatus: approved
  sourceUrls:
    - "https://example.com/newsroom/post"
  isPrivate: true
  firstObservedAt: "2025-02-10"
  notes: "Reconcile cumulative funding before model use."   # Reviewer-facing diligence flags, or null
```

**`notes`** carries a researcher's diligence flags on the record: a metric to
reconcile, a business-model boundary, a stale estimate. It is passed through to
the generated corpus so a reviewer sees it, and it is never a scoring input.

**Supply a domain wherever one exists.** It is the only identity that cannot be
ambiguous. A company with no domain can only be referenced by name, and a
name-only reference falls below the auto-resolve threshold.

**`isPrivate: false`** only when the company has listed or been acquired.
Private status has to be re-verified; it is not assumed.

## 2. Research status

Where a record sits in the RESEARCH workflow. This is not the investment
pipeline stage.

| Status | Meaning | Enters the corpus |
| --- | --- | --- |
| `seeded` | Name captured, nothing verified | No |
| `in_research` | Being worked on | No |
| `reviewed` | Checked, not yet signed off | No |
| `approved` | Signed off | **Yes** |
| `excluded` | Deliberately out of scope | No |

Only `approved` companies reach `data/generated/`. The build reports how many
were excluded, so a small corpus is visible rather than mysterious.

## 3. Source input

```yaml
- url: "https://newswire.example/story"
  publisher: "Example Newswire"
  title: "Headline as published"
  sourceType: independent_journalism
  publishedAt: "2025-11-04"
  isPressReleaseReproduction: true
  originatesFromUrl: "https://example.com/newsroom/post"
  termsNote: "Wire reproduction of the company announcement."
```

Source types, strongest first: `regulatory`, `official_company`,
`founder_or_executive`, `independent_journalism`, `specialist_industry`,
`investor_industry`, `structured_secondary`, `identified_social`, `community`,
`analyst_inference`.

**`investor_industry`** is an investor, fund, or portfolio publication writing
about a company it has backed. It is an interested party, not independent, and
it never corroborates a claim about its own portfolio company. Use it rather
than `specialist_industry` for a backer's post.

**`originatesFromUrl` is the field that makes corroboration honest.** Set it on
a wire copy pointing at the original announcement. Without it, ten outlets
carrying one press release look like ten independent confirmations, and the
scoring rules will treat them that way.

**`analyst_inference` is not evidence.** Use it so a conclusion drawn inside
this project is traceable. It never corroborates anything.

## 4. Availability evidence

The most important field to get right, and the easiest to fill in carelessly.

`availabilityDate` is the earliest date at which the information is
**demonstrated** to have been publicly available. It is not what the source
claims; it is what can be checked. Every event carries an
`availabilityEvidence` block saying how the date was established.

```yaml
availabilityDate: "2025-11-04"
availabilityEvidence:
  method: intrinsic_timestamp
  sourceUrl: "https://example.com/newsroom/post"
  sourceRecordId: null
  note: null
```

| Method | Use when |
| --- | --- |
| `regulatory_filing_timestamp` | A regulator or registry timestamped the filing |
| `intrinsic_timestamp` | The source carries its own publication timestamp |
| `platform_event_timestamp` | A platform recorded a `created_at`, such as a forum post |
| `repository_event` | A commit, release, or star event timestamp |
| `archive_snapshot` | An archived capture. Put the archive URL in `sourceUrl` |
| `manual_verified` | A human checked it. **A note is required** |
| `not_established` | Availability could not be demonstrated |

**If you cannot establish it, set the date to null and the method to
`not_established`.** Do not guess, and do not copy the publication date across.
The schema rejects a date with `not_established`, and rejects a null date with
any other method, so there is no way to record a historical date without a
stated basis.

A record with `not_established` is perfectly good **current screening**
evidence. It is simply not admissible in a **historical test**. Those are
different populations and the second is smaller. That is expected, not a
failure, and the build reports the ratio.

## 5. Evidence input

```yaml
- company: "example.com"          # Prefer the domain over the name
  claim: "An existing customer expanded to three business units."
  value: "three additional business units"
  numericValue: 3
  unit: "business_units"
  source: "https://example.com/newsroom/post"
  publicationDate: "2025-11-04"
  metricAsOfDate: "2025-11-01"    # What date the metric describes
  lastVerified: "2026-01-15"
  provenance: sourced             # sourced | derived | assumption | estimated_range | unknown
  sourceSubtype: company_reported # Required when provenance is sourced
  confidence: medium              # high | medium_high | medium | low | unknown
  modelEligibility: context_only  # model_input | context_only | caveat
  topic: "customers"
  notes: "Company stated. No independent confirmation."
  excerpt: null                   # Max 280 characters. Prefer the paraphrase.
  supportingSources: []           # More source URLs behind the same claim
  evidenceStatus: supported       # supported | mixed | insufficient, or null
  analystInterpretation: null     # Your reading, kept separate from the fact
  diligenceQuestion: null         # What must be settled before underwriting use
  researchAssessmentId: null      # Id of the research unit this claim came from
```

`sourceSubtype` is `reported_fact`, `company_reported`, or
`third_party_estimate`.

**`source` may be `null`, but only for a pure analyst claim.** A `sourced` or
`derived` claim always needs a `source`. An `assumption`, `estimated_range`, or
`unknown` claim for which the research supplied no source relationship should set
`source: null` (and `supportingSources: []`) rather than borrow an unrelated URL.
A source relationship means evidentiary support; do not assert one that does not
exist. The basis of a source-less claim lives in `analystInterpretation`,
`diligenceQuestion`, `notes`, and `researchAssessmentId`.

`modelEligibility` gates whether a value may drive a calculation in the
underwriting model. Default to `context_only`; use `model_input` deliberately.

**One research assessment can become several claims.** When a single sourced
statement contains materially separate facts (ARR, profitability, headcount,
funding), split it into atomic claims and give each the same
`researchAssessmentId` so the original unit stays traceable.

**`evidenceStatus` is an assessment, never a score.** `insufficient` is a
finding in its own right: the public record does not settle the question. It is
not turned into a number anywhere. `analystInterpretation` and
`diligenceQuestion` hold judgement and open questions, always separate from the
sourced `claim`.

**`supportingSources`** lists further source URLs behind the same claim. All
must appear in `sources.yaml`. Independence counting reads them alongside the
primary `source`.

**Record contradictions rather than resolving them silently.** Use
`contradictsClaims` with the exact claim text of the other record. Both claims
are kept and linked, and the pair goes to the review queue.

## 6. Facts and events

**Facts endure. Events decay.** Put each in the right file.

| Enduring fact | Goes in | Corresponding event | Goes in |
| --- | --- | --- | --- |
| Founder background | `evidence.yaml` / `companies.yaml` | Founder shipped something | `events.yaml` |
| Holds a regulatory approval | `evidence.yaml` | Approval was granted | `events.yaml` |
| Product category | `companies.yaml` | Product launched | `events.yaml` |
| Who the chief executive is | `companies.yaml` | Chief executive was hired | `events.yaml` |

Every record in `events.yaml` is a temporal event and decays. Putting an
enduring fact there would either fade the most durable evidence in the corpus
or force an exemption that makes ageing rules vary per row.

## 7. Event input

```yaml
- company: "example.com"
  signalType: enterprise_expansion
  category: demand                # demand | supply | team | capital | product | market | risk
  direction: positive             # positive | negative | neutral | ambiguous
  publicationDate: "2025-11-04"
  availabilityDate: "2025-11-04"
  availabilityEvidence:
    method: intrinsic_timestamp
    sourceUrl: "https://example.com/newsroom/post"
    sourceRecordId: null
    note: null
  eventDate: "2025-11-01"         # When the thing happened, if different
  source: "https://example.com/newsroom/post"
  evidenceSummary: "A paraphrased factual statement of what was observed."
  confidence: medium
  humanVerified: unverified       # unverified | verified | disputed | rejected
  interpretation: null            # Your reading, or null
  interpretationBasis: unknown    # evidence | inferred | assumed | estimated | unknown
  eventStatus: completed          # completed | reported_unconfirmed
  unconfirmedNote: null           # Required when reported_unconfirmed
  researchEventId: null           # Id from the originating research packet
```

Signal types are defined in `config/signals.yaml`. An undefined type goes to
the review queue.

**Negative security events are preserved.** A confirmed breach, unauthorized
access, or disclosed vulnerability with customer exposure is a
`security_incident` (`direction: negative`, `category: risk`). It stays visible
as negative evidence; a later positive growth or funding event does not cancel
it.

**A reported financing is not a completed one.** When a source only reports a
possible round with terms not final, set `eventStatus: reported_unconfirmed`
and say what is not settled in `unconfirmedNote`. It is kept as market
information, routed to the review queue, and never counted as capital raised. A
completed event needs no `eventStatus`; the default holds.

**Funding direction is `ambiguous`.** Raising capital is not a positive signal
by itself. Leave a financing event `ambiguous` unless the event itself carries
a separately classifiable operating fact.

**Do not supply `ingestedAt`.** The pipeline stamps it. There is no field for
it in the input schema.

**An interpretation must state its basis.** A record with an interpretation and
`interpretationBasis: unknown` is rejected.

## 8. Headline input

```yaml
- headline: "Example Company partners with a banking platform"
  publisher: "Example Trade Press"
  url: "https://tradepress.example/story"
  publicationDate: "2025-11-12"
  availabilityDate: "2025-11-12"
  availabilityEvidence:
    method: intrinsic_timestamp
    sourceUrl: "https://tradepress.example/story"
    sourceRecordId: null
    note: null
  companyHint: "example.com"
  summary: "A paraphrased factual summary."
  sourceType: specialist_industry
  confidence: medium
```

A deterministic phrase table proposes the signal type. No language model is
involved, and every classification can be explained by the phrase it matched.
A headline the table cannot classify confidently goes to the review queue, which
is the intended behaviour.

**`headlines: []` is valid.** A research batch that carries no separately
approved headline set leaves the file empty rather than manufacturing headlines
from evidence summaries. The adapter stays covered by fixtures in `tests/`.

## 9. Unknown handling

**Unknown stays null. It is never estimated, interpolated, or filled with a
plausible figure.**

- A founding year that is not disclosed: `foundingYear: null`
- An availability date that cannot be demonstrated: `null` plus `not_established`
- A metric with no public figure: omit the claim, or record it with
  `provenance: estimated_range` and a stated basis

Most private financial metrics are not public. That is the normal case. The
provenance system exists to record what is known and what is not, so a gap is
visible rather than papered over.

## 10. Content policy

Generated public data may contain a title, a publisher, a date, a URL, and a
paraphrased factual summary.

**Never paste an article body.** Where the exact wording genuinely matters, use
the `excerpt` field, capped at 280 characters by schema. Prefer the paraphrase.

## 11. Running the generation

```bash
npm run research    # Validate input, build the corpus, write the manifest
npm run verify      # Lint, typecheck, test, build
```

A malformed research file fails the run with the file, the field, and the
problem. It is never partially loaded, because a partially loaded corpus looks
exactly like a complete one with less evidence.

To regenerate an approved corpus with a fresh timestamp:

```bash
RESEARCH_RUN_AT=2026-06-01T00:00:00.000Z npm run research
```

The run timestamp is an input rather than a clock read, so the same research
input always produces a byte-identical corpus.

## 12. Inspecting rejected records

```bash
cat data/generated/review-queue.json
```

Every item names the file, the record, the problem, and what to do about it.

| Reason | Usual fix |
| --- | --- |
| `unresolved_company` | Add a domain, or add the company to `companies.yaml` |
| `ambiguous_company` | Supply a domain; it outranks every name rule |
| `low_confidence_match` | Same: a name-only match is below the threshold |
| `missing_source` | Add the URL to `sources.yaml` first |
| `missing_availability_evidence` | Supply a method, or null plus `not_established` |
| `invalid_date` | Use `YYYY-MM-DD` |
| `duplicate_candidate` | Two records share a strong key, or collide on name |
| `contradictory_claim` | Expected. Record which claim is correct |
| `unsupported_event_classification` | Classify by hand in `events.yaml` |
| `unknown_signal_type` | Add the type to `config/signals.yaml` |
| `schema_invalid` | The detail names the field |

**A record in the review queue is not a failure.** An unresolved company usually
means a source did not say clearly enough which company it meant, which is a
fact about the source. Leave it queued rather than forcing it into the corpus:
coverage bought by guessing is worse than a smaller honest corpus.

## 13. What research should aim for

Design target for the first real universe:

| Quantity | Target |
| --- | --- |
| Companies | Approximately 120 |
| Evidence claims | 1,000 to 3,000 |
| Signal events | 500 to 2,000 |
| Companies with two independent sources | As high as the sources allow |
| Backtest-admissible event share | Reported, not targeted |

The backtest-admissible share is a measurement, not a goal. Inflating it by
asserting availability dates that cannot be demonstrated would corrupt the
Backtest Lab, which is the one thing in this project that cannot be repaired
after the fact.
