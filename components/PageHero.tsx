import type { ReactNode } from "react";

/**
 * Shared top-level page header.
 *
 * One restrained hero treatment across Worklist, Companies, Sourcing, and
 * Methodology: a confident title, an optional lede at a comfortable measure,
 * an optional meta row, and a short accent underline that draws once on load.
 * No background wash, no large marketing hero, no KPI tiles - the title sits
 * directly on the continuous page ground.
 *
 * Company detail keeps its own data-oriented identity header but borrows the
 * same title type token and underline for coherence.
 */
export function PageHero({
  title,
  lede,
  meta,
  children,
}: {
  title: string;
  lede?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-hero mb-10 pt-2 md:mb-12 md:pt-6">
      <h1 className="t-display max-w-[18ch] text-[var(--fg)]">{title}</h1>
      <span aria-hidden className="page-hero__rule" />
      {lede ? (
        <p className="mt-5 max-w-[76ch] t-body-lg text-[var(--fg-muted)]">{lede}</p>
      ) : null}
      {meta ? <div className="mt-4 t-meta">{meta}</div> : null}
      {children}
    </header>
  );
}
