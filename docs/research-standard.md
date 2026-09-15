# Research standard

The research protocol for the company universe beyond Batch 1 (positions 21
onward). It is the canonical version of the standard upgraded during Phase 3D
and supersedes the informal Batch 1 practice. A later review may revise it.

This is a firm-agnostic analyst protocol. It produces public-evidence research,
not investment scores. Nothing here ranks companies or recommends an
investment.

## Objective

Preserve the strongest available public evidence for each economically
important claim, record what role each source plays, and make uncertainty
visible before any scoring exists. The goal is never to maximise source count.
If corroboration is not available, confidence falls and the uncertainty stays
on the record. The system does not invent certainty.

## 1. Identity gate

Before investment research begins, establish and record:

- canonical company name and registrable domain
- current status: private, acquired, or public
- current legal-entity founding year
- operating or project origin year, held separately when it materially predates
  the current legal entity (Wispr Flow is the reference case: 2021 operating
  origin, 2023 Delaware incorporation)
- founders and their current operating roles
- headquarters
- stage
- latest financing status and any control change

Operating origin and legal-entity incorporation are two fields, not one, when
they differ. `Company.operatingOriginYear` holds the earlier date; it never
overwrites `Company.foundedYear`.

## 2. Source mix

Every company should have, where the evidence exists:

- at least one direct or first-party company source
- at least one dated source usable for at least one `SignalEvent`
- at least one external source, when a credible one exists

There is no external-source quota. Some private companies legitimately have no
strong independent coverage, and that is recorded rather than papered over.

## 3. Source type and support role

Every source carries two classifications:

- **`sourceType`** (the source class): `regulatory`, `official_company`,
  `founder_or_executive`, `independent_journalism`, `specialist_industry`,
  `investor_industry`, `structured_secondary`, `customer_vendor`,
  `identified_social`, `community`, `analyst_inference`.
- **`supportRole`** (what the source does for the company it is cited against):
  `primary_fact`, `direct_company_disclosure`, `legal_entity_disclosure`,
  `corroborating`, `contextual`, `customer_vendor`, `third_party_estimate`,
  `transaction_detail`, `historical_context`, `repeated_announcement`.

`supportRole` describes how a source contributes. It is not itself proof that
every claim citing that source has independent corroboration. An article can be
independent journalism (`sourceType`) and still only repeat a management
statistic (`repeated_announcement` for that claim).

## 4. Claim-level independence

Publisher independence is not claim independence. Track independence at the
claim level.

- A company says NRR is 240%. Two outlets repeating that number are one
  underlying origin, not two.
- A customer or vendor case study can independently support adoption and
  operating scale without verifying a financial metric.
- A regulatory filing can independently establish a financing date or a legal
  entity.
- A reporter who obtains transaction structure through their own reporting can
  independently support that structure (for example, that part of a headline
  round was secondary).
- An investor or portfolio publication writing about a company it has backed is
  interested-party context and does not corroborate.

The generated `research-summary.json` reports claim-level support counts
(`claimsWithIndependentOriginSupport`, `claimsWithTwoIndependentOriginSources`,
`claimsWithThirdPartyEstimateSupport`,
`companyReportedClaimsWithExternalPublicationSupport`) and, separately, a legacy
company-level source-coverage statistic (`companiesWithTwoIndependentSources`).
These are research QA metrics. None is a score, and none should be described as
validated, verified, or investment-grade.

## 5. High-impact claim verification

Apply a higher verification burden to claims that could materially change a
future ranking or underwriting: ARR or revenue, revenue growth, NRR, churn,
retention, profitability, gross margin, cash burn, quantitatively-used customer
counts, major financing, primary versus secondary capital, ownership or sponsor
control, valuation, customer concentration, business-model classification, and
current acquisition status.

- If an exact metric comes only from the company, it stays `company_reported`.
- If a structured-secondary provider estimates it, store that separately as
  `third_party_estimate`.
- Never average two conflicting values without a defensible economic reason.
  Time-separated snapshots of the same metric are a time series, not a
  conflict, and are not averaged.

## 6. Financing discipline

For every material financing, distinguish: completed primary, completed
secondary, mixed primary and secondary, `reported_unconfirmed`, debt, and
unknown mix.

- An employee tender is never company primary capital. Its primary contribution
  is `$0`.
- An unclosed financing is never capital raised, and its reported valuation is
  never a completed-transaction valuation. It is a `reported_unconfirmed`
  `SignalEvent` and a review-queue item until it closes.
- When a headline round mixes primary and secondary and the split is not
  disclosed, primary capital is `unknown`. It is not inferred.
