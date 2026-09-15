"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";

export interface DirectoryEntry {
  companyId: string;
  name: string;
  aliases: string[];
  description: string | null;
  sector: string | null;
}

/**
 * V1 search: company resolution over name / aliases / description / sector.
 * The corpus is 39 companies, so this is a direct token filter - no index
 * infrastructure needed. Broader EvidenceClaim / person / source search is
 * deferred to the phase that builds the cross-company Evidence and Sources
 * views to land results in.
 */
function score(entry: DirectoryEntry, q: string): number {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;
  const name = entry.name.toLowerCase();
  const aliases = entry.aliases.join(" ").toLowerCase();
  const desc = (entry.description ?? "").toLowerCase();
  const sector = (entry.sector ?? "").toLowerCase();
  let s = 0;
  for (const t of terms) {
    if (name.startsWith(t)) s += 10;
    else if (name.includes(t)) s += 6;
    else if (aliases.includes(t)) s += 5;
    else if (sector.includes(t)) s += 2;
    else if (desc.includes(t)) s += 1;
    else return 0;
  }
  return s;
}

export function CompanySearch({
  companies,
  id = "company-search",
}: {
  companies: DirectoryEntry[];
  /** Unique per rendered instance - AppShell mounts one for mobile and one for desktop. */
  id?: string;
}) {
  const router = useRouter();
  const listboxId = `${id}-results`;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (!q.trim()) return [];
    return companies
      .map((c) => ({ c, s: score(c, q) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name))
      .slice(0, 8)
      .map((r) => r.c);
  }, [companies, q]);

  function go(entry: DirectoryEntry | undefined) {
    if (!entry) return;
    setOpen(false);
    setQ("");
    router.push(`/companies/${entry.companyId}`);
  }

  return (
    <div className="relative w-full md:max-w-[232px]">
      <label htmlFor={id} className="sr-only">
        Search companies by name or sector
      </label>
      <div className="search-field">
        <Icon name="search" className="shrink-0 text-[var(--fg-faint)]" />
        <input
          id={id}
          ref={inputRef}
          type="search"
          autoComplete="off"
          value={q}
          placeholder="Search companies"
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={
            open && results[active] ? `${id}-opt-${results[active].companyId}` : undefined
          }
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(results[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
      </div>
      {open && results.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="card--raised absolute z-30 mt-1 w-full overflow-hidden py-1"
        >
          {results.map((r, i) => (
            <li
              key={r.companyId}
              id={`${id}-opt-${r.companyId}`}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-3 py-1.5 text-[13px] ${
                i === active ? "bg-[var(--accent-weak)]" : ""
              }`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                go(r);
              }}
            >
              <span className="font-medium">{r.name}</span>
              {r.sector ? (
                <span className="ml-2 text-[12px] text-[var(--fg-faint)]">{r.sector}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {open && q.trim() && results.length === 0 ? (
        <div className="card--raised absolute z-30 mt-1 w-full px-3 py-2 text-[12px] text-[var(--fg-muted)]">
          No company matches &ldquo;{q}&rdquo;.
        </div>
      ) : null}
    </div>
  );
}
