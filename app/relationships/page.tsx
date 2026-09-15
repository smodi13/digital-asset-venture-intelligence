import type { Metadata } from "next";
import Link from "next/link";
import { getRelationshipIntelligence, getReadModelMeta } from "@/lib/digital-asset-product";
import { PageHero } from "@/components/PageHero";
import { RelationshipIntelligenceView } from "@/components/relationships/RelationshipIntelligenceView";
import { dateOnly } from "@/lib/ui/format";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Relationship Intelligence - Digital Asset Venture Intelligence" };

export default function RelationshipsPage() {
  const data = getRelationshipIntelligence();
  const meta = getReadModelMeta();

  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHero
        title="Relationship Intelligence"
        lede={
          <>
            Who is associated with which researched company, and what role they hold, drawn only
            from structured person records already in the frozen research corpus. No profile was
            browsed and no relationship was inferred to build this page.
          </>
        }
        meta={
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[var(--fg-faint)]">
            <li>{data.totalPeople} people across {data.companiesWithPeople} companies.</li>
          </ul>
        }
      />

      <RelationshipIntelligenceView data={data} />

      <p className="mt-8 t-meta text-[var(--fg-faint)]">
        Research corpus generated {dateOnly(meta.generatedAt)}; analytics computed on read (as-of{" "}
        {meta.asOf}). See <Link href="/methodology">methodology</Link>.
      </p>
    </div>
  );
}
