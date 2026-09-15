import type { Metadata } from "next";
import { getSourcingWorklist, getReadModelMeta } from "@/lib/digital-asset-product";
import { PageHero } from "@/components/PageHero";
import { RadarView } from "@/components/radar/RadarView";
import { dateOnly } from "@/lib/ui/format";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Follow-On Radar - Digital Asset Venture Intelligence" };

export default function RadarPage() {
  const rows = getSourcingWorklist();
  const meta = getReadModelMeta();

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHero
        title="Follow-On Radar"
        lede={
          <>
            A monitoring list you build from the researched universe, kept only in this browser.
            Adding a company here means you want to track it as if it were a portfolio or priority
            follow-on name. It is not a record of actual portfolio holdings, and nothing on this
            page is an investment recommendation.
          </>
        }
      />

      <RadarView rows={rows} />

      <p className="mt-6 t-meta text-[var(--fg-faint)]">
        Research corpus generated {dateOnly(meta.generatedAt)}; analytics computed on read (as-of{" "}
        {meta.asOf}). Radar membership is local browser state and is never uploaded or shared.
      </p>
    </div>
  );
}
