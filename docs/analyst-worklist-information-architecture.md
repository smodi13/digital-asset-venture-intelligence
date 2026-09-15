# Analyst Worklist Information Architecture (Phase 6D-A)

Status: DESIGN ARCHITECTURE, APPROVED (with the corrective scope revision
below). Not UI implementation. No component files, no scoring change, no
research change, no schema change. This document is the single tracked artifact
of Phase 6D-A.

Baseline commit: `2df2ff3` (Add real-corpus scoring diagnostics).

**Corrective revision (post-ChatGPT review).** The information architecture was
accepted; the definition of submission-ready V1 had drifted. This revision
corrects two points and changes nothing else:

1. Submission-ready V1 **requires** a sanctioned production Screening
   analytical read path (built in Phase 6D-B, not here). The Screening frontend
   is not complete until it renders the deterministic Screening outputs through
   that read path, without importing Phase 6C diagnostic artifacts. The Phase
   6C diagnostic runner and diagnostic JSON stay non-production.
2. A working **Sourcing** capability is **V1**, not post-V1. The navigation
   slot is reserved now and a placeholder is acceptable only during
   intermediate development; final submission-ready V1 must demonstrate
   candidate discovery, discovery provenance, a candidate research queue, the
   candidate-to-researched-company transition, and integration with the
   canonical research workflow.

Everything else in this document is unchanged: no-leaderboard policy, continuous Fit,
Coverage/Confidence separation, temporal guardrails, negative-signal
presentation, sparse-data guardrails, company-detail architecture,
evidence/provenance architecture, manual sorting, mandate separation,
accessibility and responsive requirements, human-judgment boundaries.

Next build order: **Phase 6D-B** (Production Analytical Read Path) then
**Phase 6D-C** (Analyst Frontend Implementation, using UI/UX Pro Max). Sec. 33.
Neither is implemented now.

Companion inputs (indexed `origination-iq-docs` collection, read directly):
`methodology.md`, `limitations.md`, `phase6c-descriptive-diagnostics.md`,
`research-standard.md`, `source-policy.md`, `research-input-guide.md`.

---

## 0. How to read this document

Every screen, field, and metric below is classified by two axes:

1. **Analytical maturity** (from Phase 6C): PRIMARY / FRONTEND-READY vs
   SECONDARY / PROVISIONAL. The UI must make the difference visible.
2. **V1 scope**: MUST HAVE / SHOULD HAVE / POST-V1.

Where the two conflict, maturity wins: a provisional metric is never promoted
to a headline just because V1 has room for it.

Forbidden throughout (hard constraints, not preferences):

- no conventional numerical leaderboard, rank numbers, "top picks", "best
  companies", "highest conviction", automatic top-N
- no Fit bands or Fit labels (`STRONG` / `WEAK` / `HIGH CONVICTION` / `TOP
  QUARTILE` / etc.)
- no Priority state surfaced as a decision
- no automatic investment recommendation, no automatic ESCALATE / MONITOR /
  PASS
- no default sort by Fit, Momentum, Convergence, Coverage, or Confidence
- no composite of Fit + temporal signals
- no merge of Coverage and Confidence into a single "Trust" / "Quality" number
- no inferred Mandate Eligibility for the existing 39 companies
- no U+2014, no U+2013, no target-firm branding

---

## 1. Baseline

| Check | Expected | Observed |
|---|---|---|
| HEAD | `2df2ff3` | `2df2ff3` |
| branch | `main`, tracks `origin/main` | confirmed |
| working tree | clean | clean at phase start |
| companies | 39 | 39 |
| sources | 222 | 222 |
| EvidenceClaims | 510 | 510 |
| Person records | 84 | 84 |
| SignalEvents | 113 | 113 |
| research schema version | 6 | 6 |
| persisted ScoreSnapshots | 0 | 0 |
| tests | 756 passing | 756 passing |
| Screening evidence sufficiency | `CALIBRATED_ACTIVE_FINAL_TEST_VALIDATED` | confirmed |
| Priority / conventional ranking | inactive | inactive |
| Momentum / Convergence | implemented, descriptive / provisional | confirmed |
| Automated Underwriting entry | not implemented | confirmed |

No material difference. Proceed.

---

## 2. QMD retrieval

`origination-iq-docs` collection is current (7 files, `**/*.md`, indexed).
No `qmd update` / `qmd embed` / `qmd cleanup` run. Retrieved and used:

- **methodology.md sec. 12** - the seven analytical layers, the two Thesis Fit
  modes, the Screening display sufficiency rule (`< 0.30` overall coverage OR
  fewer than 2 of 7 dimensions at `0.40`), the Screening evidence-sufficiency
  gate (mandate `ELIGIBLE` + display `SCREENED` + overall coverage `>= 0.50` +
  confidence `>= 0.60` + 4 of 7 dimensions at `0.50` + both critical dimensions
  nonzero coverage + no material blocking conflict; `minScreeningThesisFit` is
  `null`), the Fit presentation policy (continuous, no bands), Momentum /
  Convergence mechanics and their dormant/unvalidated status, the
  evidence-adapter provenance rules.
- **methodology.md sec. 9-10** - fact / event firewall, half-life hypotheses,
  the review queue, "reported financing is not completed financing".
- **limitations.md** - what does not exist yet: no real-company scoring in
  production, no backtest, no Underwriting-entry function, no pipeline
  persistence, no Trust engine, thin independent corroboration (4 claims with
  independent-origin support, 1 with two), numeric values not extracted,
  financials mostly `unknown`.
- **phase6c-descriptive-diagnostics.md** - all 20 diagnostic sections; the
  maturity split this document depends on.
- **research-standard.md / source-policy.md / research-input-guide.md** -
  source tiers, reliability classes, independence rules, currentness policy,
  the DISCOVERED -> RESEARCHING -> ... conceptual state machine.

---

## 3. Product purpose

Digital Asset Venture Intelligence helps one investment analyst **discover, research, screen, and
understand** private-market companies using provenance-backed evidence and
transparent analytical outputs. It does not tell the analyst what to invest
in.

The worklist and company pages exist to answer:

| Question | Primary surface |
|---|---|
| What companies are in the research universe? | Worklist |
| Which companies have enough evidence to evaluate responsibly? | Worklist evidence-sufficiency column + filter |
| What does the current evidence imply? | Company > Screening (Fit + dimensions) |
| Where are the major evidence gaps? | Company > Research gaps; Worklist gap column |
| What changed recently? | Company > Signals timeline; Worklist recent-signal cell |
| What evidence supports each conclusion? | Dimension > criterion > claim > source trace |
| What should the analyst research next? | Company > Research gaps -> research questions |

None of these resolves to a buy/pass output. The product surfaces evidence and
its limits; the analyst decides.

### 3.1 V1 core product loop

Submission-ready V1 must demonstrate this complete loop end to end. No
automatic investment recommendation is introduced at any step.

| Step | What happens | V1 surface |
|---|---|---|
| **DISCOVER** | a candidate appears through sourcing, carrying discovery provenance (which engine, which query, when) | Sourcing (sec. 22) |
| **RESEARCH** | canonical sources, claims, people, and signals are collected for the candidate | research pipeline; the app shows research state and gaps |
| **SCREEN** | the deterministic Screening analysis evaluates evidence quality and what the available evidence implies | Company > Screening, via the production read path (sec. 32, Phase 6D-B) |
| **INSPECT** | the analyst traces every conclusion back to its evidence and sees the research gaps | dimension > criterion > claim > source drawer; Research gaps section |
| **REFINE** | the analyst refreshes research or investigates missing evidence | Research gaps > research questions; re-ingestion updates coverage/confidence |
| **EXPORT / USE** | the analyst uses the resulting evidence-backed Screening work product | company evidence + Screening export (sec. 24) |

