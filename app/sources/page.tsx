import type { Metadata } from "next";
import Link from "next/link";
import { getSourceIntelligence, getReadModelMeta } from "@/lib/digital-asset-product";
import { PageHero } from "@/components/PageHero";
import { SourceIntelligenceView } from "@/components/sources/SourceIntelligenceView";
import { dateOnly } from "@/lib/ui/format";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Source Intelligence - Digital Asset Venture Intelligence" };

export default function SourceIntelligencePage() {
  const rows = getSourceIntelligence();
  const meta = getReadModelMeta();

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHero
        title="Source Intelligence"
        lede={
          <>
            The provenance layer behind every analytical value in the product: what sources are in
            the system, whether they are first-party or independent, and which claims depend on
            them. A repeated company assertion is never shown as independent corroboration.
          </>
        }
        meta={
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[var(--fg-faint)]">
            <li>Sources are frozen v7 research corpus records, not live browsing.</li>
            <li>
              Independence and support role reflect the frozen classification.{" "}
              <Link href="/methodology#provenance">How it works</Link>
            </li>
          </ul>
        }
      />

      <SourceIntelligenceView rows={rows} />

      <p className="mt-6 t-meta text-[var(--fg-faint)]">
        Research corpus generated {dateOnly(meta.generatedAt)}. {meta.companyCount} companies in the
        research universe.
      </p>
    </div>
  );
}
