import type { Metadata } from "next";
import Link from "next/link";
import { getSignalIntelligence, getReadModelMeta } from "@/lib/digital-asset-product";
import { PageHero } from "@/components/PageHero";
import { SignalEngineView } from "@/components/signals/SignalEngineView";
import { dateOnly } from "@/lib/ui/format";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Signal Engine - Digital Asset Venture Intelligence" };

export default function SignalEnginePage() {
  const rows = getSignalIntelligence();
  const meta = getReadModelMeta();

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHero
        title="Signal Engine"
        lede={
          <>
            Dated events across the researched universe: what changed, for which company, and how
            well confirmed it is. This is a chronological feed, not an investment score - more
            signals does not mean a better investment.
          </>
        }
        meta={
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[var(--fg-faint)]">
            <li>Signals are frozen v7 research corpus events, not live monitoring.</li>
            <li>
              A <span className="mono">reported_unconfirmed</span> event is never shown as
              established. <Link href="/methodology">How it works</Link>
            </li>
          </ul>
        }
      />

      <SignalEngineView rows={rows} />

      <p className="mt-6 t-meta text-[var(--fg-faint)]">
        Research corpus generated {dateOnly(meta.generatedAt)}. {meta.companyCount} companies in the
        research universe. See <Link href="/methodology#temporal">temporal signals</Link>.
      </p>
    </div>
  );
}
