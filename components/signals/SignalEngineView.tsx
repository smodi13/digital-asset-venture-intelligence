"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SignalIntelligenceRow } from "@/lib/digital-asset-product";
import { SignalDirection, EventStatusMark, Icon } from "@/components/ui";
import { dateOnly, titleCase } from "@/lib/ui/format";

const RECENT_WINDOW_DAYS = 180;

export function SignalEngineView({ rows }: { rows: SignalIntelligenceRow[] }) {
  const [fType, setFType] = useState("all");
  const [fCategory, setFCategory] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fSubject, setFSubject] = useState("all");

  const types = useMemo(() => [...new Set(rows.map((r) => r.signalType))].sort(), [rows]);
  const categories = useMemo(() => [...new Set(rows.map((r) => r.signalCategory))].sort(), [rows]);
  const statuses = useMemo(() => [...new Set(rows.map((r) => r.eventStatus))].sort(), [rows]);
  const subjects = useMemo(() => [...new Set(rows.map((r) => r.subjectType))].sort(), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (fType !== "all" && r.signalType !== fType) return false;
        if (fCategory !== "all" && r.signalCategory !== fCategory) return false;
        if (fStatus !== "all" && r.eventStatus !== fStatus) return false;
        if (fSubject !== "all" && r.subjectType !== fSubject) return false;
        return true;
      }),
    [rows, fType, fCategory, fStatus, fSubject],
  );

  const filtersActive = fType !== "all" || fCategory !== "all" || fStatus !== "all" || fSubject !== "all";
  function clearAll() {
    setFType("all");
    setFCategory("all");
    setFStatus("all");
    setFSubject("all");
  }

  const { recent, older } = useMemo(() => {
    const now = new Date().getTime();
    const isRecent = (r: SignalIntelligenceRow) => {
      const d = r.eventDate ?? r.publicationDate;
      if (!d) return false;
      return now - new Date(d).getTime() <= RECENT_WINDOW_DAYS * 86_400_000;
    };
    return { recent: filtered.filter(isRecent), older: filtered.filter((r) => !isRecent(r)) };
  }, [filtered]);

  return (
    <div>
      <div className="mb-4 border-y border-[var(--line)] py-4">
        <div className="filter-grid" role="group" aria-label="Signal Engine filters">
          <Field label="Signal type">
            <select value={fType} onChange={(e) => setFType(e.target.value)}>
              <option value="all">All types</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </select>
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
          <Field label="Subject type">
            <select value={fSubject} onChange={(e) => setFSubject(e.target.value)}>
              <option value="all">All subjects</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Event status">
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="all">All</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
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

      <p className="mb-4 t-meta text-[var(--fg-faint)]">
        {filtered.length} of {rows.length} signal events. Chronological order, most recent first - not an
        investment ranking. More signals does not mean a better investment.
      </p>

      {filtered.length === 0 ? (
        <div className="card rounded-md p-4 text-[13px] text-[var(--fg-muted)]">
          No signal events match the active filters.{" "}
          <button type="button" onClick={clearAll} className="underline">
            Clear all
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {recent.length > 0 ? <SignalGroup title="Recent" hint={`Within the last ${RECENT_WINDOW_DAYS} days`} rows={recent} /> : null}
          {older.length > 0 ? <SignalGroup title="Older" rows={older} /> : null}
        </div>
      )}
    </div>
  );
}

function SignalGroup({ title, hint, rows }: { title: string; hint?: string; rows: SignalIntelligenceRow[] }) {
  return (
    <section>
      <div className="section-h">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-[var(--fg-muted)]">{title}</h2>
        {hint ? <span className="t-meta text-[var(--fg-faint)]">{hint}</span> : null}
      </div>
      <ul className="mt-2 divide-y divide-[var(--line)] border-t border-[var(--line)]">
        {rows.map((r) => (
          <li key={r.eventId} className="flex flex-col gap-1.5 py-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/companies/${r.slug}`} className="font-semibold text-[var(--fg)]">
                  {r.companyName}
                </Link>
                <span className="t-meta text-[var(--fg-faint)]">{titleCase(r.subjectType)}</span>
              </div>
              <p className="mt-1 t-body text-[var(--fg-muted)]">{r.evidenceSummary}</p>
              {r.unconfirmedNote ? <p className="mt-1 t-meta text-[var(--warn)]">{r.unconfirmedNote}</p> : null}
            </div>
            <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
              <span className="tnum t-meta text-[var(--fg-faint)]">{dateOnly(r.eventDate ?? r.publicationDate)}</span>
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="chip chip--neutral">{titleCase(r.signalType)}</span>
                <SignalDirection direction={r.signalDirection} />
                <EventStatusMark status={r.eventStatus} />
              </span>
              {r.sourceUrl ? (
                <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="t-meta">
                  Source <Icon name="chevron" className="text-[9px]" />
                </a>
              ) : null}
            </div>
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
