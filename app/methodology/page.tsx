import type { Metadata } from "next";
import Link from "next/link";
import {
  DA_SCREENING_CRITERIA_WEIGHTS,
  DA_SCREENING_CRITERION_SEMANTICS,
} from "@/lib/scoring/digital-asset/screening";
import {
  DA_THESIS_FIT_DIMENSION_WEIGHTS,
  DA_CRITICAL_DIMENSION_EVIDENCE_GUARD,
  DA_EVIDENCE_SUFFICIENCY_PROVISIONAL,
} from "@/lib/scoring/digital-asset/config";
import { getReadModelMeta } from "@/lib/digital-asset-product";
import { PageHero } from "@/components/PageHero";
import { Reveal } from "@/components/Reveal";
import { Icon, SectionHeading } from "@/components/ui";
import { criterionLabel, dimensionLabel } from "@/lib/ui/format";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Methodology - Digital Asset Venture Intelligence" };

const G = DA_CRITICAL_DIMENSION_EVIDENCE_GUARD;
const S = DA_EVIDENCE_SUFFICIENCY_PROVISIONAL;

export default function MethodologyPage() {
  const meta = getReadModelMeta();
  return (
    <div className="mx-auto max-w-[860px]">
      <PageHero
        title="Methodology"
        lede={
          <>
            How Screening produces the values shown throughout the product, what evidence
            sufficiency means, and where human judgment stays human. This describes the current
            v7 Digital Asset Venture Intelligence product - it is documentation, not a rewrite of
            the underlying scientific evaluation.
          </>
        }
      />

      <Reveal className="flex flex-col gap-10 t-body-lg text-[var(--fg-muted)]">
        <section id="screening">
          <SectionHeading>Screening framework</SectionHeading>
          <p className="text-[var(--fg-muted)]">
            Screening is a public, outside-in, top-of-funnel pass across seven thesis dimensions
            and 14 criteria (two per dimension). An analyst maps sourced facts to a criterion and
            assigns a raw rubric anchor (0 / 25 / 50 / 75 / 100) and a discrete evidence coverage
            (0 / 0.5 / 1) - that mapping is the human judgment. A deterministic engine then adjusts
            the anchor for the reliability and freshness of the cited evidence and rolls criteria
            up to dimensions and dimensions up to Thesis Fit using fixed weights. No language model
            produces a score.
          </p>
        </section>

        <section id="thesis-fit">
          <SectionHeading>What Thesis Fit represents</SectionHeading>
          <p className="text-[var(--fg-muted)]">
            Thesis Fit is a continuous 0-100 output of the 14-criterion Screening rubric, rolled up
            through seven weighted dimensions. It describes how well the sourced evidence matches
            the digital-asset thesis criteria - it is <span className="font-medium">not</span> an
            investment recommendation, not a rank, and not a prediction of future performance.
            Dimension weights are a provisional, uncalibrated hypothesis, not a validated formula.
          </p>
          <div className="mt-4 flex flex-col gap-9">
            {Object.entries(DA_SCREENING_CRITERIA_WEIGHTS).map(([dim, weights]) => (
              <div key={dim} className="border-t border-[var(--line-strong)] pt-4">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <Icon name="dash" className="text-[var(--accent)]" />
                  <span className="capitalize text-[var(--fg)]">{dimensionLabel(dim)}</span>
                  <span className="tnum text-[11px] text-[var(--fg-faint)]">
                    dimension weight{" "}
                    {DA_THESIS_FIT_DIMENSION_WEIGHTS[dim as keyof typeof DA_THESIS_FIT_DIMENSION_WEIGHTS]}
                  </span>
                  {(G.dimensions as readonly string[]).includes(dim) && (
                    <span className="chip chip--warn text-[10px]">critical</span>
                  )}
                </p>
                <ul className="mt-3 flex flex-col divide-y divide-[var(--line)]">
                  {Object.entries(weights).map(([crit, w]) => (
                    <li key={crit} className="py-3 text-[12px] text-[var(--fg-muted)] first:pt-0 last:pb-0">
                      <span className="font-medium capitalize text-[var(--fg)]">
                        {criterionLabel(crit)}
                      </span>{" "}
                      <span className="tnum text-[var(--fg-faint)]">(weight {w})</span>
                      <br />
                      {DA_SCREENING_CRITERION_SEMANTICS[crit]}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section id="coverage-confidence">
          <SectionHeading>Evidence Coverage and Evidence Confidence</SectionHeading>
          <p className="text-[var(--fg-muted)]">
            These are two permanently separate measures. They are never merged into a single
            &ldquo;trust&rdquo; or &ldquo;quality&rdquo; score, and neither one is investment
            quality.
          </p>
          <ul className="mt-2 flex flex-col gap-3">
            <li className="border-l-2 border-[var(--line-strong)] pl-3">
              <span className="font-medium">Evidence Coverage</span> - the share of Screening
              criteria backed by admissible sourced evidence.
            </li>
            <li className="border-l-2 border-[var(--line-strong)] pl-3">
              <span className="font-medium">Evidence Confidence</span> - the reliability of the
              evidence that exists: source reliability class, origin de-duplication (repeated
              claims from one voice never manufacture corroboration), and contradiction handling.
              It does not increase with more evidence. A company can have high Confidence on
              near-zero Coverage: that means &ldquo;confident about almost nothing&rdquo;.
            </li>
          </ul>
        </section>

        <section id="missing-evidence-neutral">
          <SectionHeading>Why missing evidence stays neutral</SectionHeading>
          <p className="text-[var(--fg-muted)]">
            Where evidence is thin or absent, a criterion contributes the neutral value 50 rather
            than a judged score, and dimension and Fit values compress toward 50. A company sitting
            near 50 is usually near 50 because evidence is missing, not because it was judged
            average. Evidence sufficiency is a statement about how much is known, never a statement
            about investment quality.
          </p>
        </section>

        <section id="display-states">
          <SectionHeading>PROVISIONAL and INSUFFICIENT_EVIDENCE</SectionHeading>
          <p className="text-[var(--fg-muted)]">
            Every company shows one of exactly two display states, evaluated against a provisional,
            uncalibrated evidence-sufficiency reading:
          </p>
          <ul className="mt-2 list-disc pl-5 text-[12px] text-[var(--fg-muted)]">
            <li>overall coverage ≥ {S.minOverallCoverage}</li>
            <li>overall confidence ≥ {S.minOverallConfidence}</li>
            <li>
              at least {S.minDimensionsAtFloor} of 7 dimensions at ≥ {S.dimensionCoverageFloor} coverage
            </li>
          </ul>
          <p className="mt-2 text-[var(--fg-muted)]">
            <span className="mono">PROVISIONAL</span> means the evidence clears this reading -
            it is <span className="font-medium">not</span> a recommendation, an approval, or a
            statement that the company is a good investment. <span className="mono">
              INSUFFICIENT_EVIDENCE
            </span>{" "}
            means the public research base is not yet thick enough to display responsibly - it is{" "}
            <span className="font-medium">not</span> a negative judgment of the company. Evidence
            sufficiency and investment quality are different axes.
          </p>
        </section>

        <section id="critical-guard">
          <SectionHeading>Critical-dimension zero-only guard</SectionHeading>
          <p className="text-[var(--fg-muted)]">
            Capital efficiency and growth momentum are treated as critical dimensions. Each must
            carry some non-zero evidence coverage - a zero-only guard, not a positive minimum - so
            a company cannot clear the evidence-sufficiency reading while an entire 20%-weight
            dimension is filled purely by the neutral prior.
          </p>
        </section>

        <section id="mandate">
          <SectionHeading>Mandate is separate</SectionHeading>
          <p className="text-[var(--fg-muted)]">
            Mandate eligibility - whether a company is within investment scope for any particular
            fund or mandate - is a distinct, deterministic assessment, independent of evidence
            sufficiency and of Thesis Fit. It has <span className="font-medium">not</span> been
            independently evaluated for any of the {meta.companyCount} companies here. The product
            shows &ldquo;Mandate: not assessed&rdquo; everywhere and never infers, defaults, or
            derives a mandate result.
          </p>
        </section>

        <section id="rank">
          <SectionHeading>Rank eligibility is separate</SectionHeading>
          <p className="text-[var(--fg-muted)]">
            Rank eligibility structurally requires a resolved mandate result. Because mandate is
            not assessed for this demonstration universe, rank eligibility is reported as
            &ldquo;Rank: not assessed&rdquo; for every company. There is no leaderboard and no
            comparative ranking anywhere in the product.
          </p>
        </section>

        <section id="provenance">
          <SectionHeading>How source provenance works</SectionHeading>
          <p className="text-[var(--fg-muted)]">
            Every cited claim carries a provenance kind (sourced, derived, assumption,
            estimated_range, or unknown) and, when sourced, a specific source record. Sources
            preserve their class (first-party protocol/network disclosure, governance forum, block
            explorer, onchain analytics, code repository, security audit, independent journalism,
            and more), whether they are independent, and whether they can corroborate another
            source. Two records that trace to the same origin - a wire reproduction, a mirrored
            dashboard, a repeated announcement - collapse to one voice: repetition never
            manufactures independent corroboration. See{" "}
            <Link href="/sources">Source Intelligence</Link> for the full provenance layer.
          </p>
        </section>

        <section id="contradictions">
          <SectionHeading>How contradictions are preserved</SectionHeading>
          <p className="text-[var(--fg-muted)]">
            A cited claim that conflicts with another is never silently dropped or averaged away.
            Contradicted and contradicting claim ids are carried through to the product, along with
            any contradiction note the analyst recorded, and shown alongside the criterion they
            support so a reviewer can see the disagreement directly.
          </p>
        </section>

        <section id="signals-vs-facts">
          <SectionHeading>Signals differ from enduring facts</SectionHeading>
          <p className="text-[var(--fg-muted)]">
            A signal event is a dated occurrence - a launch, a hire, an integration, an exploit -
            shown with its status carried through verbatim. A <span className="mono">
              reported_unconfirmed
            </span>{" "}
            event is never shown as established. Signals decay in relevance over time by design;
            the underlying evidentiary facts they cite do not disappear when that happens. The{" "}
            <Link href="/signals">Signal Engine</Link> presents signals in chronological order,
            never as an investment ranking, and never converts signal volume into a score.
          </p>
        </section>

        <section id="demonstration-universe">
          <SectionHeading>The demonstration universe</SectionHeading>
          <p className="text-[var(--fg-muted)]">
            The product currently contains {meta.companyCount} researched digital-asset companies.
            These entities were used to build and exercise the underlying evaluation framework;
            their historical cohort membership is retained only as internal audit metadata and is
            never surfaced as product navigation, a filter, or a ranking signal.
          </p>
        </section>

        <section id="limitations">
          <SectionHeading>Limitations</SectionHeading>
          <ul className="flex flex-col gap-1.5 text-[12px] text-[var(--fg-muted)]">
            <li>No investment recommendation, no rank, no leaderboard.</li>
            <li>Mandate eligibility is not independently evaluated for the current universe.</li>
            <li>Evidence-sufficiency thresholds are a provisional, uncalibrated hypothesis, not a validated gate.</li>
            <li>
              Public-data limitations: no page crawling, financials mostly undisclosed, numeric
              values not extracted from prose, thin independent corroboration for many digital-asset
              projects.
            </li>
            <li>All scoring math is deterministic; no score is produced by a language model.</li>
          </ul>
        </section>
      </Reveal>

      <p className="mt-8 t-meta text-[var(--fg-faint)]">
        <Link href="/worklist">Back to the worklist</Link>
      </p>
    </div>
  );
}
