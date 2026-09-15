"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SourceIntelligenceRow } from "@/lib/digital-asset-product";
import { Icon } from "@/components/ui";
import { dateOnly, titleCase } from "@/lib/ui/format";

export function SourceIntelligenceView({ rows }: { rows: SourceIntelligenceRow[] }) {
  const [fType, setFType] = useState("all");
  const [fIndependence, setFIndependence] = useState<"all" | "independent" | "not_independent">("all");
  const [fRole, setFRole] = useState<string>("all");
  const [q, setQ] = useState("");

  const types = useMemo(() => [...new Set(rows.map((r) => r.sourceType))].sort(), [rows]);
  const roles = useMemo(
    () => [...new Set(rows.map((r) => r.supportRole).filter((v): v is NonNullable<typeof v> => v !== null))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fType !== "all" && r.sourceType !== fType) return false;
      if (fIndependence === "independent" && !r.isIndependent) return false;
      if (fIndependence === "not_independent" && r.isIndependent) return false;
      if (fRole !== "all" && r.supportRole !== fRole) return false;
      if (needle && !`${r.title} ${r.publisher} ${r.companyName}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, fType, fIndependence, fRole, q]);

  const filtersActive = fType !== "all" || fIndependence !== "all" || fRole !== "all" || q.trim() !== "";
  function clearAll() {
    setFType("all");
    setFIndependence("all");
    setFRole("all");
    setQ("");
  }

  return (
    <div>
      <div className="mb-4 border-y border-[var(--line)] py-4">
        <div className="filter-grid" role="group" aria-label="Source Intelligence filters">
          <Field label="Search">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Source, publisher, or company"
            />
          </Field>
          <Field label="Source class">
            <select value={fType} onChange={(e) => setFType(e.target.value)}>
              <option value="all">All classes</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Independence">
            <select value={fIndependence} onChange={(e) => setFIndependence(e.target.value as typeof fIndependence)}>
              <option value="all">All</option>
              <option value="independent">Independent</option>
              <option value="not_independent">Not independent</option>
            </select>
          </Field>
          <Field label="Support role">
            <select value={fRole} onChange={(e) => setFRole(e.target.value)}>
              <option value="all">All roles</option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {titleCase(r)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {filtersActive && (
          <button type="button" onClick={clearAll} className="btn-quiet mt-3">
            Clear all filters
          </button>
        )}
      </div>

      <p className="mb-3 t-meta text-[var(--fg-faint)]">
        {filtered.length} of {rows.length} source citations, ordered by availability date. Not a reliability
        ranking - repeated company assertions are never shown as independent corroboration.
      </p>

      <div className="hidden overflow-x-auto lg:block">
        <table className="dtable">
          <caption className="sr-only">Source Intelligence. {filtered.length} source citations.</caption>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Company</th>
              <th scope="col">Class</th>
              <th scope="col">Origin</th>
              <th scope="col">Support role</th>
              <th scope="col" className="num">Claims</th>
              <th scope="col">Available</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={`${r.entityId}:${r.sourceId}`}>
                <td className="max-w-[260px]">
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium">
                      {r.title}
                    </a>
                  ) : (
                    <span className="font-medium">{r.title}</span>
                  )}
                  <span className="block t-meta text-[var(--fg-faint)]">{r.publisher}</span>
                </td>
                <td className="max-w-[160px]">
                  <Link href={`/companies/${r.slug}`} className="text-[12px] font-medium">
                    {r.companyName}
                  </Link>
                </td>
                <td className="text-[12px] text-[var(--fg-muted)]">{titleCase(r.sourceType)}</td>
                <td className="text-[12px] text-[var(--fg-muted)]">
                  {r.isIndependent ? (
                    <span className="chip chip--pos">
                      <Icon name="check" />
                      Independent
                    </span>
                  ) : (
                    <span className="chip chip--muted">
                      <Icon name="dash" />
                      First-party
                    </span>
                  )}
                </td>
                <td className="text-[12px] text-[var(--fg-muted)]">{r.supportRole ? titleCase(r.supportRole) : "Unclassified"}</td>
                <td className="num tnum">{r.claimCount}</td>
                <td className="tnum text-[12px] text-[var(--fg-muted)]">{dateOnly(r.availabilityDate ?? r.publishedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col border-t border-[var(--line)] lg:hidden">
        {filtered.map((r) => (
          <li key={`${r.entityId}:${r.sourceId}`} className="border-b border-[var(--line)] py-3.5">
            <div className="flex items-start justify-between gap-2">
              {r.url ? (
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium">
                  {r.title}
                </a>
              ) : (
                <span className="font-medium">{r.title}</span>
              )}
              {r.isIndependent ? (
                <span className="chip chip--pos shrink-0">Independent</span>
              ) : (
                <span className="chip chip--muted shrink-0">First-party</span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-[var(--fg-faint)]">
              {r.publisher} · {titleCase(r.sourceType)}
            </p>
            <p className="mt-1.5 text-[12px] text-[var(--fg-muted)]">
              <Link href={`/companies/${r.slug}`}>{r.companyName}</Link>
              {r.supportRole ? ` · ${titleCase(r.supportRole)}` : ""} · {r.claimCount} claim
              {r.claimCount === 1 ? "" : "s"}
            </p>
          </li>
        ))}
      </ul>

      {filtered.length === 0 ? (
        <div className="card mt-2 rounded-md p-4 text-[13px] text-[var(--fg-muted)]">
          No sources match the active filters.{" "}
          <button type="button" onClick={clearAll} className="underline">
            Clear all
          </button>
        </div>
      ) : null}
    </div>
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
