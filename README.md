# Digital Asset Venture Intelligence

AI-assisted sourcing, market intelligence, and portfolio monitoring for
early-stage digital asset investing.

This is an independent research and work-sample project. It is not an
official product of, affiliated with, or endorsed by any investment firm,
and its methodology is not derived from any firm's methodology. An
automated policy check enforces that no firm name appears anywhere in the
project.

## What it does

Digital Asset Venture Intelligence takes a researched universe of
early-stage digital asset companies and turns it into a continuous
screening and monitoring workspace:

- **Sourcing** surfaces new candidates from public news and hands them to
  a research pipeline that produces hand-authored, source-traced research
  packets.
- **Screening** maps research to a fixed seven-dimension, fourteen-criterion
  rubric and computes a deterministic **Thesis Fit** score, together with
  separate **Evidence Coverage** and **Evidence Confidence** readings.
- **Company screening and market mapping** let an analyst browse the
  universe by company or by category, with every displayed value traceable
  to a specific claim and source.
- **Monitoring** (Signal Engine, Source Intelligence, Follow-On Radar,
  Relationship Intelligence) surfaces new signals, source provenance, a
  user-controlled watch list, and person-to-company connections across the
  researched universe.

No score is produced by a language model. Weights, thresholds, and rubric
definitions live in configuration files a reader can open, and every value
on screen traces back to a specific evidence claim and source.

## Product modules

- **Partner Home** - editorial overview of the researched universe: recent
  signals, evidence-bar status, and entry points into every other module.
- **Sourcing Worklist** - the full researched universe as a dense,
  filterable table (cards on mobile), in a deterministic neutral order with
  no default ranking.
- **Signal Engine** - every tracked signal event across the universe,
  most-recent-first, split into recent and older activity.
- **Source Intelligence** - every cited source across the universe, with
  publisher, tier, independence, and the claims it supports.
- **Market Map** - the universe grouped into its canonical categories, with
  composition and evidence-coverage metadata computed on read.
- **Follow-On Radar** - a browser-local, user-controlled monitoring list.
  Radar membership is a personal watch decision, not a portfolio holding.
- **Relationship Intelligence** - a person-to-company directory with
  deterministic repeat-connection detection across researched companies.
- **Companies / Company Detail** - an A-Z directory and, per company, the
  full Thesis Fit / Coverage / Confidence picture down to dimension,
  criterion, evidence claim, source, and person.
- **Methodology** - the scoring framework, evidence bar, and calibration
  discipline described below, in full.

## Analytical framework

An analyst maps sourced facts to each of fourteen criteria and assigns a
raw rubric anchor and a discrete evidence-coverage value; that mapping is
the human judgment. A deterministic engine then adjusts each anchor for the
reliability and freshness of its cited evidence and rolls the criteria up
through seven dimensions into a single **Thesis Fit** score.

Some distinctions the product is deliberate about preserving:

- **Thesis Fit is not a recommendation.** It is a continuous analytical
  output, never a rank, a band, or an eligibility threshold.
- **Evidence Coverage** measures how much of the rubric has evidence behind
  it. **Evidence Confidence** measures how reliable that available evidence
  is. They are two separate values and are never merged into one score.
- **PROVISIONAL** means the evidence bar has been met for a normal
  analytical view. **INSUFFICIENT_EVIDENCE** means it has not.
- **Mandate status** and **rank eligibility** are tracked separately from
  Thesis Fit and are not assessed by this product.
- **Radar membership** is a user monitoring choice, not a portfolio
  holding.
- **Signals are not investment scores.** They are dated, sourced events,
  nothing more.

## Evaluation

The scoring methodology was calibrated before any held-out evaluation, then
tested once against a sealed 14-company FINAL_TEST cohort with no further
tuning permitted:

- 14 held-out companies.
- 2 reached the PROVISIONAL evidence threshold; 12 remained
  INSUFFICIENT_EVIDENCE.
- Mean FINAL_TEST evidence coverage: 39.29%.
- Mean FINAL_TEST evidence confidence: 78.60%.
- Deterministic scoring reproduced identically across two independent runs
  of the build pipeline.

This evaluates the methodology's behavior and determinism on public
evidence, not investment performance or alpha. Public research coverage of
early-stage private companies is inherently thin; a low mean coverage is an
honest description of that scarcity, not a defect.

## Architecture

- **Next.js (App Router) + TypeScript**, statically prerendered where
  possible.
- A **deterministic generated product dataset**
  (`data/v7-product/companies.v7.json`) built once from frozen research and
  judgment packets by a pure, reproducible pipeline
  (`scripts/product/build-corpus.ts`), and committed so a clean clone needs
  no regeneration step.
- A **typed product read layer** (`lib/digital-asset-product/`) is the only
  sanctioned way the frontend reads product data; no scoring formula or
  file I/O happens in a React component.
- Research, human judgment, and scoring configuration are frozen and kept
  strictly separate from the product layer that reads them.
- **Follow-On Radar** state lives entirely in browser `localStorage`; there
  is no server or database.

See `docs/product-v1-architecture.md` for the full data-flow diagram.

## Local development

```bash
npm install
npm run dev      # development server
npm run verify   # lint + typecheck + full test suite + production build
```

## Limitations

- Research is drawn from public evidence only; private financial detail is
  not reconstructed and unknowns stay unknown.
- Research coverage varies by company and is thin for most early-stage
  digital asset companies, by the nature of the asset class.
- The evaluation above measures methodology behavior and determinism, not
  predictive investment performance.
- There is no live portfolio integration; Follow-On Radar is a personal,
  browser-local watch list, not a holdings record.
- There is no real-time external signal feed in the current build; sourcing
  and signals are drawn from the researched corpus.

## Disclaimer

This is an independent research and work-sample product. Nothing in this
project is investment advice, and no output should be treated as a
recommendation to buy, sell, or hold any asset.

## License

MIT. See `LICENSE`.
