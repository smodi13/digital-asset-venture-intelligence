"use client";

import Link from "next/link";

/** Print / Save as PDF trigger for the Screening Brief. Hidden in the printed output. */
export function BriefActions({ companyId, csvHref }: { companyId: string; csvHref: string }) {
  return (
    <div className="brief-print-actions">
      <nav style={{ fontSize: 12, marginBottom: 8 }}>
        <Link href={`/companies/${companyId}`}>← Back to company detail</Link>
      </nav>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded border border-[var(--line-strong)] px-3 py-1.5 text-[13px] font-medium hover:bg-[var(--surface-2)]"
        >
          Print / Save as PDF
        </button>
        <a
          href={csvHref}
          className="rounded border border-[var(--line-strong)] px-3 py-1.5 text-[13px] hover:bg-[var(--surface-2)]"
        >
          Evidence CSV
        </a>
      </div>
    </div>
  );
}
