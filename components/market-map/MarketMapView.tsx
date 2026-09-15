"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MarketMapCompanyRow, MarketMapData } from "@/lib/digital-asset-product";
import { CoverageMeter, ConfidenceGauge, ProductDisplayStateBadge, Icon } from "@/components/ui";
import { fitDisplay, pct, titleCase } from "@/lib/ui/format";

type Filters = {
  entityType: string;
  assetType: string;
  lifecycle: string;
  displayState: "all" | "PROVISIONAL" | "INSUFFICIENT_EVIDENCE";
  institutional: "all" | "yes" | "no" | "unknown";
};

const EMPTY_FILTERS: Filters = {
  entityType: "all",
  assetType: "all",
  lifecycle: "all",
  displayState: "all",
  institutional: "all",
};

function matches(c: MarketMapCompanyRow, f: Filters): boolean {
  if (f.entityType !== "all" && c.entityType !== f.entityType) return false;
  if (f.assetType !== "all" && c.assetType !== f.assetType) return false;
  if (f.lifecycle !== "all" && c.digitalAssetLifecycle !== f.lifecycle) return false;
  if (f.displayState !== "all" && c.displayState !== f.displayState) return false;
  if (f.institutional === "yes" && c.institutionalOrientation !== true) return false;
  if (f.institutional === "no" && c.institutionalOrientation !== false) return false;
  if (f.institutional === "unknown" && c.institutionalOrientation !== null) return false;
  return true;
}

