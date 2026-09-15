import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { SourcingView } from "@/components/sourcing/SourcingView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sourcing Engine - Digital Asset Venture Intelligence" };

export default function SourcingEnginePage() {
  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHero
        title="Sourcing Engine"
        lede={
          <>
            Run discovery directly against the configured public-source feeds, no credential
            required, or switch to X Discovery with your own X API bearer token. Sourcing results
            are discovery candidates, not investment recommendations or screened companies.
          </>
        }
        meta={
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-[var(--fg-faint)]">
            <li>Public Sourcing runs the configured public-source discovery feeds without an API credential.</li>
            <li>X Sourcing queries X using the user&rsquo;s own API credential.</li>
            <li>
              Discovering something already researched? See the{" "}
              <Link href="/worklist">Sourcing Worklist</Link>.
            </li>
          </ul>
        }
      />
      <SourcingView />
    </div>
  );
}
