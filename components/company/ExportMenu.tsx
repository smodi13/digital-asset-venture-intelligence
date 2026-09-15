"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui";

/**
 * Restrained analyst export control for Company Detail. A small menu, not a CTA:
 *   - Screening brief  -> print-optimised stand-alone brief route (Save as PDF)
 *   - Evidence CSV     -> structured per-company evidence table download
 */
export function ExportMenu({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="inline-flex items-center gap-1 rounded border border-[var(--line-strong)] px-2 py-1 text-[12px] hover:bg-[var(--surface-2)]"
      >
        Export
        <Icon name="chevron" className="text-[10px] rotate-90" />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="card--raised absolute left-0 z-30 mt-1 w-52 p-1 text-[12px] sm:left-auto sm:right-0"
        >
          <Link
            href={`/companies/${companyId}/brief`}
            role="menuitem"
            className="block rounded px-2 py-1.5 no-underline hover:bg-[var(--surface-2)]"
            onClick={() => setOpen(false)}
          >
            Screening brief
            <span className="block text-[11px] text-[var(--fg-faint)]">Stand-alone · print / save as PDF</span>
          </Link>
          <a
            href={`/companies/${companyId}/export/evidence`}
            role="menuitem"
            className="block rounded px-2 py-1.5 no-underline hover:bg-[var(--surface-2)]"
            onClick={() => setOpen(false)}
          >
            Evidence CSV
            <span className="block text-[11px] text-[var(--fg-faint)]">One row per claim · spreadsheet-safe</span>
          </a>
        </div>
      ) : null}
    </div>
  );
}