---

## 4. Analytical maturity rules

### PRIMARY / FRONTEND-READY

May appear as headline information, in tables, and in default company views:

- Screening Thesis Fit (continuous, `analyticalMode = "screening"`, always
  with Coverage and Confidence beside it)
- Screening display state (`SCREENED` / `INSUFFICIENT_EVIDENCE`)
- Evidence Coverage (overall and per-dimension)
- Evidence Confidence (overall and per-dimension)
- dimension-level Screening analysis (7 dimensions, criterion breakdown)
- evidence gaps (missing / thin dimensions, critical-dimension gaps,
  unresolved conflicts)
- sources / provenance (claim -> criterion -> claim -> source)

### SECONDARY / PROVISIONAL

Contextual diagnostics only. Never a headline KPI card, never beside Fit as an
equal, never summed into a composite:

- Temporal Momentum (`positiveMomentum` / `negativeMomentum` / `netMomentum`)
- Signal Convergence (positive / negative / net)

Phase 6C findings that force this treatment:

- Momentum vs Convergence correlation = 0.79 on the real corpus (substantially
  redundant, driven by event sparsity)
- Convergence median = 25.0 (the value of a single active family at breadth
  1 of 3; low information)
- a single SignalEvent can produce a normal-looking Momentum / Convergence
  profile (23 of 39 companies are sparse)
- `operating_growth` Momentum family (weight 0.30, the highest) is
  structurally inert on this corpus
- `SignalEvent.evidenceIds` is unpopulated for all 113 events; no cross-layer
  proposition link exists
- latent cross-layer double-counting risk between Screening `growth_momentum`,
  Momentum, and Convergence from the same dated statement

The UI must therefore present the **underlying signal context** (the events
themselves) before, and more prominently than, any temporal score.

### Neither shown nor implied

- Action Priority (inactive; `PriorityState` is workflow vocabulary only)
- conventional numerical ranking (Phase 6A: not built)
- Underwriting Thesis Fit (dormant, unvalidated; not in V1)
- any composite / Trust / relevance-tier value

---

## 5. Navigation

Smallest coherent architecture for a professional sourcing workflow.

### Primary navigation (V1)

| Item | Purpose |
|---|---|
| **Sourcing** | the default landing surface: candidate discovery from public-feed and X channels, ahead of the researched universe |
| **Worklist** | the qualified research universe as a table (route `/worklist`) |
| **Companies** | the same 39 entities reached by name / A-Z rather than by the worklist's working order; effectively a directory |
| **Methodology** | how Screening, evidence sufficiency, coverage, confidence, and the temporal diagnostics work, plus limitations and calibration discipline |

Worklist and Companies are two views of one dataset. They are kept separate
because the worklist is a *working queue* (filtered, sorted, annotated by the
analyst) and Companies is a *stable index* (always complete, always A-Z). If
user testing in 6D-B shows the distinction is noise, collapse to one.

### Secondary navigation (SHOULD HAVE, not V1-critical)

Reached from within a company or from a "browse all" affordance, not as
top-level tabs:

- **Evidence** - a cross-company view of EvidenceClaims (filter by criterion,
  provenance, source type, contradiction status)
- **Sources** - the 222 SourceRecords, their reliability class, independence
  lineage, and what cites them
- **Signals** - a cross-company SignalEvent stream (recent events across the
  universe), clearly labelled as a provisional temporal diagnostic

### Company-level navigation (tabs or in-page sections within one company)

`Overview` / `Screening` / `Evidence` / `Signals` / `Research gaps` /
`People` / `Sources`. See sec. 17.

### Sourcing (V1 requirement; slot reserved now)

- **Sourcing** - discovered candidates and the research queue (sec. 22). The
  navigation slot is reserved next to Worklist now. A "Not yet available"
  placeholder is acceptable during intermediate development only; a working
  Sourcing capability (candidate discovery, discovery provenance, research
  queue, candidate-to-researched-company transition) is required for final
  submission-ready V1. It is not implemented in Phase 6D-A.

### Explicitly not a navigation item

Priority, Rankings, Opportunities, Shortlist, Recommendations, Portfolio,
Diligence. None of these is a V1 surface.

---

## 6. Default ordering

The worklist default order is a **safe, non-performance ordering**:

> **Default: recently researched first** (by `lastUpdatedAt` desc), with
> **alphabetical by company name** as the stable secondary key and as the
> explicit alternative the analyst can pick in one click.

Rationale: "what did I look at last / what is freshest" is the natural
re-entry point for a working analyst, it changes only when research changes
(not when a metric moves), and it carries no quality implication. Alphabetical
is offered as the neutral fallback for anyone who wants a fixed order.

Canonical ingestion order is available as a third option (useful for
reconciling against Phase 5C/6C artifacts) but is not the default because it
is meaningless to a new viewer.

**Never** the default: Fit, Momentum, Convergence, Coverage, Confidence, or
evidence-sufficiency pass/fail. None of these may be the initial sort, and
none may be a hidden tiebreaker.

When the analyst clicks a sortable column header, the UI shows an explicit
"sorted by you: <column>" indicator that is visually distinct from the
default-order state, so an analyst-chosen sort is never mistaken for a system
recommendation. Clearing the sort returns to the default order.

---

## 7. Main analyst worklist

One row per company. Columns, each classified REQUIRED / USEFUL / SECONDARY /
DO NOT SHOW, with the reason.

| Field | Class | Why |
|---|---|---|
| Company name | REQUIRED | the primary identifier; links to the company page |
| Short description | REQUIRED | one line; lets the analyst recognise the company without opening it. Use `company.description` (already one sentence). |
| Sector / category | REQUIRED | the main scanning and filtering axis for a sourcing analyst; `company.sector` |
| Stage | USEFUL | coarse context (`seed` / `growth` / etc.); cheap, one token, aids filtering |
| Screening display state | REQUIRED | `SCREENED` vs `INSUFFICIENT_EVIDENCE` is the single most important "can I evaluate this yet" signal; must be legible at a glance |
| Evidence Coverage | REQUIRED | "how much evidence do we have"; shown as a rounded percent with a small bar, never alone as a number implying precision |
| Evidence Confidence | USEFUL | "how reliable is what we have"; shown next to Coverage, visually distinct, so the two are never conflated |
| Screening Thesis Fit | USEFUL | continuous context; shown rounded to a whole number with a required qualifier that it is evidence-conditional (sec. 8). Not the sort key. Not banded. |
| Evidence-sufficiency status | USEFUL | passes / does not pass the Screening evidence-sufficiency mechanics; terminology must not imply mandate qualification (sec. 9) |
| Major evidence gap | USEFUL | the single most material gap (e.g. "capital_efficiency: no evidence"); a pointer to "what to research next", not a score |
| Recent signal context | SECONDARY | most recent SignalEvent: date + type + direction, as plain text (e.g. "2026-08-17 customer momentum, positive"). No Momentum number in the row. |
| Source count | SECONDARY | distinct source count; a rough evidence-density cue, useful when scanning, low priority |
| Last research update | USEFUL | `lastUpdatedAt`; also the default sort key, so it must be visible |
| Momentum / Convergence scores | DO NOT SHOW (in the row) | provisional; a number in a dense table reads as a KPI and invites ranking. Available on the company page as a labelled diagnostic. |
| Priority | DO NOT SHOW | inactive concept |
| People / founder names | DO NOT SHOW (in the row) | belongs on the company page; clutters the scan |
| Financials (raised / round / headcount) | DO NOT SHOW (in the row) | mostly `unknown` in the corpus; showing blanks is worse than omitting |
| Any rank number | DO NOT SHOW | forbidden |

