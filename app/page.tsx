import type { Metadata } from "next";
import Link from "next/link";
import { getPartnerHomeData, getSourcingWorklist } from "@/lib/digital-asset-product";
import { PageHero } from "@/components/PageHero";
import { Reveal } from "@/components/Reveal";
import { SectionHeading, SignalDirection, EventStatusMark } from "@/components/ui";
import { PartnerHomeRadarSummary } from "@/components/radar/PartnerHomeRadarSummary";
import { dateOnly, titleCase } from "@/lib/ui/format";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Partner Home - Digital Asset Venture Intelligence" };

export default function PartnerHomePage() {
  const data = getPartnerHomeData();
  const worklistRows = getSourcingWorklist();

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHero
        title="Partner Home"
        lede={
          <>
            The digital-asset research universe at a glance: what is covered, where evidence is
            thin, and what changed recently. Every value traces to a specific evidence claim and
            source. Nothing here is an investment recommendation.
          </>
        }
        meta={
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-[var(--fg-faint)]">
            <li>{data.totalCompanies} companies in the research universe.</li>
            <li>Research corpus generated {dateOnly(data.meta.generatedAt)}.</li>
            <li>Independent, firm-neutral framework.</li>
          </ul>
        }
      />

      <Reveal className="mb-10 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-[var(--line)] py-5 sm:grid-cols-4">
        <Stat label="Research universe" value={String(data.totalCompanies)} />
        <Stat label="Provisional" value={String(data.provisionalCount)} hint="Meets evidence-sufficiency mechanics" />
        <Stat
          label="Insufficient evidence"
          value={String(data.insufficientEvidenceCount)}
          hint="Not yet a negative reading"
        />
        <Stat label="Categories covered" value={String(data.categoryCoverage.length)} />
      </Reveal>

      <PartnerHomeRadarSummary rows={worklistRows} />

      <section className="mb-10">
        <SectionHeading>Explore</SectionHeading>
        <ul className="flex flex-wrap gap-x-6 gap-y-1 t-meta">
          <li><Link href="/market-map">Market Map</Link> - the universe by category</li>
          <li><Link href="/radar">Follow-On Radar</Link> - your monitoring list</li>
          <li><Link href="/relationships">Relationship Intelligence</Link> - people and companies</li>
        </ul>
      </section>

      <section className="mb-10">
        <SectionHeading aside={<Link href="/worklist">Open Sourcing Worklist</Link>}>
          Companies to review
        </SectionHeading>
        <p className="t-meta mb-3 text-[var(--fg-muted)]">
          The lowest overall evidence coverage in the universe - the clearest next research
          targets, not a ranking of company quality.
        </p>
        {data.companiesToReview.length > 0 ? (
          <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
            {data.companiesToReview.map(({ company, reason }) => (
              <li key={company.entityId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                <Link href={`/companies/${company.slug}`} className="font-medium">
                  {company.name}
                </Link>
                <span className="t-meta text-[var(--fg-faint)]">{reason}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-meta text-[var(--fg-faint)]">No companies currently below the evidence-sufficiency reading.</p>
        )}
      </section>

      <section className="mb-10">
        <SectionHeading>Research gaps</SectionHeading>
        <p className="t-meta mb-3 text-[var(--fg-muted)]">
          Companies where a critical dimension (capital efficiency or growth momentum) carries
          zero evidence coverage - the evidence bar cannot be met until this is resolved.
        </p>
        {data.companiesWithCriticalGaps.length > 0 ? (
          <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
            {data.companiesWithCriticalGaps.map(({ company, gap }) => (
              <li key={company.entityId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                <Link href={`/companies/${company.slug}`} className="font-medium">
                  {company.name}
                </Link>
                <span className="t-meta text-[var(--fg-faint)]">{gap}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-meta text-[var(--fg-faint)]">No critical-dimension gaps blocking the evidence bar.</p>
        )}
      </section>

      <div className="mb-10 grid gap-10 md:grid-cols-2">
        <section>
          <SectionHeading aside={<Link href="/signals">Open Signal Engine</Link>}>Recent signals</SectionHeading>
          {data.recentSignals.length > 0 ? (
            <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
              {data.recentSignals.map(({ company, signal }) => (
                <li key={company.entityId} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={`/companies/${company.slug}`} className="font-medium">
                      {company.name}
                    </Link>
                    <span className="tnum t-meta text-[var(--fg-faint)]">{dateOnly(signal?.eventDate)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 t-meta text-[var(--fg-muted)]">
                    <span>{signal ? titleCase(signal.signalType) : ""}</span>
                    {signal ? <SignalDirection direction={signal.signalDirection} /> : null}
                    {signal?.eventStatus === "reported_unconfirmed" ? (
                      <EventStatusMark status={signal.eventStatus} />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-meta text-[var(--fg-faint)]">No dated signal events on file.</p>
          )}
        </section>

        <section>
          <SectionHeading>Category coverage</SectionHeading>
          <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
            {data.categoryCoverage.map(({ category, count }) => (
              <li key={category} className="flex items-center justify-between gap-4 py-2.5">
                <span className="t-meta text-[var(--fg-muted)]">{titleCase(category)}</span>
                <span className="tnum text-[13px] font-medium">{count}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <p className="t-meta text-[var(--fg-faint)]">
        Screening scoring is deterministic; no language model produces a score. Mandate
        eligibility and rank eligibility are not assessed for any company. See{" "}
        <Link href="/methodology">methodology</Link>.
      </p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="tnum text-[26px] font-semibold leading-none text-[var(--fg)]">{value}</div>
      <div className="mt-1.5 t-meta text-[var(--fg-muted)]">{label}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-[var(--fg-faint)]">{hint}</div> : null}
    </div>
  );
}
