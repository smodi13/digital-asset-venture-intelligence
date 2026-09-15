"use client";

import Link from "next/link";
import type { SourcingWorklistRow } from "@/lib/digital-asset-product";
import { useRadar } from "@/components/radar/useRadar";
import { CoverageMeter, ConfidenceGauge, ProductDisplayStateBadge, SignalDirection } from "@/components/ui";
import { dateOnly, fitDisplay, titleCase } from "@/lib/ui/format";

type AttentionLabel = "Recent Signal" | "Evidence Gap" | "Insufficient Evidence" | "Provisional Evidence";

/** Deterministic workflow labels from existing product fields only - never a composite score, never a ranking. */
function attentionLabels(r: SourcingWorklistRow): AttentionLabel[] {
  const labels: AttentionLabel[] = [];
  if (r.recentSignal) labels.push("Recent Signal");
  if (r.majorEvidenceGap) labels.push("Evidence Gap");
  if (r.displayState === "INSUFFICIENT_EVIDENCE") labels.push("Insufficient Evidence");
  if (r.displayState === "PROVISIONAL") labels.push("Provisional Evidence");
  return labels;
}

/** Default order: recent signals first, then evidence gaps, then alphabetical. Never an investment ranking. */
function sortRadarRows(rows: SourcingWorklistRow[]): SourcingWorklistRow[] {
  return [...rows].sort((a, b) => {
    const aSignal = a.recentSignal?.eventDate ?? "";
    const bSignal = b.recentSignal?.eventDate ?? "";
    if (aSignal !== bSignal) return bSignal.localeCompare(aSignal);
    const aGap = a.majorEvidenceGap ? 1 : 0;
    const bGap = b.majorEvidenceGap ? 1 : 0;
    if (aGap !== bGap) return bGap - aGap;
    return a.name.localeCompare(b.name);
  });
}

export function RadarView({ rows }: { rows: SourcingWorklistRow[] }) {
  const { hydrated, ids, remove } = useRadar();
  const onRadar = sortRadarRows(rows.filter((r) => ids.includes(r.entityId)));

  if (!hydrated) return null;

  if (onRadar.length === 0) {
    return (
      <div className="card rounded-md p-6 text-[13px] text-[var(--fg-muted)]">
        <p className="font-medium text-[var(--fg)]">Your Follow-On Radar is empty.</p>
        <p className="mt-2 measure">
          This is a monitoring list you control, not a record of actual portfolio holdings. Add a
          researched company from <Link href="/worklist">Sourcing Worklist</Link>,{" "}
          <Link href="/companies">Companies</Link>, or any Company Detail page to start tracking it
          here as a priority follow-on name.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 t-meta text-[var(--fg-faint)]">
        {onRadar.length} of {rows.length} researched companies on your local radar. Order: recent
        signals first, then evidence gaps, then alphabetical - not an investment ranking. Stored only
        in this browser.
      </p>

      <div className="hidden overflow-x-auto lg:block">
        <table className="dtable">
          <caption className="sr-only">Follow-On Radar. {onRadar.length} companies you are monitoring.</caption>
          <thead>
            <tr>
              <th scope="col">Company</th>
              <th scope="col">Category</th>
              <th scope="col">Lifecycle</th>
              <th scope="col" className="group-start">Display state</th>
              <th scope="col" className="num">Thesis Fit</th>
              <th scope="col" className="num">Coverage</th>
              <th scope="col" className="num">Confidence</th>
              <th scope="col" className="group-start">Recent signal</th>
              <th scope="col">Largest evidence gap</th>
              <th scope="col" className="group-start">Attention</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {onRadar.map((r) => (
              <tr key={r.entityId}>
                <td className="max-w-[200px]">
                  <Link href={`/companies/${r.slug}`} className="font-semibold text-[var(--fg)]">
                    {r.name}
                  </Link>
                </td>
                <td className="max-w-[160px] text-[12px] text-[var(--fg-muted)]">
                  {r.category ? titleCase(r.category) : "Uncategorized"}
                </td>
                <td className="text-[12px] text-[var(--fg-muted)]">
                  {r.digitalAssetLifecycle ? titleCase(r.digitalAssetLifecycle) : "Unknown"}
                </td>
                <td className="group-start">
                  <ProductDisplayStateBadge state={r.displayState} />
                </td>
                <td className="num tnum font-medium">{fitDisplay(r.thesisFit)}</td>
                <td className="num">
                  <CoverageMeter value={r.overallCoverage} compact />
                </td>
                <td className="num">
                  <ConfidenceGauge value={r.overallConfidence} />
                </td>
                <td className="group-start text-[12px]">
                  {r.recentSignal ? (
                    <span className="flex flex-col gap-0.5">
                      <span className="tnum text-[var(--fg-muted)]">{dateOnly(r.recentSignal.eventDate)}</span>
                      <span className="flex items-center gap-1">
                        <span className="text-[var(--fg-muted)]">{titleCase(r.recentSignal.signalType)}</span>
                        <SignalDirection direction={r.recentSignal.signalDirection} />
                      </span>
                    </span>
                  ) : (
                    <span className="text-[var(--fg-faint)]">No signal events</span>
                  )}
                </td>
                <td className="max-w-[180px] text-[12px] text-[var(--fg-muted)]">{r.majorEvidenceGap ?? "None identified"}</td>
                <td className="group-start">
                  <div className="flex flex-wrap gap-1">
                    {attentionLabels(r).map((label) => (
                      <span key={label} className="chip chip--muted text-[10px]">
                        {label}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <button type="button" onClick={() => remove(r.entityId)} className="btn-quiet text-[11px]">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col border-t border-[var(--line)] lg:hidden">
        {onRadar.map((r) => (
          <li key={r.entityId} className="border-b border-[var(--line)] py-3.5">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/companies/${r.slug}`} className="font-medium">
                {r.name}
              </Link>
              <ProductDisplayStateBadge state={r.displayState} />
            </div>
            <p className="mt-1 text-[11px] text-[var(--fg-faint)]">
              {r.category ? titleCase(r.category) : "Uncategorized"}
              {r.digitalAssetLifecycle ? ` · ${titleCase(r.digitalAssetLifecycle)}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
              <span className="flex items-center gap-1">
                Coverage <CoverageMeter value={r.overallCoverage} compact />
              </span>
              <span className="flex items-center gap-1">
                Confidence <ConfidenceGauge value={r.overallConfidence} />
              </span>
            </div>
            {attentionLabels(r).length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {attentionLabels(r).map((label) => (
                  <span key={label} className="chip chip--muted text-[10px]">
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
            <button type="button" onClick={() => remove(r.entityId)} className="btn-quiet mt-2 text-[11px]">
              Remove from Radar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
