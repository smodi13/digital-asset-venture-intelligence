"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ScreeningWorklistRow } from "@/lib/screening-read";
import {
  CoverageMeter,
  ConfidenceGauge,
  DisplayStateBadge,
  EvidenceBarChip,
  Icon,
  SignalDirection,
} from "@/components/ui";
import { dateOnly, fitDisplay } from "@/lib/ui/format";

type SortKey = "name" | "updated" | "fit" | "coverage" | "confidence" | "signal";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Company" },
  { key: "updated", label: "Last update" },
  { key: "fit", label: "Fit" },
  { key: "coverage", label: "Coverage" },
  { key: "confidence", label: "Confidence" },
  { key: "signal", label: "Signal recency" },
];

function sortValue(r: ScreeningWorklistRow, key: SortKey): string | number {
  switch (key) {
    case "name":
      return r.identity.name.toLowerCase();
    case "updated":
      return r.identity.lastResearchUpdate ?? "";
    case "fit":
      return r.screeningThesisFit;
    case "coverage":
      return r.overallEvidenceCoverage;
    case "confidence":
      return r.overallEvidenceConfidence;
    case "signal":
      return r.recentSignal?.eventDate ?? "";
  }
}

export function WorklistView({ rows }: { rows: ScreeningWorklistRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [fDisplay, setFDisplay] = useState<"all" | "SCREENED" | "INSUFFICIENT_EVIDENCE">("all");
  const [fBar, setFBar] = useState<"all" | "meets" | "not">("all");
  const [fSector, setFSector] = useState("all");
  const [fStage, setFStage] = useState("all");
  const [fCritical, setFCritical] = useState(false);

  const sectors = useMemo(
    () => [...new Set(rows.map((r) => r.identity.sector).filter(Boolean))].sort() as string[],
    [rows],
  );
  const stages = useMemo(
    () => [...new Set(rows.map((r) => r.identity.stage).filter(Boolean))].sort() as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    let out = rows.filter((r) => {
      if (fDisplay !== "all" && r.displayState !== fDisplay) return false;
      if (fBar === "meets" && !r.evidenceBar.nonMandateEvidenceBarPass) return false;
      if (fBar === "not" && r.evidenceBar.nonMandateEvidenceBarPass) return false;
      if (fSector !== "all" && r.identity.sector !== fSector) return false;
      if (fStage !== "all" && r.identity.stage !== fStage) return false;
      if (fCritical && r.evidenceBar.criticalDimensionsNonZeroCoveragePass) return false;
      return true;
    });
    if (sort) {
      const mul = sort.dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        const av = sortValue(a, sort.key);
        const bv = sortValue(b, sort.key);
        if (av < bv) return -1 * mul;
        if (av > bv) return 1 * mul;
        return a.identity.name.localeCompare(b.identity.name);
      });
    }
    return out;
  }, [rows, sort, fDisplay, fBar, fSector, fStage, fCritical]);

  const filtersActive =
    fDisplay !== "all" || fBar !== "all" || fSector !== "all" || fStage !== "all" || fCritical;

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s?.key === key
        ? s.dir === "asc"
          ? { key, dir: "desc" }
          : null
        : { key, dir: key === "name" ? "asc" : "desc" },
    );
  }

  function clearAll() {
    setFDisplay("all");
    setFBar("all");
    setFSector("all");
    setFStage("all");
    setFCritical(false);
    setSort(null);
  }

  return (
    <div>
      {/* Filters - an analyst toolbar, grouped by spacing and a pair of hairlines
          rather than another enclosing box. No panel fill: the row sits on the
          page ground. */}
      <div className="mb-4 border-y border-[var(--line)] py-4">
        <div className="filter-grid" role="group" aria-label="Worklist filters">
          <Field label="Screening display state">
            <select value={fDisplay} onChange={(e) => setFDisplay(e.target.value as typeof fDisplay)}>
              <option value="all">All</option>
              <option value="SCREENED">Screened</option>
              <option value="INSUFFICIENT_EVIDENCE">Insufficient evidence</option>
            </select>
          </Field>
          <Field label="Screening evidence bar">
            <select value={fBar} onChange={(e) => setFBar(e.target.value as typeof fBar)}>
              <option value="all">All</option>
              <option value="meets">Meets the evidence bar</option>
              <option value="not">Does not yet meet</option>
            </select>
          </Field>
          <Field label="Sector">
            <select value={fSector} onChange={(e) => setFSector(e.target.value)}>
              <option value="all">All sectors</option>
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Stage">
            <select value={fStage} onChange={(e) => setFStage(e.target.value)}>
              <option value="all">All stages</option>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-1.5 t-meta text-[var(--fg-muted)]">
            <input type="checkbox" checked={fCritical} onChange={(e) => setFCritical(e.target.checked)} />
            Critical evidence gap present
          </label>
        </div>
        {(filtersActive || sort) && (
          <button type="button" onClick={clearAll} className="btn-quiet mt-3">
            Clear all filters and sort
          </button>
        )}
      </div>

      {/* Order + sort */}
      <div className="mb-3 flex flex-col gap-2 t-meta text-[var(--fg-muted)] sm:flex-row sm:items-center sm:justify-between">
        <span className="flex flex-wrap items-center gap-2">
          <span>
            {filtered.length} of {rows.length} companies
          </span>
          {sort ? (
            <span className="chip chip--accent">
              Sorted by you: {SORTS.find((s) => s.key === sort.key)?.label}{" "}
              {sort.dir === "asc" ? "ascending" : "descending"}
              <button type="button" aria-label="Clear sort" onClick={() => setSort(null)}>
                <Icon name="close" className="text-[10px]" />
              </button>
            </span>
          ) : (
            <span className="text-[var(--fg-faint)]">Default neutral order (canonical, not a ranking)</span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-1">
          <span className="text-[var(--fg-faint)]">Sort:</span>
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => toggleSort(s.key)}
              aria-pressed={sort?.key === s.key}
              className={`rounded px-2 py-1 transition-colors duration-[120ms] ${
                sort?.key === s.key
                  ? "bg-[var(--accent-weak)] text-[var(--accent)]"
                  : "hover:bg-[var(--surface-2)]"
              }`}
            >
              {s.label}
              {sort?.key === s.key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
            </button>
          ))}
        </span>
      </div>

      {/* Desktop table. Columns run identity -> evidence -> screening -> signal,
          each block set off by one soft vertical separator. */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="dtable">
          <caption className="sr-only">
            Analyst screening worklist. {filtered.length} companies.
            {sort ? ` Sorted by ${sort.key}, ${sort.dir}ending.` : " Default neutral order."}
          </caption>
          <thead>
            <tr>
              <Th>Company</Th>
              <Th>Sector</Th>
              <Th>Stage</Th>
              <Th
                groupStart
                num
                onSort={() => toggleSort("coverage")}
                sortState={colSort(sort, "coverage")}
              >
                Coverage
              </Th>
              <Th num onSort={() => toggleSort("confidence")} sortState={colSort(sort, "confidence")}>
                Confidence
              </Th>
              <Th groupStart onSort={() => toggleSort("name")} sortState={colSort(sort, "name")}>
                Display state
              </Th>
              <Th num onSort={() => toggleSort("fit")} sortState={colSort(sort, "fit")}>
                Fit
              </Th>
              <Th>Evidence bar</Th>
              <Th>Evidence gap</Th>
              <Th groupStart onSort={() => toggleSort("signal")} sortState={colSort(sort, "signal")}>
                Signal
              </Th>
              <Th num onSort={() => toggleSort("updated")} sortState={colSort(sort, "updated")}>
                Last update
              </Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.identity.companyId}>
                <td className="max-w-[240px]">
                  <Link
                    href={`/companies/${r.identity.companyId}`}
                    className="font-semibold text-[var(--fg)]"
                  >
                    {r.identity.name}
                  </Link>
                  <p className="mt-0.5 line-clamp-1 text-[12px] text-[var(--fg-faint)]">
                    {r.identity.description ?? "No description on file"}
                  </p>
                </td>
                <td className="max-w-[150px] text-[12px] text-[var(--fg-muted)]">
                  <span className="line-clamp-2">{r.identity.sector ?? "Unknown"}</span>
                </td>
                <td className="text-[12px] text-[var(--fg-muted)]">
                  {r.identity.stage ? r.identity.stage.replace(/_/g, " ") : "Unknown"}
                </td>
                <td className="num group-start">
                  <CoverageMeter value={r.overallEvidenceCoverage} compact />
                </td>
                <td className="num">
                  <ConfidenceGauge value={r.overallEvidenceConfidence} />
                </td>
                <td className="group-start">
                  <DisplayStateBadge state={r.displayState} />
                </td>
                <td className="num">
                  <span className="font-medium">{fitDisplay(r.screeningThesisFit)}</span>
                </td>
                <td>
                  <EvidenceBarChip pass={r.evidenceBar.nonMandateEvidenceBarPass} />
                </td>
                <td className="max-w-[180px] text-[12px] text-[var(--fg-muted)]">
                  {r.majorEvidenceGap ?? "None identified"}
                </td>
                <td className="group-start text-[12px]">
                  {r.recentSignal ? (
                    <span className="flex flex-col gap-0.5">
                      <span className="tnum text-[var(--fg-muted)]">
                        {dateOnly(r.recentSignal.eventDate)}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="text-[var(--fg-muted)]">
                          {r.recentSignal.signalType.replace(/_/g, " ")}
                        </span>
                        <SignalDirection direction={r.recentSignal.signalDirection} />
                      </span>
                      {r.recentSignal.eventStatus === "reported_unconfirmed" ? (
                        <span className="text-[11px] text-[var(--warn)]">reported, unconfirmed</span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-[var(--fg-faint)]">No signal events</span>
                  )}
                </td>
                <td className="num text-[12px] text-[var(--fg-muted)]">
                  {dateOnly(r.identity.lastResearchUpdate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="flex flex-col border-t border-[var(--line)] lg:hidden">
        {filtered.map((r) => (
          <li key={r.identity.companyId} className="border-b border-[var(--line)] py-3.5">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/companies/${r.identity.companyId}`} className="font-medium">
                {r.identity.name}
              </Link>
              <DisplayStateBadge state={r.displayState} />
            </div>
            <p className="mt-1 text-[12px] text-[var(--fg-muted)]">
              {r.identity.description ?? "No description on file"}
            </p>
            <p className="mt-1 text-[11px] text-[var(--fg-faint)]">
              {r.identity.sector ?? "Unknown sector"}
              {r.identity.stage ? ` · ${r.identity.stage.replace(/_/g, " ")}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
              <span className="flex items-center gap-1">
                Coverage <CoverageMeter value={r.overallEvidenceCoverage} compact />
              </span>
              <span className="flex items-center gap-1">
                Confidence <ConfidenceGauge value={r.overallEvidenceConfidence} />
              </span>
              <span>
                Fit <span className="tnum font-medium">{fitDisplay(r.screeningThesisFit)}</span>{" "}
                <span className="text-[10px] uppercase text-[var(--fg-faint)]">screening</span>
              </span>
            </div>
            {r.majorEvidenceGap ? (
              <p className="mt-1.5 text-[11px] text-[var(--fg-muted)]">Gap: {r.majorEvidenceGap}</p>
            ) : null}
          </li>
        ))}
      </ul>

      {filtered.length === 0 ? (
        <div className="card mt-2 p-4 text-[13px] text-[var(--fg-muted)] rounded-md">
          No companies match the active filters.{" "}
          <button type="button" onClick={clearAll} className="underline">
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}

function colSort(
  sort: { key: SortKey; dir: "asc" | "desc" } | null,
  key: SortKey,
): "none" | "ascending" | "descending" {
  if (sort?.key !== key) return "none";
  return sort.dir === "asc" ? "ascending" : "descending";
}

function Th({
  children,
  onSort,
  sortState,
  groupStart,
  num,
}: {
  children: React.ReactNode;
  onSort?: () => void;
  sortState?: "none" | "ascending" | "descending";
  groupStart?: boolean;
  num?: boolean;
}) {
  const cls = `${groupStart ? "group-start" : ""} ${num ? "num" : ""}`.trim() || undefined;
  if (!onSort)
    return (
      <th scope="col" className={cls}>
        {children}
      </th>
    );
  const active = sortState === "ascending" || sortState === "descending";
  return (
    <th scope="col" aria-sort={sortState} className={cls}>
      <button
        type="button"
        onClick={onSort}
        className={`inline-flex items-center gap-1 font-semibold uppercase tracking-[0.03em] hover:text-[var(--accent)] ${
          active ? "text-[var(--accent)]" : ""
        } ${num ? "flex-row-reverse" : ""}`}
      >
        {children}
        <span aria-hidden className="text-[9px] opacity-70">
          {sortState === "ascending" ? "▲" : sortState === "descending" ? "▼" : "↕"}
        </span>
      </button>
    </th>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-medium text-[var(--fg-muted)]">
      {label}
      {children}
    </label>
  );
}
