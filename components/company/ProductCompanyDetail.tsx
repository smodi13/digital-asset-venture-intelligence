import Link from "next/link";
import type { ProductCompany } from "@/lib/digital-asset-product";
import {
  CoverageMeter,
  ConfidenceGauge,
  ProductDisplayStateBadge,
  SectionHeading,
  SignalDirection,
  EventStatusMark,
  Icon,
} from "@/components/ui";
import { RadarButton } from "@/components/radar/RadarButton";
import { dateOnly, fitDisplay, pct, dimensionLabel, criterionLabel, titleCase } from "@/lib/ui/format";

export function ProductCompanyDetail({ company: c }: { company: ProductCompany }) {
  return (
    <div className="mx-auto max-w-[1180px]">
      <nav aria-label="Breadcrumb" className="mb-3 t-meta text-[var(--fg-faint)]">
        <Link href="/worklist" className="underline underline-offset-2">
          Sourcing Worklist
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <Link href="/companies" className="underline underline-offset-2">
          Companies
        </Link>{" "}
        <span aria-hidden>/</span> {c.name}
      </nav>

      <header className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="t-display text-[1.375rem] md:text-[1.5rem]">{c.name}</h1>
            <span aria-hidden className="mt-2.5 block h-[2px] w-[44px] rounded bg-[var(--accent-line)]" />
            <p className="measure mt-3 t-body text-[var(--fg-muted)]">{c.description}</p>
            <p className="mt-2 t-meta text-[var(--fg-faint)]">
              {c.category ? titleCase(c.category) : "Uncategorized"} · {titleCase(c.entityType)} ·{" "}
              {titleCase(c.assetType)}
              {c.digitalAssetLifecycle ? ` · ${titleCase(c.digitalAssetLifecycle)}` : ""}
              {c.domain ? (
                <>
                  {" · "}
                  <a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer">
                    {c.domain}
                  </a>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex max-w-full flex-row flex-wrap items-center gap-1.5 sm:flex-col sm:items-end">
            <RadarButton entityId={c.entityId} />
            <ProductDisplayStateBadge state={c.displayState} />
            <span className="chip chip--muted" title="Mandate eligibility has not been independently evaluated.">
              <Icon name="dash" />
              Mandate: not assessed
            </span>
            <span className="chip chip--muted" title="Rank eligibility has not been independently evaluated.">
              <Icon name="dash" />
              Rank: not assessed
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-3 sm:divide-x sm:divide-[var(--line)]">
          <Triad label="Thesis Fit" hint="Continuous analytical output across 14 Screening criteria. Not a recommendation, not a rank.">
            <span className="tnum text-[22px] font-semibold">{fitDisplay(c.thesisFit)}</span>
            <span className="ml-1 text-[11px] uppercase text-[var(--fg-faint)]">screening · /100</span>
          </Triad>
          <Triad label="Evidence Coverage" hint="Share of Screening criteria backed by admissible sourced evidence.">
            <CoverageMeter value={c.overallCoverage} />
          </Triad>
          <Triad label="Evidence Confidence" hint="Reliability of the evidence that exists. Does not increase with more evidence.">
            <ConfidenceGauge value={c.overallConfidence} />
          </Triad>
        </div>
        <p className="mt-3 t-meta text-[var(--fg-faint)]">
          Coverage and Confidence are separate measures, never merged into a single score.{" "}
          <Link href="/methodology">Methodology</Link>
        </p>
      </header>

      <div className="mt-10 flex flex-col gap-12">
        <OverviewSection company={c} />
        <ScreeningSection company={c} />
        <GapsSection company={c} />
        <SignalsSection company={c} />
        <SourcesSection company={c} />
        <PeopleSection company={c} />
      </div>
    </div>
  );
}

function Triad({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="sm:pl-8 sm:first:pl-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--fg-faint)]" title={hint}>
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function OverviewSection({ company: c }: { company: ProductCompany }) {
  return (
    <section id="overview">
      <SectionHeading id="overview-h">Overview</SectionHeading>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 t-meta sm:grid-cols-4">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.03em] text-[var(--fg-faint)]">Category</dt>
          <dd className="mt-0.5 text-[13px] text-[var(--fg)]">
            {c.category ? (
              <Link href="/market-map" className="underline underline-offset-2">
                {titleCase(c.category)}
              </Link>
            ) : (
              "Unknown"
            )}
          </dd>
        </div>
        <Field label="Entity type" value={titleCase(c.entityType)} />
        <Field label="Asset type" value={titleCase(c.assetType)} />
        <Field label="Lifecycle" value={c.digitalAssetLifecycle ? titleCase(c.digitalAssetLifecycle) : "Unknown"} />
        <Field
          label="Institutional orientation"
          value={c.institutionalOrientation === null ? "Unknown" : c.institutionalOrientation ? "Yes" : "No"}
        />
        <Field label="Financing stage" value={c.financingStage ?? "Unknown"} />
        <Field label="First observed" value={dateOnly(c.firstObservedAt)} />
        <Field label="Sources cited" value={`${c.sourceCount} (${c.independentSourceCount} independent)`} />
      </dl>
    </section>
  );
}

function ScreeningSection({ company: c }: { company: ProductCompany }) {
  const criteriaByDimension = new Map<string, typeof c.criteria>();
  for (const cr of c.criteria) {
    const list = criteriaByDimension.get(cr.dimension) ?? [];
    list.push(cr);
    criteriaByDimension.set(cr.dimension, list);
  }
  return (
    <section id="screening">
      <SectionHeading id="screening-h" aside="7 dimensions · 14 criteria">
        Screening
      </SectionHeading>
      <div className="flex flex-col gap-8">
        {c.dimensions.map((d) => (
          <div key={d.dimension} className="border-t border-[var(--line)] pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-[14px] font-semibold">{dimensionLabel(d.dimension)}</h3>
              <span className="t-meta text-[var(--fg-faint)]">
                score {fitDisplay(d.score)} · coverage {pct(d.coverage)} · confidence {pct(d.confidence)}
              </span>
            </div>
            <ul className="mt-3 flex flex-col gap-4">
              {(criteriaByDimension.get(d.dimension) ?? []).map((cr) => (
                <li key={cr.criterionId} className="border-t border-[var(--line)] pt-3 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="font-medium capitalize">{criterionLabel(cr.criterionId)}</span>
                    <span className="t-meta text-[var(--fg-faint)]">
                      {cr.applicability === "applicable"
                        ? `anchor ${cr.rawAnchor} · coverage ${cr.coverage}`
                        : titleCase(cr.applicability)}
                      {" · confidence "}
                      {pct(cr.confidence)}
                    </span>
                  </div>
                  <p className="mt-1.5 t-body text-[var(--fg-muted)]">{cr.rationale}</p>
                  {cr.evidenceGapNote ? (
                    <p className="mt-1 t-meta text-[var(--warn)]">Evidence gap: {cr.evidenceGapNote}</p>
                  ) : null}
                  {cr.citedClaims.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1">
                      {cr.citedClaims.map((cl) => (
                        <li key={cl.claimId} className="t-meta text-[var(--fg-faint)]">
                          <span aria-hidden>&bull; </span>
                          {cl.claim}
                          {cl.contradictedBy.length > 0 || cl.contradicts.length > 0 ? (
                            <span className="ml-1 chip chip--warn text-[10px]">contested</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function GapsSection({ company: c }: { company: ProductCompany }) {
  const g = c.evidenceGaps;
  const hasAny =
    g.criticalDimensionGaps.length > 0 ||
    g.missingDimensions.length > 0 ||
    g.thinDimensions.length > 0 ||
    g.unresolvedConflicts.length > 0 ||
    g.researchQuestions.length > 0;
  return (
    <section id="gaps">
      <SectionHeading id="gaps-h">Research gaps</SectionHeading>
      {!hasAny ? (
        <p className="t-meta text-[var(--fg-faint)]">No material evidence gaps identified.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {g.criticalDimensionGaps.length > 0 ? (
            <GapList
              title="Critical dimension gaps"
              items={g.criticalDimensionGaps.map(
                (x) => `${dimensionLabel(x.dimension)}: coverage ${x.coverage}${x.blocksEvidenceBar ? " (blocks evidence bar)" : ""}`,
              )}
            />
          ) : null}
          {g.missingDimensions.length > 0 ? (
            <GapList title="Missing dimensions" items={g.missingDimensions.map((d) => dimensionLabel(d))} />
          ) : null}
          {g.thinDimensions.length > 0 ? (
            <GapList title="Thin dimensions" items={g.thinDimensions.map((x) => `${dimensionLabel(x.dimension)}: coverage ${x.coverage}`)} />
          ) : null}
          {g.unresolvedConflicts.length > 0 ? (
            <GapList
              title="Unresolved evidence conflicts"
              items={g.unresolvedConflicts.map((x) => `Claim ${x.claimId} conflicts with ${x.against.join(", ")}`)}
            />
          ) : null}
          {g.researchQuestions.length > 0 ? <GapList title="Open research questions" items={g.researchQuestions} /> : null}
        </div>
      )}
    </section>
  );
}

function GapList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-[var(--fg-muted)]">{title}</h3>
      <ul className="mt-1.5 flex flex-col gap-1">
        {items.map((it, i) => (
          <li key={i} className="t-meta text-[var(--fg-faint)]">
            <span aria-hidden>&bull; </span>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SignalsSection({ company: c }: { company: ProductCompany }) {
  return (
    <section id="signals">
      <SectionHeading id="signals-h" aside={<Link href="/signals">Open Signal Engine</Link>}>
        Signals
      </SectionHeading>
      {c.signalEvents.length === 0 ? (
        <p className="t-meta text-[var(--fg-faint)]">No dated signal events on file.</p>
      ) : (
        <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
          {c.signalEvents.map((e) => (
            <li key={e.eventId} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{titleCase(e.signalType)}</span>
                <span className="tnum t-meta text-[var(--fg-faint)]">{dateOnly(e.eventDate)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 t-meta text-[var(--fg-muted)]">
                <span>{titleCase(e.subjectType)}</span>
                <SignalDirection direction={e.signalDirection} />
                <EventStatusMark status={e.eventStatus} />
              </div>
              <p className="mt-1.5 t-body text-[var(--fg-muted)]">{e.evidenceSummary}</p>
              {e.unconfirmedNote ? <p className="mt-1 t-meta text-[var(--warn)]">{e.unconfirmedNote}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SourcesSection({ company: c }: { company: ProductCompany }) {
  return (
    <section id="sources">
      <SectionHeading
        id="sources-h"
        aside={
          <>
            {c.sourceCount} sources · {c.independentSourceCount} independent ·{" "}
            <Link href="/sources">Open Source Intelligence</Link>
          </>
        }
      >
        Sources
      </SectionHeading>
      {c.sources.length === 0 ? (
        <p className="t-meta text-[var(--fg-faint)]">No sources cited.</p>
      ) : (
        <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
          {c.sources.map((s) => (
            <li key={s.sourceId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
              <span>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium">
                    {s.title}
                  </a>
                ) : (
                  <span className="font-medium">{s.title}</span>
                )}
                <span className="ml-2 t-meta text-[var(--fg-faint)]">{s.publisher}</span>
              </span>
              <span className="t-meta text-[var(--fg-faint)]">
                {titleCase(s.sourceType)} · tier {s.tier.toUpperCase()}
                {s.isIndependent ? " · independent" : " · first-party"}
                {s.supportRole ? ` · ${titleCase(s.supportRole)}` : ""} · {s.claimCount} claim
                {s.claimCount === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PeopleSection({ company: c }: { company: ProductCompany }) {
  return (
    <section id="people">
      <SectionHeading id="people-h" aside={<Link href="/relationships">Open Relationship Intelligence</Link>}>
        People
      </SectionHeading>
      {c.people.length === 0 ? (
        <p className="t-meta text-[var(--fg-faint)]">No person records on file.</p>
      ) : (
        <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
          {c.people.map((p) => (
            <li key={p.personId} className="py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-medium">
                  {p.name}
                  {p.isFounder ? <span className="ml-2 chip chip--neutral text-[10px]">Founder</span> : null}
                </span>
                <span className="t-meta text-[var(--fg-faint)]">{p.currentRole ?? "Role unknown"}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.03em] text-[var(--fg-faint)]">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-[var(--fg)]">{value}</dd>
    </div>
  );
}
