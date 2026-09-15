import Link from "next/link";
import type { ReactNode } from "react";
import { getCompanyDirectory, getReadModelMeta } from "@/lib/digital-asset-product";
import { CompanySearch } from "@/components/CompanySearch";
import { NavLinks } from "@/components/NavLinks";
import { dateOnly, titleCase } from "@/lib/ui/format";

export function AppShell({ children }: { children: ReactNode }) {
  const meta = getReadModelMeta();
  const companies = getCompanyDirectory().map((c) => ({
    companyId: c.slug,
    name: c.name,
    aliases: [],
    description: c.description,
    sector: c.category ? titleCase(c.category) : null,
  }));

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[264px_1fr] print:!block">
      {/* Sidebar (desktop) / top bar (mobile). Same ivory ground as the main
          area - separated only by a single hairline, never a different layer. */}
      <header className="border-b border-[var(--line)] bg-[var(--bg)] md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r md:flex md:flex-col print:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-4 md:block md:px-5 md:pb-5 md:pt-7">
          <Link
            href="/"
            className="inline-flex flex-col items-start gap-1.5 no-underline"
          >
            <span className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-[var(--fg)]">
              Digital Asset Venture Intelligence
            </span>
            <span className="text-[9.5px] font-medium uppercase leading-none tracking-[0.2em] text-[var(--fg-faint)]">
              Sourcing &amp; Market Intelligence
            </span>
          </Link>
          <div className="md:hidden">
            <CompanySearch companies={companies} id="company-search-mobile" />
          </div>
        </div>

        <nav aria-label="Primary" className="px-3 py-2 md:flex-1 md:px-3">
          <div className="hidden md:mb-4 md:block md:px-1">
            <CompanySearch companies={companies} id="company-search-desktop" />
          </div>
          <div className="md:hidden">
            <NavLinks orientation="horizontal" />
          </div>
          <div className="hidden md:block">
            <NavLinks orientation="vertical" />
          </div>
        </nav>

        <div className="hidden border-t border-[var(--line)] px-5 py-4 t-label leading-relaxed text-[var(--fg-faint)] md:block">
          <p>
            Research corpus generated {dateOnly(meta.generatedAt)}. Analytics computed on read
            (as-of {meta.asOf}).
          </p>
          <p className="mt-1.5">{meta.companyCount} companies in the research universe.</p>
          <p className="mt-1.5">Independent, firm-neutral framework. Not an investment recommendation.</p>
        </div>
      </header>

      <main
        id="main"
        className="min-w-0 px-4 py-6 md:px-10 md:py-10 lg:px-12 print:!m-0 print:!p-0"
      >
        {children}
      </main>
    </div>
  );
}
