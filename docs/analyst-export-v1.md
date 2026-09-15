# Analyst Export V1 (Phase 6E-B)

A submission-ready way for an analyst to take the Screening work product out of
Digital Asset Venture Intelligence in a professional, evidence-backed format,
from the company they are already inspecting.

It is **not** an investment memo, an IC memo, or a recommendation. It reports
what was assessed, what the evidence supports, how much evidence exists, how
reliable it is, where it is missing, the human Screening judgments, the
deterministic adjustment, recent dated signals, and full provenance.

## Formats

| Format | Route | Artifact |
| --- | --- | --- |
| Screening Brief | `/companies/<id>/brief` | Stand-alone print-optimised HTML document with a "Print / Save as PDF" action |
| Evidence CSV | `/companies/<id>/export/evidence` | `text/csv` download, `davi-<slug>-evidence.csv` |

Entry point: an **Export** control on Company Detail (small menu, not a CTA)
with "Screening brief" and "Evidence CSV". Keyboard operable, focus-visible,
labelled, closes on Escape / outside click.

## Data source

Both formats consume **only** the sanctioned production Screening read model
(`lib/screening-read`: `getCompanyScreeningDetail`, `getScreeningReadModelMeta`)
and the committed corpus it reads. Specifically:

- No LLM call, no live web fetch, no research recomputation during export.
- No scoring logic is duplicated in the PDF path, the CSV path, or any client
  component. The read layer runs the calibrated `lib/scoring/*` engine.
- No Phase 6C descriptive-diagnostic runtime import, no Phase 6C diagnostic
  JSON, no ignored Phase 5C artifact. (`tests/screening-read/firewall.test.ts`
  walks `app/` and enforces this.)
- No `ScoreSnapshot` is persisted; analytics are computed on read.

## Determinism

For a fixed company, corpus, analytical inputs, and as-of metadata the exported
analytical content is deterministic. Only the generated timestamp varies. Source
numbering in the Brief is stable (cited sources sorted by id, numbered from 1).

## PDF implementation architecture

**Chosen: a dedicated print-optimised route + "Print / Save as PDF".** Not a
server-generated PDF binary.

Rationale:

- The stack is Next 16 / React 19. `@react-pdf/renderer` (the repo-compatible
  option) adds a large dependency that historically lags React majors, and a
  dense tabular dossier would require hand-built layout primitives with a real
  risk of clipping and page-overflow bugs.
- A server-rendered print route carries **zero new dependencies**, is fully
  static-prerenderable on Vercel (all 39 brief routes build as static HTML),
  needs no headless Chrome, no filesystem write, no third-party conversion
  service, and no credential.
- The browser's own print engine handles pagination, `thead` repetition,
  `break-inside: avoid`, and long-URL wrapping, which are exactly the
  long-content hazards in section 22 of the phase spec.

