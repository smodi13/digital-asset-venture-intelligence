"use client";

import Link from "next/link";
import type { SourcingWorklistRow } from "@/lib/digital-asset-product";
import { useRadar } from "@/components/radar/useRadar";

/** Renders nothing when the local radar is empty - Partner Home never shows fabricated holdings. */
export function PartnerHomeRadarSummary({ rows }: { rows: SourcingWorklistRow[] }) {
  const { hydrated, ids } = useRadar();
  if (!hydrated || ids.length === 0) return null;

  const onRadar = rows.filter((r) => ids.includes(r.entityId));

  return (
    <section className="mb-10">
      <div className="section-h">
        <h2>Your Follow-On Radar</h2>
        <div className="t-meta shrink-0 text-[var(--fg-muted)]">
          <Link href="/radar">Open Radar</Link>
        </div>
      </div>
      <p className="t-meta mb-3 text-[var(--fg-muted)]">
        A monitoring list you control in this browser, not a record of actual portfolio holdings.
      </p>
      <ul className="flex flex-wrap gap-2">
        {onRadar.map((r) => (
          <li key={r.entityId}>
            <Link href={`/companies/${r.slug}`} className="chip chip--muted no-underline">
              {r.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
