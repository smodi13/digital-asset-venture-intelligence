"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import type {
  CompanyScreeningDetail,
  ClaimRef,
  CriterionReadResult,
  DimensionReadResult,
} from "@/lib/screening-read";
import { ExportMenu } from "@/components/company/ExportMenu";
import { Reveal } from "@/components/Reveal";
import {
  ConfidenceGauge,
  CoverageMeter,
  DisplayStateBadge,
  EvidenceBarChip,
  EventStatusMark,
  Icon,
  MandateChip,
  SectionHeading,
  SignalDirection,
} from "@/components/ui";
import {
  criterionLabel,
  dateOnly,
  dimensionLabel,
  fitDisplay,
  pct,
  titleCase,
} from "@/lib/ui/format";

/* -------------------------------------------------------------------------- */
/* Source drawer context                                                      */
/* -------------------------------------------------------------------------- */

const DrawerCtx = createContext<(sourceId: string | null) => void>(() => {});

function SourceButton({ sourceId, children }: { sourceId: string | null; children: ReactNode }) {
  const open = useContext(DrawerCtx);
  if (!sourceId)
    return <span className="text-[var(--fg-faint)]">{children ?? "source unavailable"}</span>;
  return (
    <button
      type="button"
      onClick={() => open(sourceId)}
      className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
    >
      {children ?? "source"}
      <Icon name="chevron" className="text-[10px]" />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Top-level                                                                  */
/* -------------------------------------------------------------------------- */

const SECTIONS = [
  ["overview", "Overview"],
  ["screening", "Screening"],
  ["gaps", "Research gaps"],
  ["evidence", "Evidence"],
  ["signals", "Signals"],
  ["sources", "Sources"],
  ["people", "People"],
] as const;

/**
 * Scroll spy for the sticky section nav: tracks which section heading is
 * currently at the top of the viewport. Pure enhancement - anchor links still
 * work with JS off, and the active state only adds aria-current.
 */
function useActiveSection(anchors: readonly string[]): string {
  const [active, setActive] = useState<string>(anchors[0] ?? "");
  useEffect(() => {
    // Active section = the last heading scrolled past the sticky nav line, with
    // a bottom-of-page override so the final section(s) still light up (an
    // intersection-ratio approach leaves them dark - they can never scroll high
    // enough). Pure enhancement; anchor links still work with JS off.
    const pick = () => {
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      // At the page bottom the trailing headings can't reach the nav line, so
      // relax the test for them: any heading whose top is within the viewport
      // counts once we've bottomed out.
      const line = atBottom ? window.innerHeight : 96;
      let current = anchors[0] ?? "";
      for (const a of anchors) {
        const el = document.getElementById(a);
        if (el && el.getBoundingClientRect().top <= line) current = a;
      }
      return current;
    };
    const onScroll = () => setActive(pick());
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // anchors is a module constant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return active;
}

export function CompanyDetail({ detail }: { detail: CompanyScreeningDetail }) {
  const [drawerSource, setDrawerSource] = useState<string | null>(null);
  const id = detail.identity;
  const activeSection = useActiveSection(SECTIONS.map(([a]) => a));

  const hasNegativeSignal = detail.signalEvents.some(
    (e) => e.signalDirection.toLowerCase() === "negative",
  );

  return (
    <DrawerCtx.Provider value={setDrawerSource}>
      <div className="mx-auto max-w-[1200px] lg:pr-0">
        {/* Above the fold */}
        <nav aria-label="Breadcrumb" className="mb-3 t-meta text-[var(--fg-faint)]">
          <Link href="/worklist" className="underline underline-offset-2">
            Worklist
          </Link>{" "}
          <span aria-hidden>/</span>{" "}
          <Link href="/companies" className="underline underline-offset-2">
            Companies
          </Link>{" "}
          <span aria-hidden>/</span> {id.name}
        </nav>

        <header className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="t-display text-[1.375rem] md:text-[1.5rem]">{id.name}</h1>
              <span aria-hidden className="mt-2.5 block h-[2px] w-[44px] rounded bg-[var(--accent-line)]" />
              <p className="measure mt-3 t-body text-[var(--fg-muted)]">
                {id.description ?? "No description on file"}
              </p>
              <p className="mt-2 t-meta text-[var(--fg-faint)]">
                {id.sector ?? "Unknown sector"}
                {id.stage ? ` · ${id.stage.replace(/_/g, " ")}` : ""}
                {id.hqLocation ? ` · ${id.hqLocation}` : ""}
                {` · ${id.isPrivate ? "Private" : "Public"}`}
                {id.domain ? (
                  <>
                    {" · "}
                    <a href={`https://${id.domain}`} target="_blank" rel="noopener noreferrer">
                      {id.domain}
                    </a>
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex max-w-full flex-row flex-wrap gap-1.5 sm:flex-col sm:items-end">
              <ExportMenu companyId={id.companyId} />
              <DisplayStateBadge state={detail.displayState} />
              <EvidenceBarChip pass={detail.evidenceBar.nonMandateEvidenceBarPass} />
              <MandateChip />
            </div>
          </div>

          {/* Fit / Coverage / Confidence triad - always together, never merged.
              Three open columns divided by a single hairline each, not three
              bordered tiles inside a card. */}
          <div className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-3 sm:divide-x sm:divide-[var(--line)]">
            <Triad
              label="Screening Thesis Fit"
              hint="Continuous analytical output across 14 screening criteria. Not a recommendation, not a rank. Compresses toward 50 when evidence coverage is thin."
            >
              <span className="tnum text-[22px] font-semibold">
                {fitDisplay(detail.screeningThesisFit)}
              </span>
              <span className="ml-1 text-[11px] uppercase text-[var(--fg-faint)]">
                screening · /100
              </span>
              <FitTrack value={detail.screeningThesisFit} />
            </Triad>
            <Triad
              label="Evidence Coverage"
              hint="Share of screening criteria backed by admissible sourced evidence. Missing criteria are filled with a neutral prior and scored neither for nor against the company."
            >
              <CoverageMeter value={detail.overallEvidenceCoverage} />
            </Triad>
            <Triad
              label="Evidence Confidence"
              hint="Reliability of the evidence that exists - from source reliability class, origin de-duplication, and freshness. It does not increase with more evidence."
            >
              <ConfidenceGauge value={detail.overallEvidenceConfidence} />
            </Triad>
          </div>
          <p className="mt-3 t-meta text-[var(--fg-faint)]">
            Analytical mode: screening. Coverage and Confidence are separate measures and are never
            merged into a single score.{" "}
            <Link href="/methodology#coverage-confidence">Methodology</Link>
          </p>
        </header>

        {/* Section nav */}
        <nav
          aria-label="Company sections"
          className="local-nav sticky top-0 z-10 -mx-4 mt-5 flex gap-0.5 overflow-x-auto border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-4 py-2 backdrop-blur-sm md:mx-0 md:px-0"
        >
          {SECTIONS.map(([anchor, label]) => {
            const current = activeSection === anchor;
            return (
              <a
                key={anchor}
                href={`#${anchor}`}
                aria-current={current ? "location" : undefined}
                className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] leading-[1.5] transition-colors duration-[120ms] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] ${
                  current
                    ? "bg-[var(--accent-weak)] font-medium text-[var(--accent)]"
                    : "text-[var(--fg-muted)]"
                }`}
              >
                {label}
                {anchor === "signals" && hasNegativeSignal ? (
                  <span className="ml-1 chip chip--neg text-[10px]">negative</span>
                ) : null}
              </a>
            );
          })}
        </nav>

        <Reveal className="mt-8 flex flex-col gap-12">
          <OverviewSection detail={detail} />
          <ScreeningSection detail={detail} />
          <GapsSection detail={detail} />
          <EvidenceSection detail={detail} />
          <SignalsSection detail={detail} hasNegative={hasNegativeSignal} />
          <SourcesSection detail={detail} />
          <PeopleSection detail={detail} />
        </Reveal>
      </div>

      {drawerSource ? (
        <SourceDrawer detail={detail} sourceId={drawerSource} onClose={() => setDrawerSource(null)} />
      ) : null}
    </DrawerCtx.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/* Header helpers                                                             */
/* -------------------------------------------------------------------------- */

function majorGap(detail: CompanyScreeningDetail): string {
  const g = detail.evidenceGaps;
  const blocking = g.criticalDimensionGaps.find((c) => c.blocksEvidenceBar);
  if (blocking) return `${dimensionLabel(blocking.dimension)}: no evidence`;
  if (g.criticalDimensionGaps[0])
    return `${dimensionLabel(g.criticalDimensionGaps[0].dimension)}: thin evidence`;
  if (g.missingDimensions[0]) return `${dimensionLabel(g.missingDimensions[0])}: no evidence`;
  if (g.thinDimensions[0]) return `${dimensionLabel(g.thinDimensions[0].dimension)}: thin evidence`;
  if (g.unresolvedConflicts.length) return "unresolved evidence conflict";
  return "None identified";
}

function Triad({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="relative sm:pl-8 sm:first:pl-0">
      <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--fg-faint)]">
        {label}
        <details className="inline-block">
          <summary
            aria-label={`About: ${label}`}
            className="list-none text-[var(--fg-faint)] hover:text-[var(--accent)]"
          >
            <Icon name="info" className="text-[12px]" />
          </summary>
          {/* Fixed width, clamped to the viewport, anchored to the column's
              start edge so it can never leave the screen. */}
          <div className="card--raised absolute left-0 top-full z-30 mt-1 w-[min(20rem,80vw)] p-2 text-[11px] leading-snug text-[var(--fg-muted)]">
            {hint}
          </div>
        </details>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function FitTrack({ value }: { value: number }) {
  return (
    <div className="mt-2 h-1.5 w-full rounded bg-[var(--surface)] ring-1 ring-inset ring-[var(--line)]">
      <div
        className="h-full rounded bg-[var(--fg-muted)]"
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        role="img"
        aria-label={`Fit ${fitDisplay(value)} of 100`}
      />
    </div>
  );
}

function Meta({ term, value, mono }: { term: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="t-label text-[var(--fg-faint)]">{term}</dt>
      <dd className={`mt-0.5 t-meta text-[var(--fg)] ${mono ? "tnum" : ""}`}>{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                   */
/* -------------------------------------------------------------------------- */

function OverviewSection({ detail }: { detail: CompanyScreeningDetail }) {
  const firstClaim = detail.criteria.find((c) => c.supportingClaims.length > 0);
  const firstClaimClaim = firstClaim?.supportingClaims[0];
  return (
    <section id="overview" aria-labelledby="overview-h">
      <SectionHeading id="overview-h">Overview</SectionHeading>

      <dl className="mb-5 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
        <Meta term="Most material evidence gap" value={detail.evidenceGaps ? majorGap(detail) : "-"} />
        <Meta term="Last research update" value={dateOnly(detail.identity.lastResearchUpdate)} mono />
        <Meta term="Distinct sources cited" value={String(detail.citedSources.length)} mono />
        <Meta
          term="Recent signal"
          value={
            detail.signalEvents[0]
              ? `${dateOnly(detail.signalEvents[0].eventDate)} · ${detail.signalEvents[0].signalType.replace(/_/g, " ")}`
              : "No signal events recorded"
          }
        />
      </dl>
      <p className="measure mb-5 t-meta text-[var(--fg-muted)]">{detail.mandateNote}</p>

      <div className="measure text-[13px] leading-relaxed text-[var(--fg-muted)]">
        <p>{detail.identity.description ?? "No description on file."}</p>
        {detail.identity.notes ? (
          <p className="mt-2">
            <span className="font-medium text-[var(--fg)]">Research notes: </span>
            {detail.identity.notes}
          </p>
        ) : null}
        {detail.founderNames.length ? (
          <p className="mt-2">
            <span className="font-medium text-[var(--fg)]">Founders: </span>
            {detail.founderNames.join(", ")}
          </p>
        ) : null}
      </div>

      {firstClaim && firstClaimClaim ? (
        <div className="measure mt-6 border-l-2 border-[var(--line-strong)] pl-3 text-[12px] text-[var(--fg-muted)]">
          <p className="font-medium text-[var(--fg)]">How to read a value here</p>
          <p className="mt-1">
            Fit {fitDisplay(detail.screeningThesisFit)} rolls up from 7 dimensions → 14 criteria.
            Example trace: the criterion{" "}
            <span className="font-medium text-[var(--fg)]">
              {criterionLabel(firstClaim.criterionId)}
            </span>{" "}
            rests on{" "}
            <SourceButton sourceId={firstClaimClaim.sourceId}>
              {firstClaimClaim.claim.slice(0, 60)}…
            </SourceButton>
          </p>
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Screening: evidence bar + dimensions                                       */
/* -------------------------------------------------------------------------- */

function ScreeningSection({ detail }: { detail: CompanyScreeningDetail }) {
  const bar = detail.evidenceBar;
  const preconditions: { label: string; pass: boolean; detail: string }[] = [
    {
      label: "Overall evidence coverage ≥ 0.50",
      pass: bar.overallCoveragePass,
      detail: pct(bar.overallCoverage),
    },
    {
      label: "Overall evidence confidence ≥ 0.60",
      pass: bar.overallConfidencePass,
      detail: pct(bar.overallConfidence),
    },
    {
      label: "At least 4 of 7 dimensions at ≥ 0.50 coverage",
      pass: bar.dimensionsAtFloorPass,
      detail: `${bar.dimensionsAtFloor} of 7`,
    },
    {
      label: "Both critical dimensions above zero coverage",
      pass: bar.criticalDimensionsNonZeroCoveragePass,
      detail: `capital efficiency ${bar.criticalDimensionCoverage.capital_efficiency}, growth momentum ${bar.criticalDimensionCoverage.growth_momentum}`,
    },
    {
      label: "No material blocking conflict",
      pass: bar.noMaterialBlockingConflictPass,
      detail: bar.noMaterialBlockingConflictPass ? "none" : "present",
    },
    {
      label: "Display state is Screened",
      pass: bar.displayStatePass,
      detail: detail.displayState,
    },
  ];

  return (
    <section id="screening" aria-labelledby="screening-h">
      <SectionHeading
        id="screening-h"
        aside={
          <Link href="/methodology#screening" className="text-[12px]">
            Methodology
          </Link>
        }
      >
        Screening
      </SectionHeading>

      <div className="card mb-4 p-3 text-[12px]">
        <p className="font-medium">
          Display sufficiency: {detail.displayState === "SCREENED" ? "shown" : "not shown"}
        </p>
        <p className="mt-1 text-[var(--fg-muted)]">{detail.displayStateReason}</p>
      </div>

      <div className="card mb-4 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-medium">Screening evidence bar (non-mandate mechanics)</p>
          <EvidenceBarChip pass={bar.nonMandateEvidenceBarPass} />
        </div>
        <ul className="mt-2 divide-y divide-[var(--line)] text-[12px]">
          {preconditions.map((p) => (
            <li key={p.label} className="flex items-center justify-between gap-3 py-1.5">
              <span className="flex items-center gap-1.5">
                <Icon
                  name={p.pass ? "check" : "alert"}
                  label={p.pass ? "passes" : "fails"}
                  className={p.pass ? "text-[var(--pos)]" : "text-[var(--warn)]"}
                />
                {p.label}
              </span>
              <span className="tnum text-[var(--fg-muted)]">{p.detail}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-[var(--fg-faint)]">
          {detail.screeningEvidenceEligibilityNote}
        </p>
      </div>

      <p className="mb-2 text-[12px] font-medium">Seven screening dimensions</p>
      <div className="card divide-y divide-[var(--line)]">
        {detail.dimensions.map((d) => (
          <DimensionRow key={d.dimension} dim={d} criteria={detail.criteria} claims={detail.citedClaims} />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-[var(--fg-faint)]">
        Dimensions are not ranked against each other. A criterion sitting at 50 with the
        &ldquo;neutral prior&rdquo; label means no evidence either way - not a judgement of
        &ldquo;average&rdquo;.
      </p>
    </section>
  );
}

function DimensionRow({
  dim,
  criteria,
}: {
  dim: DimensionReadResult;
  criteria: CriterionReadResult[];
  claims: ClaimRef[];
}) {
  const own = criteria.filter((c) => c.dimension === dim.dimension);
  return (
    <details>
      <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 p-3 text-[13px] xl:grid-cols-[14rem_3.25rem_7rem_6.5rem_minmax(0,1fr)]">
        <span className="flex items-center gap-1.5 font-medium capitalize">
          <Icon
            name="chevron"
            className="text-[11px] text-[var(--fg-faint)] [details[open]_&]:rotate-90"
          />
          {dimensionLabel(dim.dimension)}
          {dim.isCritical ? (
            <span className="ml-0.5 chip chip--warn text-[10px]">critical</span>
          ) : null}
        </span>
        <span className="tnum text-right text-[var(--fg-muted)] xl:text-left">
          <span className="text-[10px] uppercase text-[var(--fg-faint)]">score </span>
          <span className="font-medium text-[var(--fg)]">{Math.round(dim.score)}</span>
        </span>
        <span className="flex items-center gap-1 text-[10px] uppercase text-[var(--fg-faint)]">
          cov <CoverageMeter value={dim.coverage} compact />
        </span>
        <span className="flex items-center gap-1 text-[10px] uppercase text-[var(--fg-faint)]">
          conf <ConfidenceGauge value={dim.confidence} />
        </span>
        <span className="col-span-2 flex flex-wrap items-center gap-1.5 xl:col-span-1">
          <span
            className={`chip text-[10px] ${
              dim.coverageFlag === "covered"
                ? "chip--pos"
                : dim.coverageFlag === "thin"
                  ? "chip--warn"
                  : "chip--neg"
            }`}
          >
            {dim.coverageFlag}
          </span>
          <span className="chip chip--muted text-[10px]">{titleCase(dim.displayState)}</span>
        </span>
      </summary>
      <div className="border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--surface-2)_35%,transparent)] p-3">
        <div className="flex flex-col gap-2">
          {own.map((c) => (
            <CriterionCard key={c.criterionId} c={c} />
          ))}
        </div>
      </div>
    </details>
  );
}

function CriterionCard({ c }: { c: CriterionReadResult }) {
  return (
    <details className="rounded border border-[var(--line)] bg-[var(--surface-2)]">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 p-2 text-[12px]">
        <Icon name="chevron" className="text-[10px] text-[var(--fg-faint)]" />
        <span className="min-w-[180px] font-medium capitalize">{criterionLabel(c.criterionId)}</span>
        <span className="tnum">
          human anchor:{" "}
          <span className="font-medium">{c.rawAnchor === null ? "none" : c.rawAnchor}</span>
        </span>
        <span className="tnum text-[var(--fg-muted)]">
          → deterministic score <span className="font-medium text-[var(--fg)]">{Math.round(c.adjustedScore)}</span>
        </span>
        <span className="tnum text-[var(--fg-muted)]">coverage {c.coverage}</span>
        {c.neutralFill ? (
          <span className="chip chip--warn text-[10px]" title="No admissible evidence; filled with the neutral 50 prior.">
            neutral prior fill
          </span>
        ) : null}
        {c.contradiction !== "none" ? (
          <span className="chip chip--neg text-[10px]">{c.contradiction} contradiction</span>
        ) : null}
        {c.displayStatus === "INSUFFICIENT_EVIDENCE" ? (
          <span className="chip chip--muted text-[10px]">insufficient evidence</span>
        ) : null}
      </summary>
      <div className="border-t border-[var(--line)] p-2 text-[12px]">
        <p className="text-[var(--fg-muted)]">
          <span className="font-medium text-[var(--fg)]">Analyst rationale (human judgment): </span>
          {c.rationale}
        </p>
        {c.neutralFill ? (
          <p className="mt-1 text-[11px] text-[var(--warn)]">
            This criterion contributes only the neutral 50 prior. A thin-evidence fill, not a
            strongly-evidenced human assessment.
          </p>
        ) : null}
        <p className="mt-2 tnum text-[11px] text-[var(--fg-faint)]">
          confidence {pct(c.confidence)} · human anchor is the analyst&rsquo;s rubric input;
          deterministic score is the evidence-adjusted output. They are not interchangeable.
        </p>

        <ClaimList title={`Supporting evidence (${c.supportingClaims.length})`} claims={c.supportingClaims} />
        {c.reviewedButExcludedClaims.length ? (
          <ClaimList
            title={`Reviewed but excluded (${c.reviewedButExcludedClaims.length})`}
            claims={c.reviewedButExcludedClaims}
            excluded
          />
        ) : null}
      </div>
    </details>
  );
}

function ClaimList({
  title,
  claims,
  excluded,
}: {
  title: string;
  claims: ClaimRef[];
  excluded?: boolean;
}) {
  if (claims.length === 0)
    return <p className="mt-2 text-[11px] text-[var(--fg-faint)]">{title}: none.</p>;
  return (
    <div className="mt-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--fg-faint)]">
        {title}
      </p>
      <ul className="mt-1 flex flex-col gap-1.5">
        {claims.map((cl) => (
          <li key={cl.claimId} className="border-l-2 border-[var(--line-strong)] pl-2 text-[12px]">
            <p className={excluded ? "text-[var(--fg-faint)]" : ""}>{cl.claim}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--fg-faint)]">
              <span className="chip chip--muted text-[10px]">{cl.provenance}</span>
              {excluded ? <span className="chip chip--muted text-[10px]">not scored</span> : null}
              {cl.topic ? <span>topic: {cl.topic}</span> : null}
              {cl.publicationDate ? <span className="tnum">{cl.publicationDate}</span> : null}
              {cl.contradictedBy.length || cl.contradicts.length ? (
                <span className="text-[var(--neg)]">
                  contradiction {cl.contradictionNote ? "(noted)" : "(unresolved)"}
                </span>
              ) : null}
              <SourceButton sourceId={cl.sourceId}>source</SourceButton>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Research gaps                                                              */
/* -------------------------------------------------------------------------- */

function GapsSection({ detail }: { detail: CompanyScreeningDetail }) {
  const g = detail.evidenceGaps;
  return (
    <section id="gaps" aria-labelledby="gaps-h">
      <SectionHeading id="gaps-h">Research gaps</SectionHeading>
      <p className="mb-3 text-[12px] text-[var(--fg-muted)]">
        What to research next. Closing a gap changes coverage and confidence mechanically; it does
        not &ldquo;improve the company&rdquo;. This section produces no score and no recommendation.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <GapBlock title="Critical-dimension gaps" empty="No critical-dimension gaps.">
          {g.criticalDimensionGaps.map((c) => (
            <li key={c.dimension}>
              <span className="font-medium capitalize">{dimensionLabel(c.dimension)}</span> -
              coverage {c.coverage}
              {c.blocksEvidenceBar ? (
                <span className="ml-1 chip chip--neg text-[10px]">blocks evidence bar</span>
              ) : null}
            </li>
          ))}
        </GapBlock>
        <GapBlock title="Missing dimensions (zero coverage)" empty="No dimensions at zero coverage.">
          {g.missingDimensions.map((d) => (
            <li key={d} className="capitalize">
              {dimensionLabel(d)}
            </li>
          ))}
        </GapBlock>
        <GapBlock title="Thin dimensions (below 0.50)" empty="No thin dimensions.">
          {g.thinDimensions.map((d) => (
            <li key={d.dimension} className="capitalize">
              {dimensionLabel(d.dimension)} - coverage {d.coverage}
            </li>
          ))}
        </GapBlock>
        <GapBlock title="Criterion coverage gaps" empty="No criterion coverage gaps.">
          {g.criterionCoverageGaps.map((c) => (
            <li key={c.criterionId} className="capitalize">
              {criterionLabel(c.criterionId)}
              {c.neutralFill ? " - neutral prior fill" : ` - coverage ${c.coverage}`}
            </li>
          ))}
        </GapBlock>
        <GapBlock title="Unresolved conflicts" empty="No unresolved evidence conflicts.">
          {g.unresolvedConflicts.map((c) => (
            <li key={c.claimId}>
              Claim <span className="mono">{c.claimId}</span> conflicts with{" "}
              {c.against.join(", ")}
            </li>
          ))}
        </GapBlock>
        <GapBlock
          title="Reviewed but excluded evidence"
          empty="No reviewed-but-excluded evidence recorded."
        >
          {g.reviewedButExcludedEvidence.map((c, i) => (
            <li key={`${c.claimId}-${i}`} className="capitalize">
              {criterionLabel(c.criterionId)} - <span className="mono">{c.claimId}</span>
            </li>
          ))}
        </GapBlock>
      </div>

      <div className="card mt-3 p-3">
        <p className="text-[12px] font-medium">Research questions</p>
        {g.researchQuestions.length ? (
          <ol className="mt-1.5 list-decimal pl-5 text-[12px] text-[var(--fg-muted)]">
            {g.researchQuestions.map((q, i) => (
              <li key={i} className="mt-1">
                {q}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 text-[12px] text-[var(--fg-faint)]">
            No outstanding research questions derived.
          </p>
        )}
      </div>
    </section>
  );
}

function GapBlock({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : [];
  return (
    <div className="card p-3">
      <p className="text-[12px] font-medium">{title}</p>
      {items.length ? (
        <ul className="mt-1.5 flex flex-col gap-1 text-[12px] text-[var(--fg-muted)]">{children}</ul>
      ) : (
        <p className="mt-1 text-[12px] text-[var(--fg-faint)]">{empty}</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Evidence                                                                   */
/* -------------------------------------------------------------------------- */

function EvidenceSection({ detail }: { detail: CompanyScreeningDetail }) {
  const [provFilter, setProvFilter] = useState("all");
  const [conflictOnly, setConflictOnly] = useState(false);
  const provenances = useMemo(
    () => [...new Set(detail.citedClaims.map((c) => c.provenance))].sort(),
    [detail.citedClaims],
  );
  const claims = detail.citedClaims.filter((c) => {
    if (provFilter !== "all" && c.provenance !== provFilter) return false;
    if (conflictOnly && !c.contradicts.length && !c.contradictedBy.length) return false;
    return true;
  });

  return (
    <section id="evidence" aria-labelledby="evidence-h">
      <SectionHeading id="evidence-h">Evidence</SectionHeading>
      <p className="mb-2 text-[12px] text-[var(--fg-muted)]">
        {detail.citedClaims.length} evidence claims cited across the screening criteria. Full claim
        text and source below; raw article bodies are never stored or shown.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[12px]">
        <label className="flex items-center gap-1.5">
          Provenance
          <select value={provFilter} onChange={(e) => setProvFilter(e.target.value)}>
            <option value="all">All</option>
            {provenances.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={conflictOnly}
            onChange={(e) => setConflictOnly(e.target.checked)}
          />
          Contradiction only
        </label>
        <span className="text-[var(--fg-faint)]">
          {claims.length} of {detail.citedClaims.length}
        </span>
      </div>

      <ul className="flex flex-col divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {claims.map((c) => (
          <li
            key={c.claimId}
            className="py-3 text-[12px] [overflow-wrap:anywhere] first:pt-2 last:pb-2"
          >
            <p className="text-[var(--fg)]">{c.claim}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--fg-faint)]">
              <span className="chip chip--muted text-[10px]">{c.provenance}</span>
              {c.sourceSubtype ? <span>{c.sourceSubtype.replace(/_/g, " ")}</span> : null}
              {c.topic ? <span>topic: {c.topic}</span> : null}
              {c.publicationDate ? <span className="tnum">published {c.publicationDate}</span> : null}
              {c.metricAsOfDate ? <span className="tnum">as-of {c.metricAsOfDate}</span> : null}
              {c.contradicts.length || c.contradictedBy.length ? (
                <span className="chip chip--neg text-[10px]">
                  {c.contradictionNote ? "contradiction (noted)" : "contradiction (unresolved)"}
                </span>
              ) : null}
              <SourceButton sourceId={c.sourceId}>trace to source</SourceButton>
            </p>
            {c.diligenceQuestion ? (
              <p className="mt-1 text-[11px] text-[var(--fg-muted)]">
                Diligence question: {c.diligenceQuestion}
              </p>
            ) : null}
          </li>
        ))}
        {claims.length === 0 ? (
          <li className="card p-3 text-[12px] text-[var(--fg-muted)]">No claims match the filter.</li>
        ) : null}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Signals                                                                    */
/* -------------------------------------------------------------------------- */

function SignalsSection({
  detail,
  hasNegative,
}: {
  detail: CompanyScreeningDetail;
  hasNegative: boolean;
}) {
  return (
    <section id="signals" aria-labelledby="signals-h">
      <SectionHeading
        id="signals-h"
        aside={
          hasNegative ? (
            <span className="chip chip--neg text-[10px]">
              <Icon name="alert" /> includes negative signals
            </span>
          ) : null
        }
      >
        Signals
      </SectionHeading>
      <p className="mb-3 text-[12px] text-[var(--fg-muted)]">
        Canonical dated events, most recent first. Momentum and Convergence scores are not
        computed or shown - they are not production decision metrics in this release. Negative
        events are shown explicitly and are never netted away.
      </p>
      {detail.signalEvents.length === 0 ? (
        <div className="card p-3 text-[12px] text-[var(--fg-muted)]">
          No signal events recorded. This is not &ldquo;Momentum: 0&rdquo; - it is the absence of
          recorded events.
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {detail.signalEvents.map((e) => {
            const negative = e.signalDirection.toLowerCase() === "negative";
            return (
              <li
                key={e.eventId}
                className={`card p-2.5 text-[12px] ${negative ? "border-l-2 border-l-[var(--neg)]" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tnum font-medium">{dateOnly(e.eventDate)}</span>
                  <span className="capitalize">{e.signalType.replace(/_/g, " ")}</span>
                  <SignalDirection direction={e.signalDirection} />
                  <EventStatusMark status={e.eventStatus} />
                  <span className="text-[var(--fg-faint)]">{e.signalCategory.replace(/_/g, " ")}</span>
                </div>
                {e.summary ? <p className="mt-1 text-[var(--fg-muted)]">{e.summary}</p> : null}
                <p className="mt-1 text-[11px]">
                  {e.sourceId ? (
                    <SourceButton sourceId={e.sourceId}>source</SourceButton>
                  ) : e.sourceUrl ? (
                    <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer">
                      source link
                    </a>
                  ) : (
                    <span className="text-[var(--fg-faint)]">source unavailable</span>
                  )}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Sources                                                                    */
/* -------------------------------------------------------------------------- */

function SourcesSection({ detail }: { detail: CompanyScreeningDetail }) {
  return (
    <section id="sources" aria-labelledby="sources-h">
      <SectionHeading id="sources-h">Sources</SectionHeading>
      <p className="mb-3 text-[12px] text-[var(--fg-muted)]">
        {detail.citedSources.length} distinct source records cited for this company. Select one to
        see its lineage and everything in the corpus that cites it.
      </p>
      <ul className="card divide-y divide-[var(--line)]">
        {detail.citedSources.map((s) => (
          <li key={s.sourceId} className="flex flex-wrap items-center justify-between gap-2 p-2.5 text-[12px]">
            <span className="min-w-0">
              <SourceButton sourceId={s.sourceId}>
                {s.title ?? s.publisher ?? s.sourceId}
              </SourceButton>
              <span className="ml-2 text-[11px] text-[var(--fg-faint)]">
                {s.publisher ?? "unknown publisher"} · {s.sourceType.replace(/_/g, " ")}
                {s.publishedAt ? ` · ${s.publishedAt}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* People                                                                     */
/* -------------------------------------------------------------------------- */

function PeopleSection({ detail }: { detail: CompanyScreeningDetail }) {
  return (
    <section id="people" aria-labelledby="people-h">
      <SectionHeading id="people-h">People</SectionHeading>
      {detail.people.length === 0 ? (
        <div className="card p-3 text-[12px] text-[var(--fg-muted)]">
          No canonical person records attached to this company.
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {detail.people.map((p) => (
            <li key={p.personId} className="card p-2.5 text-[12px]">
              <p className="font-medium">
                {p.name}
                {p.isFounder ? <span className="ml-1.5 chip chip--muted text-[10px]">founder</span> : null}
              </p>
              {p.currentRole ? <p className="text-[var(--fg-muted)]">{p.currentRole}</p> : null}
              {p.companyRoles.length ? (
                <ul className="mt-1 text-[11px] text-[var(--fg-faint)]">
                  {p.companyRoles.map((r, i) => (
                    <li key={i}>
                      {r.role}
                      {r.startDate ? ` (${r.startDate.slice(0, 4)}${r.endDate ? `-${r.endDate.slice(0, 4)}` : "-present"})` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
              {p.priorCompanies.length ? (
                <p className="mt-1 text-[11px] text-[var(--fg-faint)]">
                  Prior: {p.priorCompanies.join(", ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Source drawer (non-modal side sheet)                                       */
/* -------------------------------------------------------------------------- */

function SourceDrawer({
  detail,
  sourceId,
  onClose,
}: {
  detail: CompanyScreeningDetail;
  sourceId: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  const source = detail.citedSources.find((s) => s.sourceId === sourceId) ?? null;
  const citingClaims = detail.citedClaims.filter(
    (c) => c.sourceId === sourceId || c.supportingSourceIds.includes(sourceId),
  );
  const citingEvents = detail.signalEvents.filter((e) => e.sourceId === sourceId);

  return (
    <div
      role="dialog"
      aria-label="Source record"
      aria-modal="false"
      className="drawer-enter fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-[var(--line-strong)] bg-[var(--surface)] shadow-[var(--shadow-md)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--line)] p-3">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
          Source record
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close source record"
          className="rounded p-1 hover:bg-[var(--surface-2)]"
          ref={closeRef}
        >
          <Icon name="close" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 text-[12px]">
        {source ? (
          <>
            <p className="text-[14px] font-medium">{source.title ?? source.publisher ?? source.sourceId}</p>
            <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[12px]">
              <dt className="text-[var(--fg-faint)]">Publisher</dt>
              <dd>{source.publisher ?? "unknown"}</dd>
              <dt className="text-[var(--fg-faint)]">Type</dt>
              <dd>{source.sourceType.replace(/_/g, " ")}</dd>
              <dt className="text-[var(--fg-faint)]">Published</dt>
              <dd className="tnum">{source.publishedAt ?? "not recorded"}</dd>
              <dt className="text-[var(--fg-faint)]">Origin lineage</dt>
              <dd>{source.originatesFrom ?? "root source (no upstream origin recorded)"}</dd>
              <dt className="text-[var(--fg-faint)]">Link</dt>
              <dd className="min-w-0 break-words">
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    {domainOf(source.url)}
                  </a>
                ) : (
                  "no URL on record"
                )}
              </dd>
            </dl>
          </>
        ) : (
          <div className="card p-3 text-[var(--fg-muted)]">
            <p className="font-medium text-[var(--fg)]">Source record unavailable</p>
            <p className="mt-1">
              A claim references source <span className="mono">{sourceId}</span>, which is not in
              the cited source set. Flagged as a data issue.
            </p>
          </div>
        )}

        <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-[var(--fg-faint)]">
          Claims citing this source ({citingClaims.length})
        </p>
        <ul className="mt-1 flex flex-col gap-1.5">
          {citingClaims.map((c) => (
            <li key={c.claimId} className="border-l-2 border-[var(--line-strong)] pl-2">
              {c.claim}
            </li>
          ))}
          {citingClaims.length === 0 ? (
            <li className="text-[var(--fg-faint)]">None in this company&rsquo;s cited set.</li>
          ) : null}
        </ul>

        {citingEvents.length ? (
          <>
            <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-[var(--fg-faint)]">
              Signal events citing this source ({citingEvents.length})
            </p>
            <ul className="mt-1 flex flex-col gap-1.5">
              {citingEvents.map((e) => (
                <li key={e.eventId} className="border-l-2 border-[var(--line-strong)] pl-2">
                  <span className="tnum">{dateOnly(e.eventDate)}</span> - {e.summary ?? e.signalType}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