Density target: name, description, sector, stage, display state, Coverage,
Confidence, Fit, evidence-sufficiency, one gap, one recent-signal string, last
update. Around 11 to 12 columns. Everything else is on the company page.

---

## 8. Screening Fit presentation

Fit is **continuous, evidence-conditional context**. It is not a
recommendation, not precise, not a rank key.

Rules:

- **Display precision: whole numbers.** Phase 6C reports Fit to many internal
  decimals; the corpus range is ~31 points wide with 80% of companies between
  52 and 73 and Fit strongly a function of Coverage (r = 0.88). Decimals imply
  a discrimination the method does not have. Show `62`, not `62.47`. Internal
  values are unchanged; only the display rounds.
- **Never banded, never labelled.** No `STRONG` / `SOLID` / `MARGINAL` /
  `WEAK`, no colour that encodes a quality verdict, no "top quartile". A
  neutral single hue or a simple position marker on a 0 to 100 track is
  acceptable; a red/amber/green scale is not.
- **Always paired with Coverage and Confidence.** Fit is shown in a triad, not
  alone. Low coverage visibly qualifies the Fit value in the same view.
- **`analyticalMode = "screening"` label is always present** on any Fit
  display, so a Screening Fit is never mistaken for an Underwriting Fit.
- **Tooltip / expandable note** on every Fit value: "Screening Thesis Fit is a
  continuous analytical output computed from public evidence across 14
  Screening criteria. It is not an investment recommendation and does not rank
  companies. Values compress toward 50 when evidence coverage is thin
  (coverage here: NN%)."
- **The neutral-50 prior is explained** wherever Fit appears at scale (the
  worklist column header links to the methodology note): a thin-coverage
  company sits near 50 because missing evidence is filled with a neutral
  prior, not because it was judged average.

No default ordering by Fit. Analyst-selected sort by Fit is allowed and is
labelled as analyst-chosen (sec. 6, sec. 19).

---

## 9. Coverage and Confidence

Two permanently separate outputs. No `Trust`, `Quality`, `Reliability`, or
`Composite Confidence`.

| | Evidence Coverage | Evidence Confidence |
|---|---|---|
| Question | How much of the framework is backed by admissible evidence? | How reliable is the evidence we do have? |
| Range on corpus | 0.03 to 0.88, median 0.51 | 0.55 to 0.88, median 0.70 |
| Presentation | rounded percent (`51%`) + a fill bar | rounded percent (`70%`) + a distinct treatment (e.g. a small segmented gauge), never the same bar style as Coverage |
| Label | "Evidence coverage" | "Evidence confidence" |
| Tooltip | "Share of Screening criteria with admissible sourced evidence. Missing criteria are filled with a neutral prior and are not scored for or against the company." | "Reliability of the evidence that exists, from source reliability class, origin de-duplication, and freshness. It does not increase with more evidence." |

The two must be **visually adjacent and visually different**. Phase 6C shows
why the distinction matters: Braintrust (coverage 0.08, confidence 0.88),
David AI (0.06 / 0.85), XBOW (0.03 / 0.85) have high confidence on near-zero
coverage. The UI must make "confident about almost nothing" obvious, not
average the two into a middling score. The display sufficiency rule already
marks all three `INSUFFICIENT_EVIDENCE`; the coverage/confidence pair must
tell the same story visually.

Percentages and small bars/gauges are appropriate. A single blended score is
not. Exact visual styling is deferred to 6D-B.

---

## 10. Evidence sufficiency

Three distinct concepts, each with its own label, never merged:

| Concept | Source | V1 label | What it means |
|---|---|---|---|
| **Display sufficiency** | `screeningDisplayState` | "Screening: shown / not shown" or the state token `SCREENED` / `INSUFFICIENT_EVIDENCE` | whether the Screening result is complete enough to display at all (`>= 0.30` overall coverage AND `>= 2` of 7 dimensions at `0.40`) |
| **Evidence sufficiency** | `evaluateScreeningEvidenceEligibility` | "Evidence sufficiency: meets / does not meet the Screening evidence bar" | whether the evidence is sufficient for responsible comparative screening (coverage `>= 0.50`, confidence `>= 0.60`, 4 of 7 dimensions at `0.50`, both critical dimensions nonzero, no material blocking conflict) |
| **Mandate eligibility** | `mandate.ts` (not evaluated for the 39) | "Mandate: not yet assessed" for all current companies | whether the company is in investment scope; deterministic; independent of evidence and of quality |

Presentation requirements:

