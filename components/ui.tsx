import type { ReactNode } from "react";
import { pct, gaugeSegments } from "@/lib/ui/format";

/* -------------------------------------------------------------------------- */
/* Icons - inline SVG, currentColor, decorative unless labelled by caller.     */
/* -------------------------------------------------------------------------- */

type IconName =
  | "check"
  | "dash"
  | "alert"
  | "up"
  | "down"
  | "flat"
  | "info"
  | "search"
  | "close"
  | "chevron"
  | "feed"
  | "x";

const PATHS: Record<IconName, ReactNode> = {
  check: <path d="M3.5 8.5l3 3 6-7" />,
  dash: <path d="M3.5 8h9" />,
  alert: <path d="M8 2.5l6 11H2l6-11zM8 7v3M8 12h.01" />,
  up: <path d="M8 12.5v-9M4 7l4-4 4 4" />,
  down: <path d="M8 3.5v9M4 9l4 4 4-4" />,
  flat: <path d="M3.5 8h9" />,
  info: <path d="M8 7.5v4M8 5h.01M8 14.5A6.5 6.5 0 108 1.5a6.5 6.5 0 000 13z" />,
  search: <path d="M7 11.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM10.5 10.5l3 3" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  chevron: <path d="M6 4l4 4-4 4" />,
  feed: (
    <>
      <path d="M3.5 8a4.5 4.5 0 014.5 4.5M3.5 3.5a9 9 0 019 9" />
      <circle cx="4" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  x: <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />,
};

export function Icon({
  name,
  className = "",
  label,
}: {
  name: IconName;
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {PATHS[name]}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Screening display state - evidence-display only, never a verdict.           */
/* -------------------------------------------------------------------------- */

export function DisplayStateBadge({ state }: { state: "SCREENED" | "INSUFFICIENT_EVIDENCE" }) {
  const screened = state === "SCREENED";
  return (
    <span className={`chip ${screened ? "chip--neutral" : "chip--warn"}`}>
      <Icon name={screened ? "check" : "alert"} />
      {screened ? "Screened" : "Insufficient evidence"}
    </span>
  );
}

/** Digital-asset v7 Screening display state. PROVISIONAL is an evidence-sufficiency reading, never an investment recommendation. */
export function ProductDisplayStateBadge({ state }: { state: "PROVISIONAL" | "INSUFFICIENT_EVIDENCE" }) {
  const provisional = state === "PROVISIONAL";
  return (
    <span className={`chip ${provisional ? "chip--neutral" : "chip--warn"}`} title="An evidence-sufficiency reading, not an investment recommendation.">
      <Icon name={provisional ? "check" : "alert"} />
      {provisional ? "Provisional" : "Insufficient evidence"}
    </span>
  );
}

/** Non-mandate evidence-bar mechanics. Separate concept from mandate. */
export function EvidenceBarChip({ pass }: { pass: boolean }) {
  return (
    <span className={`chip chip--wrap ${pass ? "chip--pos" : "chip--muted"}`}>
      <Icon name={pass ? "check" : "dash"} className="shrink-0" />
      {pass ? "Meets Screening evidence bar" : "Does not yet meet Screening evidence bar"}
    </span>
  );
}

export function MandateChip() {
  return (
    <span className="chip chip--muted" title="Mandate eligibility has not been independently evaluated.">
      <Icon name="dash" />
      Mandate: not assessed
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Coverage (bar) and Confidence (segmented gauge) - visually distinct.        */
/* -------------------------------------------------------------------------- */

export function CoverageMeter({ value, compact = false }: { value: number; compact?: boolean }) {
  const label = `Evidence coverage ${pct(value)}`;
  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <span
        className="meter"
        role="img"
        aria-label={label}
        style={{ width: compact ? 56 : 88 }}
      >
        <span style={{ width: pct(value) }} />
      </span>
      <span className="tnum text-[12px] text-[var(--fg-muted)]">{pct(value)}</span>
    </span>
  );
}

export function ConfidenceGauge({ value }: { value: number }) {
  const on = gaugeSegments(value);
  const label = `Evidence confidence ${pct(value)}`;
  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <span className="gauge" role="img" aria-label={label}>
        {[0, 1, 2, 3].map((i) => (
          <i key={i} data-on={i < on} />
        ))}
      </span>
      <span className="tnum text-[12px] text-[var(--fg-muted)]">{pct(value)}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Signal direction - icon + text, never colour alone.                         */
/* -------------------------------------------------------------------------- */

export function SignalDirection({ direction }: { direction: string }) {
  const d = direction.toLowerCase();
  const cfg =
    d === "positive"
      ? { icon: "up" as const, cls: "chip--pos", text: "Positive" }
      : d === "negative"
        ? { icon: "down" as const, cls: "chip--neg", text: "Negative" }
        : d === "neutral"
          ? { icon: "flat" as const, cls: "chip--muted", text: "Neutral" }
          : { icon: "flat" as const, cls: "chip--muted", text: titleCaseLocal(direction) };
  return (
    <span className={`chip ${cfg.cls}`}>
      <Icon name={cfg.icon} />
      {cfg.text}
    </span>
  );
}

function titleCaseLocal(v: string) {
  return v.replace(/[_-]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function EventStatusMark({ status }: { status: string }) {
  if (status === "reported_unconfirmed") {
    return (
      <span className="chip chip--warn" title="Reported by a source but not independently confirmed.">
        <Icon name="alert" />
        Reported, unconfirmed
      </span>
    );
  }
  if (status === "completed") {
    return <span className="chip chip--muted">Completed</span>;
  }
  return <span className="chip chip--muted">{titleCaseLocal(status)}</span>;
}

export function SectionHeading({
  id,
  children,
  aside,
}: {
  id?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="section-h">
      <h2 id={id}>{children}</h2>
      {aside ? <div className="t-meta shrink-0 text-[var(--fg-muted)]">{aside}</div> : null}
    </div>
  );
}