- A derived capital figure (for example, a headline less a reported secondary
  component) is `provenance: derived`, carries its inputs and the calculation
  in `notes`, is rounded, and is not an audited figure.

## 7. Capital-efficiency readiness

Before any score exists, label each dimension:

- `ready`
- `ready_with_caveat`
- `blocked`

Capital-efficiency readiness needs enough of: revenue or ARR or a defensible
external estimate; disclosed or bounded primary capital; profitability or burn
where available; gross margin or infrastructure intensity where economically
important; headcount where useful; and software-versus-services mix where
relevant.

A `blocked` dimension is not a zero score. It is a statement that the public
record does not yet support that analysis. These readiness labels live in
`Company.notes` and evidence-claim fields; they are not an investment score
schema.

## 8. Business-model boundary test

Explicitly classify: recurring software, usage-based infrastructure,
marketplace, fintech spread or interchange, tech-enabled services, AI-native
process outsourcer, professional services, hardware or capital-intensive, or
hybrid.

Do not apply SaaS gross-margin, ARR, or retention assumptions to a business
that is not recurring software. The Batch 1 corpus already carries several
boundary cases (a registered law firm, an insurance-operations hybrid, serverless
compute infrastructure, an embedded-model plus compute business) where SaaS
metrics would be wrong.

## 9. Atomic evidence

Each `EvidenceClaim` expresses one economically inspectable proposition
wherever practical.

Preferred: "ARR exceeded $100M." / "The company reported profitability." /
"The Series B headline was $68M." / "$20M of the round was secondary."

Avoid: "The company has $100M ARR, is profitable, raised $68M, has 50
employees, and is capital efficient."

A researcher may split a compound sentence into discrete propositions when
every resulting proposition is directly supported by the cited source. That is
normalisation, not invention. Each atomic claim retains a `researchAssessmentId`
(the original research unit) and, where a directive produced it, a `hardeningRef`.

## 10. Current versus historical evidence

Current undated pages support current screening. They do not create historical
`SignalEvent`s without demonstrated historical availability.

`publicationDate`, `availabilityDate`, `availabilityEvidence`, `eventDate`, and
`ingestedAt` stay semantically distinct. `ingestedAt`, `accessedAt`, and the
current research date are never used as historical availability. An undated
current source may support a current `EvidenceClaim` only.

## 11. Signal event discipline

Events capture change; facts endure. Facts persist; events decay.

Funding events are `signalDirection: ambiguous` by default: raising capital is
not a positive signal on its own. Positive momentum comes from operating
evidence such as customer expansion, revenue growth, product adoption,
enterprise wins, new-market expansion, product launches, usage growth, and
measured customer outcomes. A financing does not need one event per article;
the underlying event is the event and the publication is evidence.

## 12. Research coverage guidance

Quality over volume. A reasonable target for a normal company: one to three
first-party or direct sources; one to two external sources when available;
seven dimension assessments; several atomic evidence claims; two to five dated
signal events when supportable. Do not create filler evidence to hit a number.

## 13. High-conviction escalation

Before a company can be considered a high-conviction candidate in a later
phase:

- major financial claims have had an external corroboration attempt
- financing is reconciled for primary versus secondary where material
- the business model is unambiguous enough to select the right metrics
- at least one customer, vendor, regulatory, or independent source tests
  management's narrative where one is available
- major contradictions are resolved or explicitly carried into the debate
- any `model_input` claim shows its source provenance beside it

If public evidence cannot meet the bar, confidence falls and the gap stays
visible.

## 14. Batch handoff requirements

For each new batch, produce: identity records; a source register with
`sourceType` and `supportRole`; seven dimension assessments per company; atomic
evidence claims with provenance; dated signal events with availability
evidence; dimension readiness labels (`ready` / `ready_with_caveat` /
`blocked`); unresolved issues; and research notes for the later scoring phase.
Do not rank companies during research.

## 15. Pre-ingestion audit questions

Before a batch is handed off for ingestion:

1. Did we distinguish company claims from independently established facts?
2. Did we mistake repeated coverage for independent corroboration?
3. Did we keep unknown values unknown?
4. Did we separate primary and secondary capital?
5. Did we keep unconfirmed financings unconfirmed?
6. Did we use the right economic model for services, infrastructure, fintech,
   and marketplaces?
7. Are high-impact claims atomic and inspectable?
8. Does every historical event have defensible availability evidence?
9. Are contradictions visible?
10. Would an investment professional understand exactly what remains unknown?

If any answer is no, the research is not ready.