- Never render evidence sufficiency as "16 of 39 qualify" or any count that
  reads as a shortlist. Phase 6C's 16/39 figure assumed `mandateEligibility =
  ELIGIBLE` for every company and did **not** independently assess mandate.
  The UI must not reproduce that number as a headline.
- The evidence-sufficiency status on a company page carries an explicit note:
  "Assessed under the assumption that the company is mandate-eligible. Mandate
  eligibility has not been independently evaluated for this company."
- When a company does not meet the bar, show **which precondition failed**
  (coverage below 0.50, a critical dimension at zero coverage, etc.), because
  that is directly actionable research guidance.
- "Meets the Screening evidence bar" is never phrased as "qualified",
  "approved", "passed screening" (which sounds like an investment verdict), or
  "eligible" without the "evidence" qualifier.

---

## 11. Dimension analysis

Company-level presentation of the seven Screening dimensions:
`capital_efficiency`, `growth_momentum`, `founder_alignment`,
`market_quality`, `business_model_quality`, `gtm_quality`,
`competitive_position`.

Information hierarchy (top = always visible on the Screening tab; deeper =
expand on demand):

1. **Dimension row** (always visible): dimension name, its rounded score, its
   coverage bar, its confidence indicator, and a one-word coverage flag
   (`covered` / `thin` / `missing`). Critical dimensions
   (`capital_efficiency`, `growth_momentum`) are marked as critical.
2. **Expand a dimension** -> criterion-level breakdown: each Screening
   criterion under that dimension, its raw anchor, its coverage (0 / 0.5 / 1),
   and whether it was filled with the neutral prior.
3. **Expand a criterion** -> supporting claims: each EvidenceClaim mapped to
   the criterion, with source, date, provenance, and included/excluded status.
4. **Within a criterion**: contradictions (claims marked `contradictedBy`),
   and excluded evidence (claims that are inadmissible for scoring coverage:
   `assumption` / `unknown` / `estimated_range`, or `derived` without
   resolvable input ids) shown in a separate "not scored" group with the
   reason.

Rules:

- The neutral-50 fill is labelled everywhere it occurs, so a criterion at 50
  reads as "no evidence either way", not "judged mediocre".
- `capital_efficiency` and `growth_momentum` thinness is highly visible: on
  this corpus `capital_efficiency` median coverage is 0.30 and several
  otherwise-`SCREENED` companies fail evidence sufficiency solely because one
  critical dimension has exactly zero coverage.
- Do not build any of this in 6D-A. This is the hierarchy spec for 6D-B.

---

## 12. Evidence gaps

Evidence gaps are a **first-class product concept**, surfaced on the worklist
(one gap per row) and as a dedicated company section.

The company "Research gaps" section shows, in priority order:

1. **Critical-dimension gaps** - `capital_efficiency` or `growth_momentum`
   with zero or near-zero coverage. Flagged most prominently because they
   block evidence sufficiency.
2. **Missing dimensions** - any of the 7 with zero coverage.
3. **Thin dimensions** - coverage below the level needed for the evidence bar
   (below 0.50), or fewer criteria filled than the framework expects.
4. **Unresolved conflicts** - EvidenceClaims with `contradicts` /
   `contradictedBy` set and no resolution note, especially any marked material
   to entity identity, mandate, or investment interpretation.
5. **Missing primary evidence** - criteria resting only on company-reported or
   third-party-estimate claims where an independent origin would matter
   (the corpus has only 4 claims with independent-origin support).
6. **Research questions** - concrete next-research prompts derived from the
   above, drawing on `EvidenceClaim.diligenceQuestion` where present and the
   `research-standard.md` protocol.

Output framing: "What should I research next?" Never "what should I invest
in?". A gap section never produces a score, a verdict, or a recommendation to
pursue or drop the company. Closing a gap changes coverage/confidence
mechanically; it does not "improve the company".

---

## 13. Evidence / claim detail

Fields per EvidenceClaim and where each belongs:

| Field | Inline (in criterion list) | Expandable detail | Dedicated Evidence view |
|---|---|---|---|
| claim text (prose) | yes (one line, truncated) | full text | full text |
| criterion mapped | yes | yes | yes (as a filter) |
| source name | yes | yes | yes |
| source type / subtype | no | yes | yes (filter) |
| source date (`publicationDate` / `metricAsOfDate`) | yes | yes | yes |
| reliability class | no | yes | yes |
| freshness / currentness | icon only | yes, with the observation date and as-of date | yes |
| provenance (`sourced` / `derived` / `assumption` / ...) | badge | yes, with admissibility note | yes (filter) |
| included / excluded for scoring | badge (`scored` / `not scored`) | yes, with reason | yes (filter) |
| contradiction status | icon if contradicted | yes, linked to the conflicting claim | yes (filter) |
| rationale / notes | no | yes | yes |
| `verbatimExcerpt` | no | yes if present | yes if present |
| raw article body | never | never | never |

Rules:

- **No raw article bodies anywhere.** The corpus does not store them
  (`limitations.md`: no page crawling); the UI shows the claim, the excerpt if
  present, and a link out to the source URL.
- Inline stays to one line per claim. Everything else is one expand away.
- The dedicated Evidence view (SHOULD HAVE, not V1) is the cross-company
  version: all 510 claims, filterable, for an analyst auditing evidence
  quality across the universe.

---

## 14. Source provenance

The analyst must be able to trace any analytical output back to its sources:

> Screening Fit value -> dimension -> criterion -> EvidenceClaim(s) -> SourceRecord(s)

with the origin lineage (`SourceRecord.originatesFrom` to root, company-origin
collapse) visible.

V1 mechanism: a **source drawer / side panel**. Clicking a claim's source
anywhere (criterion breakdown, gap list, signal event) opens a right-side
panel showing the SourceRecord: name, publisher, URL, reliability class, tier,
independence lineage, publication date, and the list of claims and events in
the corpus that cite it. The panel is non-modal and does not navigate away, so
the analyst keeps their place in the dimension breakdown.

- Expandable inline citations (claim -> source name -> hover for reliability)
  cover the quick case.
- A dedicated **Sources** page (SHOULD HAVE) lists all 222 SourceRecords for
  systematic review.
- Do not require a full page navigation for a single "where did this come
  from" question. The drawer answers it in place.

Not implemented in this phase.

---

## 15. Temporal signal presentation

Momentum and Convergence are **subordinate** to the calibrated Screening
architecture. Present the signal context before the score.

On the company **Signals** tab, in this order:

1. **Recent SignalEvents list / timeline** - the primary content. Per event:
   `eventDate`, `signalType` and its family, `signalDirection`
   (positive / negative / neutral), a one-line `evidenceSummary`, and the
   source (opens the source drawer). Events in reverse-chronological order.
2. **Event summary counts** - total events, count by direction, number of
   distinct contributing families, number of distinct sources. These are the
   context that tells the analyst how much the temporal picture rests on.
3. **Momentum and Convergence values** - shown *below* the events, labelled
   "Provisional temporal diagnostic - not calibrated, not validated on real
   companies, not a decision input". `positiveMomentum`, `negativeMomentum`,
   `netMomentum` shown as three separate numbers (never net alone).
   Convergence positive / negative / net likewise.

Constraints:

- **Not a headline KPI card.** Momentum / Convergence never sit beside Fit as
  equal-weight cards on the Overview. On Overview, at most a single muted line:
  "Recent signals: N events, most recent 2026-08-17. See Signals."
- **No composite.** Fit and the temporal signals are never added, averaged, or
  shown as one combined indicator.
- **Redundancy noted.** The Signals tab carries a short note that on the
  current corpus Momentum and Convergence are ~0.79 correlated and largely
  reflect the same sparse events.

---

## 16. Negative signals

Negative temporal information stays **visually explicit and never netted away
in the display**.

- `negativeMomentum` and `negativeConvergence` are always rendered as their
  own values next to the positive components, even when `netMomentum` is
  positive. Phase 6C: Lovable (net Momentum +7.96) and Vercel (+3.50) both
  carry a visible negative component from a security incident; that component
  must remain on screen.
- Any negative SignalEvent (`security_incident`, risk deterioration, negative
  operating signal, other material negative event) is shown in the events list
  with a distinct negative treatment and is **not collapsed** into a net
  figure.
- A company with any negative event carries a small persistent marker on the
  Signals tab header ("includes negative signals") so a positive net score
  never hides that a negative event exists.
- The UI states no rule about whether negatives *should* net against
  positives; that is an open methodology question for a later phase. It only
  guarantees the negative is visible. No new scoring rule is created.

---

## 17. Sparse temporal data guardrail

Phase 6C: one SignalEvent can produce a normal-looking Momentum (~11) and the
modal Convergence (25.0).

Guardrail (contextual labels, not a threshold):

- Any Momentum or Convergence value derived from **1 event**, **1
  contributing family**, or **fewer than 3 distinct sources** is shown with a
  "based on limited signal data (N events, M families)" label directly
  adjacent to the number.
- The event count and contributing-family count are **always** shown next to
  any temporal figure, sparse or not (Phase 6C sec. 17 requirement).
- A Convergence of exactly 25.0 carries a note that this is the value of a
  single active signal family and carries little comparative information.
- **No minimum-event threshold is introduced.** Sparse values are labelled,
  not suppressed or blocked.

---

## 18. Company detail page

Minimum high-value structure. One company, tabbed or long-scroll with a sticky
section nav.

### Above the fold (Overview, always visible)

- company name, one-line description, sector, stage, HQ, private/public
- Screening display state (`SCREENED` / `INSUFFICIENT_EVIDENCE`)
- the Fit / Coverage / Confidence triad (rounded, with the mode label and the
  evidence-conditional note)
- evidence-sufficiency status + the "mandate not independently assessed" note
- the single most material evidence gap
- last research update date, source count
- one muted line for recent signal context (date + type of most recent event)

Explicitly **not** above the fold: any Momentum/Convergence number, any
People detail, any raw claim list, any Priority, any recommendation.

### Primary sections

| Section | Content | V1 |
|---|---|---|
| **Overview** | the above-the-fold block plus a short narrative from `company.notes` / `description` | MUST |
| **Screening** | the 7-dimension breakdown (sec. 11), Fit triad, display-state explanation | MUST |
| **Research gaps** | the gap hierarchy (sec. 12) and research questions | MUST |
| **Evidence** | claims grouped by criterion, with provenance and scored/not-scored status (sec. 13) | MUST |
| **Signals** | the events-first temporal view (sec. 15-17) | SHOULD |
| **Sources** | SourceRecords cited for this company, with lineage | SHOULD |
| **People** | founders / executives from Person records | SHOULD |

### Secondary drill-down

criterion -> claim -> source drawer; conflict -> conflicting claim;
event -> source. All in-place (drawer / expand), not full navigation.

The page must be legible without a presenter: every metric has an inline
definition or a one-hover tooltip, and every state token
(`SCREENED`, evidence-sufficiency status) links to its methodology
explanation.

---

## 19. Worklist filters

Smallest useful V1 set:

| Filter | V1 | Why |
|---|---|---|
| Screening display state (`SCREENED` / `INSUFFICIENT_EVIDENCE`) | MUST | the core "can I evaluate this" cut |
| Evidence sufficiency (meets / does not meet the Screening evidence bar) | MUST | the analyst's main triage axis |
| Sector | MUST | the primary sourcing dimension |
| Critical evidence gap present (`capital_efficiency` or `growth_momentum` at zero coverage) | SHOULD | directly drives the research queue |
| Stage | SHOULD | coarse scoping |
| Coverage band (e.g. below 0.30 / 0.30 to 0.50 / above 0.50) | SHOULD | broad, not a fine-grained slider |
| Last researched (before / after a date) | SHOULD | freshness triage |
| Has recent signals (event in last N days) | POST-V1 | provisional data; low priority |
| Confidence band | POST-V1 | tight distribution (0.65 to 0.77 for most); low discriminating value |
| Source type | POST-V1 | belongs on the Evidence/Sources views, not the worklist |

Filters are additive and their active state is always visible with a "clear
all" control. No filter is applied by default. Do not add a filter just
because a field exists (headcount, founder, investor, archetype: not filters).

---

## 20. Worklist sorting

Three separate concepts, kept distinct in the UI:

- **Filtering**: which rows are shown. Reversible, visible, never default-on.
- **Sorting**: the order of the shown rows. Analyst-controlled. When active,
  labelled "sorted by you: <column>", visually distinct from default order.
- **Ranking**: a system-assigned position implying merit. **Not implemented,
  not shown, forbidden.**

Columns the analyst may manually sort by:

- Company name (A-Z / Z-A)
- Last research update
- Evidence Coverage
- Evidence Confidence
- Screening Thesis Fit
- Signal recency (most recent event date)

Manual sort by Fit / Coverage / Confidence is allowed **because the analyst
chose it** and it is labelled as such. It is never the default, never a
tiebreaker in the default order, and the column header carries the same
"not a ranking" note as elsewhere.

Default sort: last research update desc, name asc as tiebreaker (sec. 6).
There is no score-based default sort.

---

## 21. Search

V1 search scope (minimum useful):

- **company name and aliases** - MUST
- **company description and sector** - MUST

V1 search is company-resolution: type a name or a sector word, get the
company. Implemented over the existing `search-index.json` (MiniSearch) which
already indexes the corpus.

POST-V1 scope: EvidenceClaims (claim text), people (names, roles), sources
(publisher, URL). These make search a research tool rather than a navigation
tool; defer until the Evidence and Sources views exist to land results in.

Not implemented in this phase.

---

## 22. Sourcing (V1 requirement)

Sourcing is not implemented in Phase 6D-A, but it is part of submission-ready
V1, not a post-V1 capability. Reserve the correct IA location and vocabulary
now; build the capability in a dedicated V1 implementation phase (it follows
Phase 6D-C, or is folded into it - sec. 33).

Reserved navigation slot: **Sourcing**, adjacent to Worklist. A "not yet
available" placeholder state (sec. 28) is acceptable during intermediate
development only. Final submission-ready V1 must demonstrate:

- **candidate discovery** - candidates surfaced by a sourcing engine
- **discovery provenance** - which engine, which query, when; a distinct
  provenance type from source provenance, with its own display
- **candidate research queue** - candidates awaiting research, as a Sourcing
  sub-surface (not a worklist filter)
- **candidate-to-researched-company transition** - the point where a discovered
  candidate acquires an EvidenceClaim corpus and a Screening result and moves
  onto the Worklist
- **integration with the canonical research workflow** (sec. 23)

Entity vocabulary, kept distinct (aligns with the conceptual state machine
`DISCOVERED -> RESEARCHING -> {OUT_OF_SCOPE | INSUFFICIENT_EVIDENCE} |
SCREENED -> EVIDENCE_ELIGIBLE -> ...`):

| Term | Meaning | On the worklist? |
|---|---|---|
| **discovered candidate** | surfaced by a sourcing engine; not yet researched; has discovery provenance only | no - lives in Sourcing |
| **researched company** | has an EvidenceClaim corpus and a Screening result | yes |
| **SCREENED company** | researched + passes display sufficiency | yes, with `SCREENED` state |
| **evidence-sufficient company** | meets the Screening evidence bar (under assumed mandate eligibility) | yes, with the evidence-sufficiency status set |

The research queue (candidates awaiting research) is a Sourcing sub-surface,
not a worklist filter. Discovery provenance (which engine, which query, when)
is a distinct provenance type from source provenance and gets its own
display when Sourcing is built.

All 39 current companies are "researched" and most are "SCREENED"; none is a
"discovered candidate".

---

## 23. Research workflow

The analyst path, and what the product supports at each step in V1:

| Step | V1 support |
|---|---|
| discovered candidate | V1 (Sourcing, sec. 22) - discovery + discovery provenance + research queue; not built in 6D-A |
| research | external to the app in V1 (research is a build-corpus pipeline); the app *shows* research state and gaps |
| evidence inspection | Evidence section + source drawer (MUST) |
| Screening result | Screening section (MUST) |
| evidence-gap resolution | Research gaps section lists what to research; resolution happens in the research pipeline, then re-ingested (SHOULD: show a "last updated" delta) |
| evidence-sufficient opportunity set | the worklist filtered to "meets the Screening evidence bar" - a **working set, not a shortlist**, never ordered by merit |

No automated Priority. The app never advances a company through this workflow
on its own; it reflects the state the research corpus is in.

---

## 24. Human actions (V1)

Conservative. Analyst-owned, none producing an investment output:

| Action | V1 | Notes |
|---|---|---|
| Open evidence (jump to a claim / criterion / source) | MUST | pure navigation |
| Add note (free-text, attached to a company) | SHOULD | needs a persistence layer (not present today); if no persistence in V1, defer |
| Flag for re-research (mark a company as "needs a research refresh") | SHOULD | a lightweight analyst annotation; same persistence caveat |
| Mark a gap as "acknowledged" / "will research" | SHOULD | annotation on the gap list |
| Archive / hide from worklist | POST-V1 | needs persistence; low urgency at 39 companies |
| Export a company's evidence + Screening summary | SHOULD | read-only, useful for the analyst's own memo-writing |

Explicitly not V1 actions: "Start diligence" (no Underwriting-entry function
exists), "Escalate" / "Monitor" / "Pass" (forbidden automatic decisions),
"Add to shortlist" (no shortlist concept), anything that sets a Priority.

If V1 ships without a persistence layer, all annotation actions (note, flag,
acknowledge) become POST-V1 and V1 is read-only. That is an acceptable V1.

---

## 25. Mandate presentation

Mandate Eligibility is conceptually separate from investment quality and from
evidence sufficiency.

Eventual states: `ELIGIBLE` / `INELIGIBLE` / `INSUFFICIENT_EVIDENCE`.

V1 treatment:

- For all 39 current companies, mandate status displays as **"not yet
  assessed"**. It is not inferred, not defaulted to `ELIGIBLE`, not derived
  from the Phase 6C diagnostic assumption.
- Mandate status has its own field and its own label. It is never merged into
  Fit, never merged into the evidence-sufficiency status, never shown as part
  of a composite.
- Where evidence sufficiency is shown, the note "assessed assuming mandate
  eligibility; mandate not independently evaluated" is attached (sec. 10).
- When mandate evaluation is later run, `INSUFFICIENT_EVIDENCE` for mandate is
  displayed distinctly from `INSUFFICIENT_EVIDENCE` for Screening display
  sufficiency - different concept, different label ("Mandate: insufficient
  evidence to determine scope").

---

## 26. Methodology transparency

Accessible, not dominating.

- A top-level **Methodology** nav item (sec. 5) holds the full explanations:
  Screening framework and the 14 criteria, evidence sufficiency and its
  preconditions, coverage vs confidence, the neutral-50 prior, temporal
  diagnostics and their provisional status, the fact/event firewall,
  calibration discipline (thresholds frozen before holdout analysis, three
  sealed cohorts), and the dataset-leakage caveat (the 39 companies were
  consumed by calibration/validation/final-test and are used only
  descriptively).
- **Limitations** are a section within Methodology, not hidden: no
  real-company production scoring, no backtest, thin independent
  corroboration, financials mostly unknown, numeric values not extracted.
- Every metric in the workflow links to its specific methodology anchor
  (deep-link, not "go read the whole page").
- Inline tooltips carry the one-sentence version; the Methodology page carries
  the full version. The workflow never *requires* opening the Methodology page
  to be usable, but every claim the product makes is one click from its
  basis.

---

## 27. Recruiting / portfolio view

A first-time viewer (recruiter, investor) spends a few minutes. The IA must
let them understand, without marketing copy and without a separate "demo
mode":

- **What it does**: a short framing block on the Worklist (or a dedicated
  "About" that is also linked from Methodology): "Digital Asset Venture Intelligence helps an
  analyst discover, research, and screen private companies using
  provenance-backed evidence. It does not recommend investments."
- **Why it is different from generic AI research tools**: every analytical
  output traces to a specific EvidenceClaim and SourceRecord; no score is
  produced by a language model; thresholds are calibrated against sealed human
  judgment cohorts; the product deliberately refuses to rank or recommend.
- **What is calibrated**: the Screening evidence-sufficiency gate (and only
  that).
- **What is deterministic**: all scoring math, the evidence adapter, coverage
  and confidence, mandate logic.
- **Where human judgment remains**: mandate assessment, priority, the decision
  to underwrite, the investment decision - all human, none automated.
- **How provenance works**: a single worked example (one Fit value -> one
  dimension -> one criterion -> one claim -> one source) reachable in two
  clicks from the worklist.

This is achieved by making the real product legible (tooltips, traces, state
explanations), not by building a parallel presentation. Analyst utility is not
sacrificed for the demo; the demo *is* the analyst view, well-labelled.

---

## 28. Empty / error / unknown states

Every one of these has a specified interface state. Missing data never renders
as `0`, blank, or a false negative.

| Situation | State |
|---|---|
| no research on a company | "Not yet researched" - no Fit, no coverage bar; show discovery info only. Not `0%`. |
| insufficient evidence (display) | `INSUFFICIENT_EVIDENCE` token + "why" (coverage below 0.30, or fewer than 2 dimensions at 0.40) + which dimensions are thin |
| does not meet the evidence bar | show the specific failed precondition, not a bare "no" |
| missing source (a claim references a source not in the corpus) | "Source record unavailable" in the drawer, with the raw `sourceUrl` if present; flagged as a data issue |
| unresolved contradiction | both claims shown side by side, marked "unresolved", with the `contradictionNote` if any; never silently pick one |
| no recent signals | "No signal events recorded" - not "Momentum: 0". Zero events and zero Momentum are different statements. |
| temporal metric on sparse data | the value plus "based on limited signal data (N events, M families)" (sec. 17) |
| research pipeline failure / stale generation | a corpus-level banner: "Research data last generated <date>; a refresh may be pending" using `MANIFEST.json` / `generatedAt` |
| unknown mandate status | "Mandate: not yet assessed" (sec. 25) - never "eligible" by default |
| a company field is `unknown` provenance (headcount, raised) | "Not disclosed" with the corpus note, not `0` or blank |

Distinguish, in copy and treatment: **no data** vs **data says zero** vs
**data is thin**. These are three different states.

---

## 29. Accessibility / responsive requirements (for 6D-B)

Requirements only. No design performed here.

### Responsive

- **Desktop (primary)**: the worklist is a dense multi-column table; full
  company detail with side-by-side dimension breakdown and source drawer.
- **Tablet**: worklist reduces to the REQUIRED columns plus Coverage; the
  source drawer becomes a full-width sheet; dimension breakdown stacks.
- **Mobile**: worklist becomes a card list (name, description, sector, display
  state, coverage) - one company per card; company detail is single-column,
  sections collapse; the worklist is usable for triage, not deep analysis.
- Wide tables must scroll within their own container; the page body never
  scrolls horizontally.
- The company detail page must be fully usable at 360px width.

### Keyboard

- Full keyboard navigation of the worklist (row focus, open company, sort a
  column, toggle a filter) without a mouse.
- The source drawer and every expand/collapse is keyboard operable and traps
  focus appropriately when modal-like.
- Visible focus indicators throughout.

### Screen readers

- The worklist is a proper semantic table with column headers associated to
  cells; sort state announced.
- State tokens (`SCREENED`, evidence-sufficiency, mandate) have text
  equivalents, never colour-only.
- Coverage / Confidence bars and gauges carry an accessible label with the
  numeric value.
- Tooltips are reachable and readable by assistive tech (not hover-only).

### Contrast and colour

- WCAG AA contrast minimum for all text and meaningful UI.
- No information conveyed by colour alone - every colour cue has a shape, icon,
  or text partner. This matters especially for negative signals (sec. 16) and
  the coverage/confidence distinction (sec. 9).
- Fit must not use a red-to-green quality gradient (sec. 8).

### Dense data

- Tables remain legible at high row counts; sticky header; row hover and focus
  states; comfortable and compact density options.

---

## 30. Conceptual component map

Responsibility boundaries only. Names illustrative. No files created.

| Component | Responsibility | Consumes |
|---|---|---|
| `WorklistTable` | render the qualified universe as rows; own sort/filter state; render the default-order vs analyst-sorted distinction | company summaries, filter state |
| `WorklistRow` | one company's scannable line | one company summary |
| `WorklistFilterBar` | the minimal filter set (sec. 19); active-state display; clear-all | filter options |
| `CompanyHeader` | above-the-fold identity + state block | one company overview |
| `ScreeningSummary` | the Fit / Coverage / Confidence triad with mode label and evidence-conditional note | Screening result |
| `FitDisplay` | render a single Fit value: rounded, unbanded, with tooltip | one Fit value + coverage |
| `CoverageConfidencePair` | the two-metric, visually-distinct, never-merged display | coverage + confidence |
| `DisplayStateBadge` | `SCREENED` / `INSUFFICIENT_EVIDENCE` with "why" | display state + reason |
| `EvidenceSufficiencyBadge` | meets / does not meet the evidence bar; failed-precondition detail; mandate-assumption note | eligibility result |
| `MandateStatus` | mandate state, defaulting to "not yet assessed" | mandate status (or none) |
| `DimensionBreakdown` | the 7-dimension hierarchy (row -> criterion -> claim) | dimension results |
| `DimensionRow` | one dimension: score, coverage, confidence, critical flag | one dimension result |
| `CriterionDetail` | one criterion: anchor, coverage, neutral-fill flag, claims | one criterion result |
| `EvidenceClaimItem` | one claim inline: text, source, date, scored/not-scored badge | one claim |
| `EvidenceClaimDetail` | the expanded claim: full fields, contradiction link, exclusion reason | one claim + related |
| `ExcludedEvidenceGroup` | the "not scored" claims with reasons | inadmissible claims |
| `EvidenceGapPanel` | the prioritised gap hierarchy + research questions | dimension coverage, conflicts, claim provenance |
| `ResearchQuestionList` | concrete next-research prompts | gaps + `diligenceQuestion` fields |
| `SignalTimeline` | events-first reverse-chronological list | SignalEvents for a company |
| `SignalEventItem` | one event: date, type, family, direction, summary, source | one SignalEvent |
| `SignalSummaryCounts` | event count, direction split, family count, source count | SignalEvents |
| `TemporalDiagnosticPanel` | Momentum + Convergence, separated components, provisional label, sparse-data label | momentum + convergence outputs + counts |
| `SourceDrawer` | non-modal side panel: one SourceRecord + its citing claims/events + lineage | one SourceRecord + back-references |
| `CitationLink` | inline claim -> source affordance that opens the drawer | source ref |
| `MethodologyLink` | deep-link from any metric to its methodology anchor | anchor id |
| `MetricTooltip` | the one-sentence version of any metric definition | metric key |
| `EmptyState` | the specified no-data / thin-data / zero-data variants (sec. 27) | situation key |
| `CorpusFreshnessBanner` | "research data last generated <date>" | MANIFEST metadata |
| `SourcingPlaceholder` | the reserved "not yet available" Sourcing surface | nothing |
| `CompanySearch` | name / sector resolution over the search index | search index |
| `AboutPanel` | the recruiting-view framing block | static content |

---

## 31. Data requirements

For each surface: what exists, what needs plumbing, what is missing, what must
not be exposed.

### Already available (generated corpus, schema v6)

- company identity, description, sector, subsector, stage, HQ, private flag,
  founder ids, source ids (`companies.json`, 39 records)
- EvidenceClaims with claim text, source, dates, provenance, topic,
  contradiction fields (`evidence.json`, 510 records)
- SourceRecords with reliability, tier, `originatesFrom` (`sources.json`, 222)
- Person records (`people.json`, 84)
- SignalEvents with type, category, direction, date, `rawStrength`,
  `claimConfidence`, `evidenceSummary` (`signal-events.json`, 113)
- research-quality metrics (`research-summary.json`)
- review queue (`review-queue.json`, 2 items: unconfirmed financing)
- search index (`search-index.json`, MiniSearch)
- generation manifest with `generatedAt` and config hashes (`MANIFEST.json`)

### Available only through diagnostic plumbing (Phase 6C runner, not production)

- Screening Thesis Fit, Evidence Coverage, Evidence Confidence per company
- per-dimension scores, coverage, confidence
- per-criterion anchors, coverage, neutral-fill status
- Screening display state
- Screening evidence-sufficiency result (computed with `mandateEligibility`
  hard-coded to `ELIGIBLE`)
- Momentum and Convergence (diagnostic-only SignalEvent -> event mapping)

These come from `scripts/diagnostics/phase6c-diagnostics.ts`, which is marked
`DESCRIPTIVE_DIAGNOSTIC_ONLY` and is never imported by app code. **The
frontend cannot read these today.** A production scoring-read path
(a function that runs the scoring engines over the real corpus and returns
results, without persisting a `ScoreSnapshot`) is the prerequisite for the
Screening surfaces. That path does not exist yet and is a Phase 6D-B / later
backend task.

### Not yet available (needs a backend / API)

- a production endpoint returning per-company Screening results
- any persistence for analyst annotations (notes, flags, acknowledgements,
  archive)
- an independent Mandate Eligibility evaluation for the 39 companies
- populated `SignalEvent.evidenceIds` (empty for all 113; needed for
  cross-layer proposition de-duplication)
- discovery provenance / candidate records (Sourcing)
- a temporal-diagnostic mapping that is production-sanctioned rather than
  diagnostic-only

### Must NOT be exposed yet

- **The Phase 6C diagnostic outputs must not become production
  ScoreSnapshots.** Rendering them in a shipped UI would effectively persist
  and publish scores computed on a leaked corpus with an assumed mandate
  status. The Screening surfaces wait for the sanctioned production read path.
- the 16/39 evidence-sufficiency count as a headline or shortlist
- Momentum / Convergence as decision inputs or KPI cards
- any Fit-derived band, ranking, or ordering
- Underwriting Thesis Fit (dormant, unvalidated)
- Priority state as anything other than absent

Consequence for V1 scope: the production Screening read path is a **required
implementation dependency for submission-ready V1**, not an optional add-on.
The Screening frontend is not considered complete until it displays the
existing deterministic Screening outputs - Thesis Fit, Evidence Coverage,
Evidence Confidence, display state, evidence-sufficiency mechanics, dimension-
and criterion-level results, evidence gaps, supporting provenance - through
that sanctioned read path, **without importing any Phase 6C diagnostic
artifact**. The Phase 6C diagnostic runner
(`scripts/diagnostics/phase6c-diagnostics.ts`) and its JSON output stay
non-production and must never become the frontend's data source or a persisted
`ScoreSnapshot`.

The research-and-evidence surfaces (company directory, evidence inspection,
provenance tracing, gaps, signals-as-events, methodology) run entirely on the
existing generated corpus and can be built first (Phase 6D-C); the Screening
surfaces are wired to the Phase 6D-B read path and are equally part of V1. See
sec. 32 and sec. 33.

---

## 32. V1 scope

Submission-ready V1 must demonstrate the complete core origination and
Screening workflow (sec. 3.1). It does **not** ship as a provenance-backed
research database with the principal analytical and sourcing capabilities
deferred.

### MUST HAVE for a submission-ready V1

Corpus-only surfaces (Phase 6D-C, existing generated corpus):

1. **Worklist / company universe** - name, description, sector, stage, source
   count, last update; default order = last researched, alpha tiebreaker;
   analyst-controlled sort with the "sorted by you" distinction (sec. 6, 20);
   **search** over company name / sector; **filters** (sec. 19); no default
   sort by any score.
2. **Company detail** - Overview identity block, `notes` narrative, corpus
   freshness, most-recent-signal line (sec. 18).
3. **EvidenceClaims** - claims grouped by criterion / `topic`, with source,
   date, provenance, scored/not-scored, contradiction status (sec. 13).
4. **SourceRecords + provenance tracing** - source drawer, claim -> criterion
   -> claim -> source, source lineage, back-references (sec. 14).
5. **Research gaps** - the prioritised gap hierarchy and research questions
   (sec. 12).
6. **Signals timeline** - events-first timeline, summary counts,
   negative-signal visibility, sparse-data labels (sec. 15-17).
7. **Methodology / limitations** pages with deep-link anchors (sec. 26).
8. **Useful export capability** - company evidence + Screening summary,
   read-only (sec. 24).
9. **All empty / error / unknown states** (sec. 28).
10. **Responsive / accessible polished frontend** (sec. 29): semantic table,
    keyboard nav, AA contrast, no colour-only cues, responsive down to mobile
    triage.
11. **Production deployment**.

Production Screening analytical read path (Phase 6D-B backend, then wired in
Phase 6D-C):

12. **Production Screening analytical read path** - a sanctioned, tested,
    production-safe read layer over the existing deterministic Screening
    architecture. Runs the scoring engines over the real corpus and returns
    results **without persisting a `ScoreSnapshot`** and **without importing
    Phase 6C diagnostic output**. Required before the Screening frontend is
    considered complete (sec. 31, sec. 36).
13. **Screening Thesis Fit** - continuous, evidence-conditional, unbanded
    (sec. 8).
14. **Evidence Coverage** and **Evidence Confidence** - separate, visually
    distinct, never merged (sec. 9).
15. **Dimension-level Screening analysis** - the 7-dimension breakdown, down to
    criterion and claim (sec. 11).
16. **Screening display sufficiency** - `SCREENED` / `INSUFFICIENT_EVIDENCE`
    with "why" (sec. 10).
17. **Screening evidence-sufficiency mechanics** - meets / does not meet the
    Screening evidence bar, with the failed precondition and the
    mandate-assumption note (sec. 10).

Sourcing (V1 implementation phase; sec. 22):

18. **Working sourcing capability** - candidate discovery.
19. **Discovery provenance** - engine, query, timestamp; own provenance type.
20. **Candidate research queue / ingestion workflow** - candidates awaiting
    research; the candidate-to-researched-company transition; integration with
    the canonical research workflow (sec. 23).

A temporary Sourcing placeholder is acceptable during intermediate development
only, never for final submission-ready V1.

Temporal Momentum and Signal Convergence may remain **provisional and
secondary** (sec. 4, 15) - not a V1 gating requirement.

### POST-V1

Kept outside submission-ready V1 unless they become easy additions later:

- automated Priority; Priority calibration; a fresh 45-60 company calibration
  dataset; independent Priority labels
- Underwriting-entry automation; the 39-subcriterion populated Underwriting
  workflow
- private-data intake
- Backtest Lab; historical outcome validation
- automated ESCALATE / MONITOR / PASS
- portfolio construction; investment recommendation engine
- independent Mandate Eligibility evaluation for the 39 (display stays "not yet
  assessed", sec. 25)
- search over claims / people / sources; archive / hide from worklist
- cross-layer proposition de-duplication UI

### Build sequencing within V1

The corpus-only surfaces (1-11) can be built first and are usable on their
own, but V1 is **not submission-ready** until the production Screening read
path (12) and its surfaces (13-17) and the working Sourcing capability (18-20)
are all present.

---

## 33. Next build order and UI/UX Pro Max handoff

### Build order

**Phase 6D-B - Production Analytical Read Path.** Expose the existing
deterministic Screening architecture to the application through a sanctioned,
tested, production-safe read layer. It must not use Phase 6C diagnostic output
as production state and must not persist a `ScoreSnapshot`. No frontend work.

**Phase 6D-C - Analyst Frontend Implementation.** Use the globally installed
UI/UX Pro Max skill to build the approved Worklist and company-detail interface
(this document) against the Phase 6D-B production analytical read layer.

**Sourcing** integration (sec. 22) follows as a V1 implementation phase if it
is not folded directly into 6D-C. It is required for submission-ready V1.

Neither 6D-B nor 6D-C is implemented in Phase 6D-A.

### UI/UX Pro Max handoff (Phase 6D-C)

Phase 6D-C will explicitly instruct the use of the globally installed UI/UX
Pro Max skill. This document is the input. Handoff contents:

- **Product goals**: sec. 3 (discover, research, screen, understand; never
  recommend).
- **Navigation**: sec. 5 (primary: Worklist, Companies, Methodology; Sourcing
  slot reserved now, working surface required for submission V1; secondary:
  Evidence, Sources, Signals; company-level tabs).
- **Screen inventory**: Worklist; Company detail (Overview, Screening,
  Evidence, Signals, Research gaps, People, Sources); Methodology; Limitations;
  Search results; Sourcing (candidate discovery + discovery provenance +
  research queue; placeholder only during intermediate development); About
  panel.
- **Information hierarchy**: per-screen, sec. 7 to 18.
- **Analytical maturity rules**: sec. 4. PRIMARY vs SECONDARY must be visually
  encoded; temporal signals are always subordinate and events-first.
- **Forbidden UI patterns**: sec. 0 (leaderboard, rank numbers, Fit bands/
  labels, Priority, automatic recommendations, score-based default sort,
  Fit+temporal composite, Coverage/Confidence merge, inferred mandate, red-
  green Fit gradient).
- **Accessibility requirements**: sec. 29.
- **Responsive requirements**: sec. 29 (desktop dense table; tablet reduced;
  mobile card triage; body never scrolls horizontally; detail usable at
  360px).
- **Data visualization requirements**:
  - Coverage and Confidence: separate, visually distinct, small bars / gauges,
    always with the numeric value; never a combined indicator.
  - Fit: rounded whole number, neutral single hue or position marker on a
    0 to 100 track, no quality gradient, no bands.
  - Signal timeline: chronological, direction encoded by icon + text (not
    colour alone), negative events distinctly marked.
  - Momentum / Convergence: three separate component values, muted treatment,
    provisional label, never a headline KPI card, never a gauge that mirrors
    the Fit treatment.
  - No chart implies a ranking or a trend the data does not support (thin
    event streams: no sparklines that suggest a trajectory from 1 to 2
    points).
- **Recruiting-demo considerations**: sec. 27. The demo is the well-labelled
  analyst view; one two-click provenance trace example; no parallel demo mode;
  no marketing copy.

---

## 34. Tests

Documentation-only phase. Expected: 756 passing, unchanged.

- `npm run test`: 756 passed (36 files).
- `npm run typecheck`: clean.
- `npm run lint`: clean.
- `npm run build`: (recorded in the final report).

No new tests required.

---

## 35. Research regression

Verified unchanged against `data/generated/`:

- 39 companies, 222 sources, 510 EvidenceClaims, 84 Person records,
  113 SignalEvents
- schema version 6
- 0 persisted ScoreSnapshots (`snapshots.json` recordCount 0)

No research file, schema file, scoring file, or generated data file modified.

---

## 36. Open items carried to later phases

- **production Screening analytical read path** (no `ScoreSnapshot`
  persistence, no Phase 6C diagnostic import) - **required for submission V1**;
  Phase 6D-B; the Screening frontend is not complete without it
- **Sourcing engine integration and candidate / discovery provenance** -
  **required for submission V1**; a V1 implementation phase after 6D-C
- persistence layer - blocks analyst annotations (POST-V1)
- independent Mandate Eligibility evaluation for the 39 (POST-V1)
- populate `SignalEvent.evidenceIds` - blocks cross-layer de-duplication
- sanctioned (non-diagnostic) temporal signal mapping (secondary; Momentum /
  Convergence may stay provisional)
- the methodology question of whether serious negative signals should net
  against unrelated positive momentum (sec. 16)
