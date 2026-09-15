# Source policy

What may enter this repository, what may not, and how the boundary is enforced.

This project draws on research material that is not public and must not become
public. That material includes raw platform archives containing personal
information, credentials, and full article text belonging to its publishers.
The boundary between private research and public repository has to be a
mechanism rather than an intention, because a boundary maintained by care alone
fails the first time someone is in a hurry.

## 1. Public repository, private research

Two categories of material exist and they never mix.

**Private research material** lives outside this repository, on the author's
machine or in a private archive. It includes raw responses from any platform
API, personal information about identifiable individuals, credentials, approval
records, and complete unsanitized research outputs.

**Public repository material** is everything in this repository. It is
generated, sanitized, validated, and hash-verified.

Nothing crosses from private to public except through a research script that
reads its input from an environment-supplied path and writes validated,
sanitized output. There is no manual copy step, because a manual copy step is
where a private field survives into public output.

## 2. What is allowed into the public repository

- Company and person records built from public professional sources
- A source title, publisher, publication date, and URL
- A paraphrased factual summary of what a source establishes
- Engine-derived classifications, scores, and their inputs
- Configuration, schemas, and code
- Generated datasets, each listed in `data/generated/MANIFEST.json` with its hash

## 3. What is excluded

**Raw platform archives.** Raw API responses containing user records are never
copied, imported, symlinked, referenced from application code, committed, or
scanned into fixtures. These archives carry real names, usernames, account
identifiers, biographies, and locations for identifiable people. A later
research phase may read such an archive through an explicit environment-supplied
source path, and it will emit only sanitized, validated records. The archive
itself never enters this repository.

**Personal information.** Names, usernames, account identifiers, email
addresses, biographies, locations, and follower counts of individuals do not
appear in generated output. `Person` records hold professional identity from
public professional sources: a name, a role, dated tenures, and public
professional handles. They are not a profile of a person.

**Full article bodies.** Source content is copyrighted by its publisher. This
project stores a title, a publisher, a date, a link, and a paraphrased factual
summary. Where the exact wording genuinely matters, a short verbatim excerpt
field is available and is capped at 280 characters by schema, so an over-length
excerpt fails validation rather than being noticed in review. Prefer the
paraphrase; use the excerpt only when the wording is the point.

**Credentials.** No `.env` file from any other project is copied here. This
repository contains `.env.example` only, which documents that the core
application requires no environment variables and names no credential.

**Local absolute paths.** No generated file, document, configuration file, or
public asset contains a path from the author's machine. Such a path leaks a
real name and a directory layout, and makes an artifact unreproducible
elsewhere. Development scripts take paths from the environment.

## 4. How the boundary is enforced

Four guards run over every text-bearing file in the repository, defined in
`lib/policy/` and asserted by `tests/policy.test.ts`:

| Guard | Detects |
| --- | --- |
| Secret scan | Bearer tokens, provider API keys, PEM private keys, and assigned secret values, with documented placeholders excluded |
| Local path scan | Absolute home-directory paths on macOS, Linux, and Windows |
| Em dash scan | The em dash, U+2014 |
| Banned name scan | Firm and prior-brand names, matched word bounded and never as a substring |

Each guard has a paired negative test in `tests/policy-negative.test.ts` that
plants the violation it is supposed to detect in a temporary directory and
asserts the guard fires. A guard that passes on a clean tree proves nothing
about whether it works.

`tests/policy.test.ts` additionally asserts that no `.env` file exists, that no
raw archive directory exists, and that no generated file contains personal
identity field names.

A finding from the secret scan is reported with the value redacted. Printing a
live credential into a test log or a terminal transcript would leak it.

## 5. Historical evidence policy

**Historical availability must be demonstrated, not inferred.**

A record used in a historical test must carry an `availabilityDate`: the
earliest point in time at which that exact information is shown to have been
publicly available. It is established from a timestamp intrinsic to the source,
never assumed and never copied across from a claimed publication date.

Acceptable evidence of historical availability:

- a timestamped original publication, such as a dated press release
- a regulatory filing timestamp
- an event-level repository timestamp, such as a star or commit event
- a timestamped community post, such as a forum `created_at`
- an archived page snapshot with a capture date
- any other source carrying an intrinsic point-in-time timestamp

Where none of these exists, `availabilityDate` is null. It is never guessed.

**Two subsets, deliberately different sizes.**

Evidence whose historical state cannot be reconstructed is excluded from
historical tests **even though it remains usable in the current sourcing
product**. An undated company page is perfectly good evidence about the company
today, and it cannot establish what was knowable in 2024.

This makes two sets:

