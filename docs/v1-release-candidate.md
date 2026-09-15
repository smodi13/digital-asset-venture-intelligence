# V1 Release Candidate

Prepared in Phase 6F-A (V1 Release Candidate Hardening). This is a hardening
record, not a new methodology document. It does not supersede
`docs/methodology.md` or `docs/limitations.md`.

## Release scope

Digital Asset Venture Intelligence V1 is a provenance-backed private-market company **screening tool
for analysts**. It is not an investment product. It sources candidates, holds a
researched corpus, computes deterministic Screening analytics on read, lets an
analyst inspect every value to its source, and exports the Screening work
product. It does not rank companies, assign a Priority, judge mandate fit, or
make an investment recommendation.

## Implemented workflow

```
DISCOVER -> RESEARCH HANDOFF -> RESEARCHED CORPUS -> SCREEN -> INSPECT -> REFINE -> EXPORT
```

- **DISCOVER** - Headline Radar fetches a fixed server-side allowlist of three
  public RSS feeds (no API key), extracts one candidate per story
  deterministically, deduplicates, and matches against the canonical 39.
- **RESEARCH HANDOFF** - a candidate is queued browser-local and handed to the
  research pipeline with its discovery provenance; it carries no Screening result.
- **RESEARCHED CORPUS** - `research/input/*.yaml` -> validated, hashed
  `data/generated/*.json` (39 companies, 222 sources, 510 evidence claims, 84
  people, 113 signal events, schema v6).
- **SCREEN** - `lib/screening-read` calls the calibrated deterministic engine on
  read: 7 dimensions, 14 criteria, 546 criterion assessments, a raw Screening
  Thesis Fit, separate Evidence Coverage and Confidence, and a calibrated
  display-sufficiency state.
- **INSPECT** - company detail, dimension/criterion expansion, EvidenceClaim
  provenance, non-modal Source drawer, Research Gaps, Signals, People.
- **REFINE** - research gaps remain visible analyst work.
- **EXPORT** - Screening Brief (print / Save as PDF) and Evidence CSV (one row
  per claim, formula-injection safe), both from the production read layer only.

## Known limitations (disclosed, not defects)

- Mandate Eligibility is `NOT_ASSESSED` for all 39; full Screening evidence
  eligibility is therefore `null` / unresolved.
- Priority inactive; no conventional ranking; no Fit bands; minimum Fit is `null`.
- Temporal Momentum and Signal Convergence are not production decision metrics.
- No automated Underwriting entry; entering Underwriting is a human decision.
- Public-data research cannot reconstruct private financial statements; unknowns
  stay `unknown` and numeric values are stored as prose.
- The Screening methodology is calibrated on the current 39-company dataset;
  evidence-sufficiency calibration is not investment-outcome validation.
- The research queue is browser-local (`localStorage`), never server-persisted
  and never written to Git or the canonical corpus.
- Headline identity extraction may return `needs_review` rather than guess.
- The Screening Brief uses the browser print engine, not a server-generated PDF.

## Verification summary (Phase 6F-A)

| Check | Result |
| --- | --- |
| Baseline (HEAD, clean tree, corpus counts, schema v6, 0 snapshots) | verified |
| Full test suite | 894 passing |
| `typecheck` / `lint` / `build` | pass |
| Route inventory | `/`, `/companies`, `/companies/[id]`, `/companies/[id]/brief`, `/companies/[id]/export/evidence`, `/methodology`, `/sourcing`, `/api/sourcing/run` - no debug/test/admin/prototype routes |
| All-39 company detail / brief / evidence-CSV routes | 200; correct identity; sanitized CSV filename; no local paths |
| Unknown company / unknown route | safe 404 |
| Production read layer | 39 worklist rows, 546 criterion assessments, mandate `NOT_ASSESSED` and eligibility `null` for all 39, no rank/priority/recommendation fields |
| Provenance | 510 claims, 222 sources, 0 unresolved source references, no raw article bodies, sources carry URLs |
| Sourcing security | server-side fetch only, engine id allowlisted, feed URLs code-controlled, second allowlist check, 12s timeout, response-size cap, no `dangerouslySetInnerHTML`; request cannot inject a URL |
| Live sourcing (3 runs) | all 3 feeds healthy each run, ~45 candidates, partial failure surfaced honestly, no crash |
| Secret / credential audit | no credential-shaped value in tracked files or built output; app reads no env var outside build scripts |
| Policy regression | no U+2014 / U+2013, no banned firm/brand name, no local absolute path |
| Dependency audit | 2 moderate advisories, both in the `vitest` devDependency chain (test-only; fix is a major-version bump); documented, not shipped |

## Deployment assumptions

- Vercel, Next.js App Router build.
- No environment variable, account, database, or model provider required.
- Company / brief / CSV routes are static; `/api/sourcing/run` is the only
  dynamic route (Node runtime) and calls the configured public feeds from the
  server.
- No local filesystem persistence; the research queue is browser-only.
- Print / Save as PDF stays browser-side.

## Not in V1

Priority, conventional ranking, automated investment recommendations,
productionized Momentum or Convergence, Underwriting entry, mandate judgments,
server-generated PDF binaries, credentialed sourcing engines.
