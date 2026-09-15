"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RelationshipIntelligenceData } from "@/lib/digital-asset-product";
import { titleCase } from "@/lib/ui/format";

export function RelationshipIntelligenceView({ data }: { data: RelationshipIntelligenceData }) {
  const [fCategory, setFCategory] = useState("all");
  const [fRole, setFRole] = useState<"all" | "founder" | "non_founder">("all");
  const [search, setSearch] = useState("");

  const categories = useMemo(
    () => [...new Set(data.people.map((p) => p.category).filter(Boolean))].sort() as string[],
    [data],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.people.filter((p) => {
      if (fCategory !== "all" && p.category !== fCategory) return false;
      if (fRole === "founder" && !p.isFounder) return false;
      if (fRole === "non_founder" && p.isFounder) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.companyName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, fCategory, fRole, search]);

  const filtersActive = fCategory !== "all" || fRole !== "all" || search.trim() !== "";
  function clearAll() {
    setFCategory("all");
    setFRole("all");
    setSearch("");
  }

  return (
    <div>
      <section className="mb-8 border-b border-[var(--line)] pb-6">
        <h2 className="text-[16px] font-semibold">Repeated connections</h2>
        <p className="mt-1.5 t-meta text-[var(--fg-muted)]">
          People whose name is recorded against more than one company in the researched universe.
          This is a name match within the frozen corpus, never an inferred professional or social
          relationship.
        </p>
        {data.repeatConnections.length === 0 ? (
          <p className="mt-3 t-meta text-[var(--fg-faint)]">
            No person is currently recorded against more than one researched company.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {data.repeatConnections.map((rc) => (
              <li key={rc.normalizedName} className="t-meta">
                <span className="font-medium text-[var(--fg)]">{rc.name}</span>
                {" - "}
                {rc.companies.map((c, i) => (
                  <span key={c.slug}>
                    {i > 0 ? ", " : ""}
                    <Link href={`/companies/${c.slug}`}>{c.companyName}</Link>
                    {c.role ? ` (${c.role})` : ""}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mb-4 border-b border-[var(--line)] pb-4">
        <div className="filter-grid" role="group" aria-label="Relationship Intelligence filters">
          <Field label="Person or company search">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people or companies"
            />
          </Field>
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
          <Field label="Role">
            <select value={fRole} onChange={(e) => setFRole(e.target.value as typeof fRole)}>
              <option value="all">All</option>
              <option value="founder">Founders</option>
              <option value="non_founder">Non-founders</option>
            </select>
          </Field>
        </div>
        {filtersActive ? (
          <button type="button" onClick={clearAll} className="btn-quiet mt-3">
            Clear all filters
          </button>
        ) : null}
      </div>

      <p className="mb-3 t-meta text-[var(--fg-muted)]">
        {filtered.length} of {data.totalPeople} people across {data.companiesWithPeople} companies. Default
        alphabetical order by name.
      </p>

      <div className="hidden overflow-x-auto lg:block">
        <table className="dtable">
          <caption className="sr-only">Relationship directory. {filtered.length} people.</caption>
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Role</th>
              <th scope="col" className="group-start">Company</th>
              <th scope="col">Category</th>
              <th scope="col">Prior companies</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.personId}>
                <td className="max-w-[180px]">
                  <span className="font-medium">{p.name}</span>
                  {p.isFounder ? <span className="ml-2 chip chip--neutral text-[10px]">Founder</span> : null}
                </td>
                <td className="max-w-[220px] text-[12px] text-[var(--fg-muted)]">{p.currentRole ?? "Role unknown"}</td>
                <td className="group-start">
                  <Link href={`/companies/${p.slug}`} className="font-medium">
                    {p.companyName}
                  </Link>
                </td>
                <td className="max-w-[160px] text-[12px] text-[var(--fg-muted)]">
                  {p.category ? titleCase(p.category) : "Uncategorized"}
                </td>
                <td className="max-w-[220px] text-[12px] text-[var(--fg-muted)]">
                  {p.priorCompanies.length > 0 ? p.priorCompanies.join(", ") : "None on file"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col border-t border-[var(--line)] lg:hidden">
        {filtered.map((p) => (
          <li key={p.personId} className="border-b border-[var(--line)] py-3.5">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">
                {p.name}
                {p.isFounder ? <span className="ml-2 chip chip--neutral text-[10px]">Founder</span> : null}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[var(--fg-faint)]">{p.currentRole ?? "Role unknown"}</p>
            <p className="mt-1.5 text-[12px]">
              <Link href={`/companies/${p.slug}`} className="font-medium">
                {p.companyName}
              </Link>
              <span className="ml-2 text-[var(--fg-faint)]">{p.category ? titleCase(p.category) : "Uncategorized"}</span>
            </p>
            {p.priorCompanies.length > 0 ? (
              <p className="mt-1 text-[11px] text-[var(--fg-muted)]">Prior: {p.priorCompanies.join(", ")}</p>
            ) : null}
          </li>
        ))}
      </ul>

      {filtered.length === 0 ? (
        <div className="card mt-2 rounded-md p-4 text-[13px] text-[var(--fg-muted)]">
          No people match the active filters.{" "}
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
