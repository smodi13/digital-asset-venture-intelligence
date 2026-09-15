# Phase 4D release candidate

Prepared in Phase 4D (final release candidate polish). This is a QA and
presentation record for the v7 product, not a methodology document. It does
not supersede `docs/methodology.md`, `docs/limitations.md`, or
`docs/product-v1-architecture.md`.

## Implemented module set

Nine active product modules, all reading `getReadModelMeta()` and the other
`lib/digital-asset-product/` accessors described in
`docs/product-v1-architecture.md`:

Partner Home, Sourcing Worklist, Signal Engine, Source Intelligence, Market
Map, Follow-On Radar, Relationship Intelligence, Companies / Company Detail,
Methodology.

The legacy v6 Sourcing candidate-discovery route and the v6 Screening Brief /
Evidence CSV exports remain in the codebase but out of primary navigation;
see "Remaining known gaps" in `docs/product-v1-architecture.md`.

## Runtime data source

`data/v7-product/companies.v7.json`, a committed, deterministic product
corpus built once from frozen `research/v7/` and `judgments/v7/` packets by
`scripts/product/build-corpus.ts`. No regeneration step is required for a
clean clone. Follow-On Radar state is the only mutable runtime state, and it
lives entirely in browser `localStorage`.

## Release QA status (Phase 4D)

- Lint: 0 errors.
- Typecheck: 0 errors.
- Tests: 1251 / 1251 passing.
- Production build: succeeds.
- Product build determinism (`tests/product/build-determinism.test.ts`):
  passing, byte-identical output across two independent runs.
- Public branding audit: no tracked occurrence of prior firm names; the
  `lib/policy/banned-names.ts` guard enforces this at the policy layer.
- Public safety audit: no tracked `.env`, `.vercel/`, `.qmd/`, or
  `local-artifacts/` files; `git ls-files` confirms.
- Responsive QA: desktop (~1440px) and mobile (~390px) checked across all
  nine modules; no whole-page horizontal overflow found. Data tables scroll
  horizontally by design.

## Known limitations at release

- The v6 export routes still read the old 39-company v6 corpus and were not
  touched in this phase.
- Evidence-sufficiency thresholds for v7 remain uncalibrated and inactive by
  design, as documented in `docs/product-v1-architecture.md`.
- This is a local release candidate only. No GitHub remote was created and
  no Vercel deployment was made in this phase.