The brief route hides the app chrome in print (`print:hidden` on the shell),
sets `@page` margins, and repeats a fixed footer (company name, "Screening
Brief", generated date, "not an investment recommendation"). Page numbers are
left to the browser's print dialog; the route does not claim PDF/UA
accessibility tagging.

Print CSS: `app/companies/[id]/brief/brief.css`. Colours are print-safe and
legible in black and white (no gradients, no decorative fills; status is
conveyed by outlined tags plus text, never colour alone).

## Screening Brief contents

Stand-alone hierarchy:

1. **Cover / header** - Digital Asset Venture Intelligence, "Screening Brief", company name and
   context line, generated timestamp, analytics as-of, research last updated,
   corpus generated, persisted score snapshots (0), analytical mode = Screening,
   and the prominent notice that this is not an investment recommendation and
   mandate is not assessed.
2. **Screening summary** - display state and reason, Screening Thesis Fit (whole
   number, `/100`), Evidence Coverage and Evidence Confidence (whole percent,
   kept separate), non-mandate evidence-bar status ("Meets Screening evidence
   bar" / "Does not yet meet Screening evidence bar"), Mandate status
   `NOT_ASSESSED` with note, full Screening evidence eligibility = Unresolved
   with note, and the six-precondition table.
3. **Company context** - description, research notes, founders, sector,
   subsector, stage, HQ, domain, ownership. Missing values are omitted, never
   invented.
4. **Seven-dimension summary** - name, score, coverage, confidence, display
   state, critical-dimension indicator. Not ranked.
5. **Fourteen-criterion detail** - grouped by dimension: human raw anchor,
   deterministic adjusted score, coverage, confidence, neutral-prior state,
   contradiction state, analyst rationale, supporting EvidenceClaims (with
   `[n]` source references), and reviewed-but-excluded claims. The human
   judgment and the deterministic adjustment are labelled distinctly.
6. **Evidence gaps** - critical-dimension gaps, missing dimensions, thin
   dimensions, criterion coverage gaps, unresolved conflicts,
   reviewed-but-excluded evidence, research questions. No gap priority score.
7. **Recent dated signals** - canonical `SignalEvent`s only: date, type,
   direction, event status, summary, source. Negative signals stay explicit;
   `reported_unconfirmed` stays labelled. No Momentum or Convergence score.
8. **Source appendix** - numbered, de-duplicated: publisher, title, source type,
   published date, link (domain), origin lineage. Raw article bodies are never
   included.
9. **Methodology and limitations** - concise stand-alone note (determinism,
   Coverage vs Confidence separation, neutral-prior shrinkage, no Fit band, no
   ranking, no Priority, mandate not assessed, public-data limits, evidence-gate
   calibration status, fixed 39-company corpus, no recommendation).

Display precision: Fit is a whole number; Coverage and Confidence are whole
percentages; the criterion raw anchor is the existing discrete rubric value;
adjusted criterion and dimension scores are shown as whole numbers. Underlying
production math is unchanged and stays full precision.

## Evidence CSV schema

One row per EvidenceClaim x criterion relationship (a supporting row or a
reviewed-but-excluded row). Columns:

```
company_id, company_name, dimension, criterion, included_or_excluded,
claim_id, claim_text, claim_status, source_id, source_publisher, source_title,
source_type, source_published_at, source_url, origin_lineage,
criterion_raw_anchor, criterion_adjusted_score, criterion_coverage,
criterion_confidence_pct, contradiction_state
```

- `included_or_excluded`: `included` (scored supporting evidence) or `excluded`
  (reviewed but not scored).
- `claim_status`: derived only from the read model's contradiction fields:
  `ok`, `contradicted_noted`, or `contradicted_unresolved`.
- `criterion_adjusted_score`: whole number. `criterion_coverage`: `0` / `0.5` /
  `1`. `criterion_confidence_pct`: whole percent. `contradiction_state`:
  criterion-level `none` / `minor` / `material`.
- Source columns come from the cited-source set; if a claim has no `sourceId`
  they are empty. Missing values are empty fields, never the string `null`.
- `source_url` is kept only when it is `http(s)`. No local filesystem paths, no
  secret-bearing or internal debug URLs, no URL shortener. No raw article body.

## CSV safety

`lib/export/csv.ts`:

- Every field is wrapped in double quotes; embedded quotes are doubled; rows are
  joined with CRLF (RFC 4180).
- Formula-injection defence: a field whose text begins with `=`, `+`, `-`, `@`,
  TAB, or CR is prefixed with a single quote (`'`) **in the exported cell only**.
  Canonical evidence text is never mutated.
- Covered by `tests/export/csv-safety.test.ts` and
  `tests/export/evidence-csv.test.ts`.

## Mandate semantics

Production mandate state for all 39 companies is `NOT_ASSESSED`. The export says
so, for every company. It never emits `ELIGIBLE`, never resurrects the Phase 6C
mandate assumption, and keeps full Screening evidence eligibility unresolved.
The non-mandate evidence-bar wording ("Meets / Does not yet meet Screening
evidence bar") is an evidence-quality check only and is explicitly separate from
mandate.

## Provenance

The Brief preserves the chain result -> dimension -> criterion -> EvidenceClaim
-> SourceRecord. Every supporting claim carries `[n]` references into the
numbered source appendix, so a reader can determine where a claim came from. The
CSV carries `claim_id` and the source columns on every row.

## Route security

The export routes accept only the fixed set of corpus company ids
(`generateStaticParams` + `dynamicParams = false`). Any other id is a 404. No
path, URL, or file argument is read from the request. There is no arbitrary
file-read, URL-fetch, or path endpoint.

## No-recommendation policy

The export contains no Priority, rank, recommendation, conviction, "Top Pick",
buy / pass, or investment verdict; Fit is never turned into a qualitative band;
and no AI-generated prose about whether to invest is produced. Existing human
analyst rationales are included because they are sanctioned analytical inputs.

## Files

- `lib/export/csv.ts`, `lib/export/evidence-csv.ts`
- `app/companies/[id]/export/evidence/route.ts`
- `app/companies/[id]/brief/{page.tsx,Brief.tsx,PrintButton.tsx,brief.css}`
- `components/company/ExportMenu.tsx`
- `tests/export/{csv-safety,evidence-csv,screening-brief}.test.ts`
