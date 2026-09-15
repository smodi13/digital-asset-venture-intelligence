# Attribution

Digital Asset Venture Intelligence is released under the MIT License. This document records where
its ideas and its code came from, separated by what each contribution actually
was. The distinction matters: describing a conceptual reference as a code
contribution would overstate it, and describing a code contribution as merely
conceptual would understate an obligation.

## 1. Prior work by the author, used as internal source material

Several components in this repository are informed by earlier independent work
samples written by the same author. That work is the author's own, so reuse
carries no licensing obligation, and it is recorded here because provenance
should be visible whether or not a licence requires it.

The prior projects are described by what they contributed rather than by name.
Most were addressed to a specific investment firm, and naming them here would
reintroduce exactly the firm-specific references that this project is designed
not to carry.

| Contribution | What was taken |
| --- | --- |
| A prior evidence and provenance work sample | The idea of a single container type for every researched value, carrying its classification, its confidence, the date the metric describes, and the evidence supporting it, with a null value as a first-class state. Reimplemented here as `lib/provenance/`. |
| A prior configurable investment research application | The two-stage relevance-then-quality scoring architecture, and the idea of an investment mandate as a configuration object rather than as code. Reworked here as `config/thesis.yaml` and the `ThesisConfiguration` schema, with the mandate identifier changed from a compile-time union to a plain string. |
| A prior growth-capital origination work sample | The build-time policy walker that fails the build when a prohibited name reaches source, docs, or built output. Reimplemented and extended here as `lib/policy/`. |
| A prior deterministic sourcing engine | The separation between signals whose information value expires and enduring facts that must never be decayed, and the discipline of a negative specification naming what must not raise a score. Both are expressed here in `config/signals.yaml` and `config/scoring.yaml`. |
| A prior public replay and sanitization pattern | The approach of scanning generated output for credential shapes and local absolute paths and aborting rather than warning. Extended here in `lib/policy/rules.ts`, and applied to the corpus build in `scripts/research/build-corpus.ts`. |
| A prior deterministic sourcing engine, organisation registry | Domain matching at a dot boundary rather than by substring, exact alias matching, and unresolved as a first-class outcome. Reimplemented in TypeScript as `lib/research/entity/`. |
| A prior deterministic sourcing engine, company aggregation | Union-find consolidation on strong identity keys only, with name normalisation deliberately kept separate from domain normalisation. Reimplemented as `lib/research/dedupe.ts`. |
| A prior deterministic sourcing engine, headline classification | A compact phrase table mapping known event verbs to signal types, with negative context to stop ordinary English producing confident nonsense. Reimplemented as `lib/research/headline/matcher.ts`. |

## 2. Third-party conceptual references

The projects below were read and studied. **No source code from any of them was
copied into this repository.** They are listed because their ideas influenced
the design, and describing an influence honestly is more useful than omitting
it.

| Project | Licence | What was studied |
| --- | --- | --- |
| [Scout](https://github.com/alantgoff/Scout) | **No licence file** | Historical backtesting method: point-in-time reconstruction enforced in code, a mandatory control group, separation measured rather than recall, and named limitations. |
| [thesis-agent](https://github.com/lachlan-sear/thesis-agent) | **No licence file** | The shape of a thesis expressed as a configuration file, and the source-adapter interface pattern. |
| [OpenDealflow](https://github.com/clawnify/OpenDealflow) | MIT | Custom properties as an extensibility mechanism, so one schema serves several investment strategies. |
| [ScoutLayer](https://github.com/samkiell/scoutlayer) | MIT | Aggregating claim confidence into a trust score, and counting unverified claims at reduced weight rather than excluding them. |
| [DealDesk](https://github.com/JackJanoian/deal-desk) | MIT, with NOTICE and TRADEMARK | Human approval gates in a structured investment workflow. |
| [Autonitia Intel](https://github.com/Autonitia/autonitia-intel) | MIT | Declarative signal definitions in configuration, with the conditions that evidence a signal stated as data. |
| [changedetection.io](https://github.com/dgtlmoon/changedetection.io) | Apache-2.0 | Snapshot and diff of a restricted page region rather than a whole page. |

Two of these projects, **Scout** and **thesis-agent**, carry no licence file at
all. Absent a licence, no rights to copy are granted. They are conceptual
references only, no code from either appears here, and neither was cloned into
this project.

The MIT-licensed projects above would permit source reuse subject to retaining
their notices. None was reused, so no notice retention applies. DealDesk
additionally reserves its trademarks separately from its code licence; its
marks are not used here.

## 3. Third-party runtime and development dependencies

Installed from npm and used unmodified. Their licences are reproduced in
`node_modules` as installed, per normal npm distribution.

### Runtime

| Package | Licence | Purpose |
| --- | --- | --- |
| next | MIT | Application framework and static prerendering |
| react, react-dom | MIT | User interface runtime |
| zod | MIT | The single schema authority: validation and derived types |
| minisearch | MIT | Deterministic lexical search: prefix, fuzzy, and field boosts |

### Development and build

| Package | Licence | Purpose |
| --- | --- | --- |
| typescript | Apache-2.0 | Type checking |
| vitest | MIT | Unit and policy tests |
| @playwright/test | Apache-2.0 | Browser test tooling, installed without browser binaries |
| tailwindcss, @tailwindcss/postcss, postcss | MIT | Styling |
| eslint, eslint-config-next | MIT | Linting |
| js-yaml | MIT | Configuration and research input parsing at build time only |
| cheerio | MIT | HTML parsing for research scripts. Never shipped to the browser |
| tsx | MIT | Running TypeScript research scripts |
| @types/node, @types/react, @types/react-dom, @types/js-yaml | MIT | Type definitions |

No dependency in either list requires attribution beyond retaining its licence
text, which npm installation preserves.

## 4. What is deliberately absent

No paid AI API client is a dependency of this project. The core application is
designed to work with no external service, no credential, and no account, so
adding one would break a property the project is built around.
