"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SourcingWorklistRow } from "@/lib/digital-asset-product";
import { CoverageMeter, ConfidenceGauge, ProductDisplayStateBadge, Icon, SignalDirection } from "@/components/ui";
import { RadarButton } from "@/components/radar/RadarButton";
import { dateOnly, fitDisplay, titleCase } from "@/lib/ui/format";

type SortKey = "name" | "signal" | "coverage" | "fit";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Company" },
  { key: "signal", label: "Recent signal" },
  { key: "coverage", label: "Evidence readiness" },
  { key: "fit", label: "Thesis Fit" },
];

function sortValue(r: SourcingWorklistRow, key: SortKey): string | number {
  switch (key) {
    case "name":
      return r.name.toLowerCase();
    case "signal":
      return r.recentSignal?.eventDate ?? "";
    case "coverage":
      return r.overallCoverage;
    case "fit":
      return r.thesisFit;
  }
}

export function ProductWorklistView({ rows }: { rows: SourcingWorklistRow[] }) {
  // Default order is alphabetical - analytically neutral. There is no default
  // sort by Thesis Fit: rankEligibility is NOT_ASSESSED for every company, so
  // no ordering here may read as an investment ranking.
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [fCategory, setFCategory] = useState("all");
  const [fEntityType, setFEntityType] = useState("all");
  const [fAssetType, setFAssetType] = useState("all");
  const [fLifecycle, setFLifecycle] = useState("all");
  const [fDisplay, setFDisplay] = useState<"all" | "PROVISIONAL" | "INSUFFICIENT_EVIDENCE">("all");

  const categories = useMemo(() => [...new Set(rows.map((r) => r.category).filter(Boolean))].sort() as string[], [rows]);
  const entityTypes = useMemo(() => [...new Set(rows.map((r) => r.entityType))].sort(), [rows]);
  const assetTypes = useMemo(() => [...new Set(rows.map((r) => r.assetType))].sort(), [rows]);
  const lifecycles = useMemo(
    () => [...new Set(rows.map((r) => r.digitalAssetLifecycle).filter(Boolean))].sort() as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    let out = rows.filter((r) => {
      if (fCategory !== "all" && r.category !== fCategory) return false;
      if (fEntityType !== "all" && r.entityType !== fEntityType) return false;
      if (fAssetType !== "all" && r.assetType !== fAssetType) return false;
      if (fLifecycle !== "all" && r.digitalAssetLifecycle !== fLifecycle) return false;
      if (fDisplay !== "all" && r.displayState !== fDisplay) return false;
      return true;
    });
    if (sort) {
      const mul = sort.dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        const av = sortValue(a, sort.key);
        const bv = sortValue(b, sort.key);
        if (av < bv) return -1 * mul;
        if (av > bv) return 1 * mul;
        return a.name.localeCompare(b.name);
      });
    } else {
      out = [...out].sort((a, b) => a.name.localeCompare(b.name));
    }
    return out;
  }, [rows, sort, fCategory, fEntityType, fAssetType, fLifecycle, fDisplay]);

  const filtersActive = fCategory !== "all" || fEntityType !== "all" || fAssetType !== "all" || fLifecycle !== "all" || fDisplay !== "all";

  function toggleSort(key: SortKey) {
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: key === "name" ? "asc" : "desc" }));
  }

  function clearAll() {
    setFCategory("all");
    setFEntityType("all");
    setFAssetType("all");
    setFLifecycle("all");
    setFDisplay("all");
    setSort(null);
  }

  return (
    <div>
      <div className="mb-4 border-y border-[var(--line)] py-4">
        <div className="filter-grid" role="group" aria-label="Sourcing Worklist filters">
          <Field label="Category">
            <select value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {titleCase(c)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Entity type">
            <select value={fEntityType} onChange={(e) => setFEntityType(e.target.value)}>
              <option value="all">All</option>
              {entityTypes.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Asset type">
            <select value={fAssetType} onChange={(e) => setFAssetType(e.target.value)}>
              <option value="all">All</option>
              {assetTypes.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Lifecycle">
            <select value={fLifecycle} onChange={(e) => setFLifecycle(e.target.value)}>
              <option value="all">All</option>
              {lifecycles.map((l) => (
                <option key={l} value={l}>
                  {titleCase(l)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Display state">
            <select value={fDisplay} onChange={(e) => setFDisplay(e.target.value as typeof fDisplay)}>
              <option value="all">All</option>
              <option value="PROVISIONAL">Provisional</option>
              <option value="INSUFFICIENT_EVIDENCE">Insufficient evidence</option>
            </select>
          </Field>
        </div>
        {(filtersActive || sort) && (
          <button type="button" onClick={clearAll} className="btn-quiet mt-3">
            Clear all filters and sort
          </button>
        )}
      </div>

      <div className="mb-3 flex flex-col gap-2 t-meta text-[var(--fg-muted)] sm:flex-row sm:items-center sm:justify-between">
        <span className="flex flex-wrap items-center gap-2">
          <span>
            {filtered.length} of {rows.length} companies
          </span>
          {sort ? (
            <span className="chip chip--accent">
              Sorted by you: {SORTS.find((s) => s.key === sort.key)?.label} {sort.dir === "asc" ? "ascending" : "descending"}
              <button type="button" aria-label="Clear sort" onClick={() => setSort(null)}>
                <Icon name="close" className="text-[10px]" />
              </button>
            </span>
          ) : (
            <span className="text-[var(--fg-faint)]">Default alphabetical order (not a ranking)</span>
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
                sort?.key === s.key ? "bg-[var(--accent-weak)] text-[var(--accent)]" : "hover:bg-[var(--surface-2)]"
              }`}
            >
              {s.label}
              {sort?.key === s.key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
            </button>
          ))}
        </span>
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="dtable">
          <caption className="sr-only">
            Sourcing Worklist. {filtered.length} companies.
            {sort ? ` Sorted by ${sort.key}, ${sort.dir}ending.` : " Default alphabetical order."}
          </caption>
          <thead>
            <tr>
              <Th onSort={() => toggleSort("name")} sortState={colSort(sort, "name")}>Company</Th>
              <Th>Category</Th>
              <Th>Entity type</Th>
              <Th>Asset type</Th>
              <Th>Lifecycle</Th>
              <Th groupStart num onSort={() => toggleSort("coverage")} sortState={colSort(sort, "coverage")}>Coverage</Th>
              <Th num>Confidence</Th>
              <Th groupStart>Display state</Th>
              <Th num onSort={() => toggleSort("fit")} sortState={colSort(sort, "fit")}>Thesis Fit</Th>
              <Th>Evidence gap</Th>
              <Th groupStart onSort={() => toggleSort("signal")} sortState={colSort(sort, "signal")}>Recent signal</Th>
              <Th groupStart>Radar</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.entityId}>
                <td className="max-w-[220px]">
                  <Link href={`/companies/${r.slug}`} className="font-semibold text-[var(--fg)]">
                    {r.name}
                  </Link>
                </td>
                <td className="max-w-[160px] text-[12px] text-[var(--fg-muted)]">
                  <span className="line-clamp-2">{r.category ? titleCase(r.category) : "Uncategorized"}</span>
                </td>
                <td className="text-[12px] text-[var(--fg-muted)]">{titleCase(r.entityType)}</td>
                <td className="text-[12px] text-[var(--fg-muted)]">{titleCase(r.assetType)}</td>
                <td className="text-[12px] text-[var(--fg-muted)]">{r.digitalAssetLifecycle ? titleCase(r.digitalAssetLifecycle) : "Unknown"}</td>
                <td className="num group-start">
                  <CoverageMeter value={r.overallCoverage} compact />
                </td>
                <td className="num">
                  <ConfidenceGauge value={r.overallConfidence} />
                </td>
                <td className="group-start">
                  <ProductDisplayStateBadge state={r.displayState} />
                </td>
                <td className="num">
                  <span className="font-medium">{fitDisplay(r.thesisFit)}</span>
                </td>
                <td className="max-w-[180px] text-[12px] text-[var(--fg-muted)]">{r.majorEvidenceGap ?? "None identified"}</td>
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
                <td className="group-start">
                  <RadarButton entityId={r.entityId} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col border-t border-[var(--line)] lg:hidden">
        {filtered.map((r) => (
          <li key={r.entityId} className="border-b border-[var(--line)] py-3.5">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/companies/${r.slug}`} className="font-medium">
                {r.name}
              </Link>
              <ProductDisplayStateBadge state={r.displayState} />
            </div>
            <p className="mt-1 text-[11px] text-[var(--fg-faint)]">
              {r.category ? titleCase(r.category) : "Uncategorized"} · {titleCase(r.entityType)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
              <span className="flex items-center gap-1">
                Coverage <CoverageMeter value={r.overallCoverage} compact />
              </span>
              <span className="flex items-center gap-1">
                Confidence <ConfidenceGauge value={r.overallConfidence} />
              </span>
              <span>
                Fit <span className="tnum font-medium">{fitDisplay(r.thesisFit)}</span>
              </span>
            </div>
            {r.majorEvidenceGap ? <p className="mt-1.5 text-[11px] text-[var(--fg-muted)]">Gap: {r.majorEvidenceGap}</p> : null}
            <div className="mt-2">
              <RadarButton entityId={r.entityId} compact />
            </div>
          </li>
        ))}
      </ul>

      {filtered.length === 0 ? (
        <div className="card mt-2 rounded-md p-4 text-[13px] text-[var(--fg-muted)]">
          No companies match the active filters.{" "}
          <button type="button" onClick={clearAll} className="underline">
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}

function colSort(sort: { key: SortKey; dir: "asc" | "desc" } | null, key: SortKey): "none" | "ascending" | "descending" {
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