| Set | Requirement |
| --- | --- |
| Current screening data | A source, a date, and validated provenance |
| Backtest-eligible data | The above, plus a demonstrated `availabilityDate` |

The second is a subset of the first and will be materially smaller. The
Backtest Lab must report what share of the corpus is historically admissible at
all, because a backtest run over an unstated fraction of the evidence is a
result nobody can interpret.

**Ingestion time is not historical evidence.**

`ingestedAt` records when this pipeline read something. It is audit metadata and
takes no part in historical eligibility. A press release publicly available in
June 2024 and read by this project in September 2026 was available to any
investor in December 2024, and a December 2024 test may use it. The backtest
reconstructs what information was publicly available at a point in time; it does
not pretend this software was running then.

`ingestedAt` is stamped by the ingestion boundary and is never supplied by a
source adapter. See `docs/methodology.md` section 4.

## 6. Claim-level provenance and independence

A source and a claim are separate objects, and the rules below apply to the
claim regardless of how reputable the publication is.

**Publisher independence is not claim independence.** An article can be
independent journalism and still only repeat a figure the company supplied. The
claim's `sourceSubtype` records where the fact originated: `reported_fact` (a
verifiable event of record), `company_reported` (the company's own assertion,
unaudited), or `third_party_estimate` (a figure a data vendor, journalist, or
researcher produced outside the company).

- **Company-reported private metrics stay company-reported** when repeated
  externally. Two outlets carrying a company's NRR are one origin for that
  number.
- **Third-party estimates stay estimates.** A structured-secondary figure
  (Sacra, CB Insights, Dealroom and similar) is that provider's estimate, not
  an independently verified fact, and does not become one because a company
  quotes a similar number.
- **Customer and vendor evidence** can independently support operating reality
  (a product is deployed, at roughly this scale, processing this volume)
  without verifying a financial metric such as ARR, gross margin, or
  profitability. Its source class is `customer_vendor` and it cannot
  corroborate.
- **Financing distinctions are load-bearing.** Primary, secondary, mixed,
  `reported_unconfirmed`, and unknown-mix are kept distinct. An employee tender
  contributes `$0` of company primary capital. An unclosed round is not capital
  raised. A derived figure (a headline less a reported secondary component) is
  `provenance: derived`, rounded, and not audited.
- **Unknown is not zero.** A blocked research dimension is not a zero score.

Each `SourceRecord` carries a `supportRole` describing how it contributes to
the company it is cited against (`corroborating`, `contextual`,
`customer_vendor`, `third_party_estimate`, `transaction_detail`,
`historical_context`, `direct_company_disclosure`, `legal_entity_disclosure`,
`primary_fact`, `repeated_announcement`). The role describes the source's
contribution; it is not a claim that every proposition citing the source has
independent corroboration.

Research and readiness annotations (`ready`, `ready_with_caveat`, `blocked`)
describe how well evidenced a dimension is. They are not investment scores,
thesis-fit ratings, or priority ranks, and no scoring engine exists.

## 7. Provenance and validation

Every material value carries an explicit classification: sourced, derived,
assumption, estimated range, or unknown. A value that is not established is
null and is never backfilled with a plausible number. See
`docs/methodology.md`.

Every generated dataset is validated against its schema before it is written. A
record that does not validate fails generation rather than being written with a
warning.

## 8. The research-time private cache

A future Company Change Radar needs to compare two versions of a page, which
means retaining page content between runs. That content lives in a private
cache under `research/cache/`, which is gitignored.

It is never committed, never a public fixture, and never referenced by
application code. Publishing retrieved HTML would republish copyrighted content
at scale and would put whatever a company happened to have on its site into a
permanent public record.

What reaches `data/generated/` from a snapshot is a hash, a page type, a
description of the watched region, and metadata. A diff carries capped
snippets, never a page body.

## 9. Public fixture generation principles

Any script that produces committed data follows the same rules.

**Deterministic.** Running it twice on unchanged inputs produces byte-identical
output. Timestamps are inputs, not clock reads, or the manifest hash changes on
every run and stops meaning anything.

**Stable and sorted.** Output uses stable key ordering and consistent
formatting, so a regeneration produces a clean diff.

**Validated before writing.** Configuration is loaded and validated first. A
dataset generated against invalid configuration is worse than none.

**Sanitized by construction.** The script copies named fields into a validated
output shape. It never copies an input record wholesale, because a wholesale
copy carries whatever field was added upstream since the script was written.

**Guarded on the way out.** Generated output is scanned for credential shapes,
local paths, and personal identity fields. A hit aborts generation rather than
producing a warning.

**Hashed and manifested.** Each output file is recorded in
`data/generated/MANIFEST.json` with its SHA-256, so a later edit is detectable.
