import type { Metadata } from "next";
import Link from "next/link";
import { getSourcingWorklist } from "@/lib/digital-asset-product";
import { PageHero } from "@/components/PageHero";
import { Reveal } from "@/components/Reveal";
import { ProductDisplayStateBadge } from "@/components/ui";
import { RadarButton } from "@/components/radar/RadarButton";
import { fitDisplay, pct, titleCase } from "@/lib/ui/format";

export const dynamic = "force-static";

export const metadata: Metadata = { title: "Companies - Digital Asset Venture Intelligence" };

export default function CompaniesPage() {
  const companies = [...getSourcingWorklist()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHero
        title="Companies"
        lede={
          <>
            The complete researched digital-asset universe, A to Z. This is a stable directory,
            not the working queue. For filtering and sorting, use the{" "}
            <Link href="/worklist">Sourcing Worklist</Link>.
          </>
        }
      />

      <Reveal className="overflow-x-auto">
        <table className="dtable">
          <caption className="sr-only">All {companies.length} researched companies, alphabetical.</caption>
          <thead>
            <tr>
              <th scope="col">Company</th>
              <th scope="col">Category</th>
              <th scope="col">Entity type</th>
              <th scope="col">Display state</th>
              <th scope="col">Coverage</th>
              <th scope="col">Thesis Fit</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.entityId}>
                <td>
                  <Link href={`/companies/${c.slug}`} className="font-medium">
                    {c.name}
                  </Link>
                </td>
                <td className="max-w-[220px] text-[12px] text-[var(--fg-muted)]">
                  {c.category ? titleCase(c.category) : "Uncategorized"}
                </td>
                <td className="text-[12px] text-[var(--fg-muted)]">{titleCase(c.entityType)}</td>
                <td>
                  <ProductDisplayStateBadge state={c.displayState} />
                </td>
                <td className="tnum text-[12px] text-[var(--fg-muted)]">{pct(c.overallCoverage)}</td>
                <td className="tnum text-[12px]">{fitDisplay(c.thesisFit)}</td>
                <td>
                  <RadarButton entityId={c.entityId} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>
    </div>
  );
}
