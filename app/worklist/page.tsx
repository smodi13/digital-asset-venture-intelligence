import type { Metadata } from "next";
import Link from "next/link";
import { getSourcingWorklist, getReadModelMeta } from "@/lib/digital-asset-product";
import { PageHero } from "@/components/PageHero";
import { ProductWorklistView } from "@/components/worklist/ProductWorklistView";
import { dateOnly } from "@/lib/ui/format";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Sourcing Worklist - Digital Asset Venture Intelligence" };

export default function WorklistPage() {
  const rows = getSourcingWorklist();
  const meta = getReadModelMeta();

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHero
        title="Sourcing Worklist"
        lede={
          <>
            The researched digital-asset universe as a working queue. Every analytical value on
            this page traces to a specific evidence claim and source. It does not rank companies
            and does not recommend investments.
          </>
        }
        meta={
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[var(--fg-faint)]">
            <li>Screening scoring is deterministic. No language model produces a score.</li>
            <li>Human judgment (mandate, priority, the decision to invest) stays human.</li>
            <li>
              Mandate eligibility and rank eligibility are not assessed for any company.{" "}
              <Link href="/methodology">How it works</Link>
            </li>
          </ul>
        }
      />

      <ProductWorklistView rows={rows} />

      <p className="mt-6 t-meta text-[var(--fg-faint)]">
        Research corpus generated {dateOnly(meta.generatedAt)}; analytics computed on read (as-of{" "}
        {meta.asOf}). {meta.companyCount} companies in the research universe. Screening outputs are
        descriptive, not a performance claim. See <Link href="/methodology#limitations">limitations</Link>.
      </p>
    </div>
  );
}
