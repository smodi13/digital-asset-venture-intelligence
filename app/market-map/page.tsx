import type { Metadata } from "next";
import Link from "next/link";
import { getMarketMap, getReadModelMeta } from "@/lib/digital-asset-product";
import { PageHero } from "@/components/PageHero";
import { MarketMapView } from "@/components/market-map/MarketMapView";
import { dateOnly } from "@/lib/ui/format";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Market Map - Digital Asset Venture Intelligence" };

export default function MarketMapPage() {
  const data = getMarketMap();
  const meta = getReadModelMeta();

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHero
        title="Market Map"
        lede={
          <>
            The 44-company researched universe laid out across the eleven canonical digital-asset
            categories: what is represented, what is thin, and what to open next. This is a map of
            research coverage, not a market-size estimate, and it makes no claim about total
            addressable market.
          </>
        }
        meta={
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[var(--fg-faint)]">
            <li>{data.totalCompanies} companies across 11 canonical categories.</li>
            <li>
              Thesis Fit appears as analytical context only.{" "}
              <Link href="/worklist">The Sourcing Worklist</Link> is the working queue.
            </li>
          </ul>
        }
      />

      <MarketMapView data={data} />

      <p className="mt-8 t-meta text-[var(--fg-faint)]">
        Research corpus generated {dateOnly(meta.generatedAt)}; analytics computed on read (as-of{" "}
        {meta.asOf}). See <Link href="/methodology">methodology</Link>.
      </p>
    </div>
  );
}