export function MarketMapView({ data }: { data: MarketMapData }) {
  const [category, setCategory] = useState("all");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const allCompanies = useMemo(
    () => data.categories.flatMap((g) => g.companies).concat(data.uncategorized),
    [data],
  );
  const entityTypes = useMemo(() => [...new Set(allCompanies.map((c) => c.entityType))].sort(), [allCompanies]);
  const assetTypes = useMemo(() => [...new Set(allCompanies.map((c) => c.assetType))].sort(), [allCompanies]);
  const lifecycles = useMemo(
    () => [...new Set(allCompanies.map((c) => c.digitalAssetLifecycle).filter(Boolean))].sort() as string[],
    [allCompanies],
  );

  const lanes = useMemo(() => {
    const base =
      category === "all"
        ? data.categories
        : data.categories.filter((g) => g.category === category);
    return base
      .map((g) => ({ ...g, companies: g.companies.filter((c) => matches(c, filters)) }))
      .filter((g) => g.companies.length > 0 || category !== "all");
  }, [data, category, filters]);

  const uncategorizedFiltered = useMemo(
    () => (category === "all" ? data.uncategorized.filter((c) => matches(c, filters)) : []),
    [data, category, filters],
  );

  const filtersActive =
    filters.entityType !== "all" ||
    filters.assetType !== "all" ||
    filters.lifecycle !== "all" ||
    filters.displayState !== "all" ||
    filters.institutional !== "all" ||
    category !== "all";

  function clearAll() {
    setCategory("all");
    setFilters(EMPTY_FILTERS);
  }

  const visibleCompanyCount = lanes.reduce((n, g) => n + g.companies.length, 0) + uncategorizedFiltered.length;

  return (
    <div>
      <div className="mb-4 border-y border-[var(--line)] py-4">
        <div className="filter-grid" role="group" aria-label="Market Map filters">
          <Field label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {data.categories.map((g) => (
                <option key={g.category} value={g.category}>
                  {titleCase(g.category)} ({g.companyCount})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Entity type">
            <select value={filters.entityType} onChange={(e) => setFilters((f) => ({ ...f, entityType: e.target.value }))}>
              <option value="all">All</option>
              {entityTypes.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Asset type">
            <select value={filters.assetType} onChange={(e) => setFilters((f) => ({ ...f, assetType: e.target.value }))}>
              <option value="all">All</option>
              {assetTypes.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Lifecycle">
            <select value={filters.lifecycle} onChange={(e) => setFilters((f) => ({ ...f, lifecycle: e.target.value }))}>
              <option value="all">All</option>
              {lifecycles.map((l) => (
                <option key={l} value={l}>
                  {titleCase(l)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Display state">
            <select
              value={filters.displayState}
              onChange={(e) => setFilters((f) => ({ ...f, displayState: e.target.value as Filters["displayState"] }))}
            >
              <option value="all">All</option>
              <option value="PROVISIONAL">Provisional</option>
              <option value="INSUFFICIENT_EVIDENCE">Insufficient evidence</option>
            </select>
          </Field>
          <Field label="Institutional orientation">
            <select
              value={filters.institutional}
              onChange={(e) => setFilters((f) => ({ ...f, institutional: e.target.value as Filters["institutional"] }))}
            >
              <option value="all">All</option>
              <option value="yes">Institutional</option>
              <option value="no">Not institutional</option>
              <option value="unknown">Unknown</option>
            </select>
          </Field>
        </div>
        {filtersActive ? (
          <button type="button" onClick={clearAll} className="btn-quiet mt-3">
            Clear all filters
          </button>
        ) : null}
      </div>

      <p className="mb-5 t-meta text-[var(--fg-muted)]">
        {visibleCompanyCount} of {data.totalCompanies} companies shown across {lanes.filter((g) => g.companies.length > 0).length}{" "}
        of 11 canonical categories.
      </p>

      <nav aria-label="Category index" className="mb-8 flex flex-wrap gap-2 border-b border-[var(--line)] pb-6">
        {data.categories
          .filter((g) => g.companyCount > 0)
          .map((g) => (
            <a key={g.category} href={`#cat-${g.category}`} className="chip chip--muted no-underline">
              {titleCase(g.category)} ({g.companyCount})
            </a>
          ))}
      </nav>

      <div className="flex flex-col gap-10">
        {lanes.map((g) => (
          <CategoryLane key={g.category} group={g} />
        ))}
        {uncategorizedFiltered.length > 0 ? (
          <UncategorizedLane companies={uncategorizedFiltered} />
        ) : null}
      </div>

      {visibleCompanyCount === 0 ? (
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

function CategoryLane({ group: g }: { group: MarketMapData["categories"][number] }) {
  return (
    <section id={`cat-${g.category}`} className="scroll-mt-20 border-t border-[var(--line)] pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[16px] font-semibold">{titleCase(g.category)}</h2>
        <span className="t-meta text-[var(--fg-faint)]">
          {g.companyCount} compan{g.companyCount === 1 ? "y" : "ies"} in the researched universe
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 t-meta text-[var(--fg-muted)]">
        <span>Avg. coverage {pct(g.averageCoverage)}</span>
        <span>{g.provisionalCount} provisional</span>
        <span>{g.insufficientEvidenceCount} insufficient evidence</span>
        {g.entityTypeCounts.length > 0 ? (
          <span>
            Entity types:{" "}
            {g.entityTypeCounts.map((v, i) => (
              <span key={v.value}>
                {i > 0 ? ", " : ""}
                {titleCase(v.value)} {v.count}
              </span>
            ))}
          </span>
        ) : null}
      </div>

      {g.companies.length === 0 ? (
        <p className="mt-3 t-meta text-[var(--fg-faint)]">No companies in this category match the active filters.</p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--line)] border-t border-[var(--line)]">
          {g.companies.map((c) => (
            <li key={c.entityId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2.5">
              <span className="min-w-0">
                <Link href={`/companies/${c.slug}`} className="font-medium">
                  {c.name}
                </Link>
                <span className="ml-2 t-meta text-[var(--fg-faint)]">
                  {titleCase(c.entityType)} · {titleCase(c.assetType)}
                  {c.digitalAssetLifecycle ? ` · ${titleCase(c.digitalAssetLifecycle)}` : ""}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-3">
                <CoverageMeter value={c.overallCoverage} compact />
                <ConfidenceGauge value={c.overallConfidence} />
                <ProductDisplayStateBadge state={c.displayState} />
                <span className="t-meta text-[var(--fg-faint)]" title="Thesis Fit, analytical context only - not a ranking">
                  Fit {fitDisplay(c.thesisFit)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function UncategorizedLane({ companies }: { companies: MarketMapCompanyRow[] }) {
  return (
    <section id="cat-uncategorized" className="scroll-mt-20 border-t border-[var(--line)] pt-6">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[16px] font-semibold">Uncategorized</h2>
        <Icon name="info" className="text-[var(--fg-faint)]" label="No category assigned in the frozen research corpus" />
      </div>
      <ul className="mt-4 divide-y divide-[var(--line)] border-t border-[var(--line)]">
        {companies.map((c) => (
          <li key={c.entityId} className="flex items-center justify-between gap-4 py-2.5">
            <Link href={`/companies/${c.slug}`} className="font-medium">
              {c.name}
            </Link>
            <ProductDisplayStateBadge state={c.displayState} />
          </li>
        ))}
      </ul>
    </section>
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
