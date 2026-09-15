/** Presentation helpers. Rounding here is display-only; the engine never rounds. */

/** Fit: whole number for display. Never banded, never labelled. */
export function fitDisplay(fit: number): string {
  return String(Math.round(fit));
}

/** Coverage / confidence: whole percent. */
export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** Number of filled segments (0..4) for the confidence gauge. */
export function gaugeSegments(v: number): number {
  return Math.max(0, Math.min(4, Math.round(v * 4)));
}

/** ISO date or datetime -> YYYY-MM-DD, or an em-free placeholder. */
export function dateOnly(v: string | null | undefined): string {
  if (!v) return "not recorded";
  return v.slice(0, 10);
}

/** Human label for a screening criterion id. */
export function criterionLabel(id: string): string {
  return id.replace(/_/g, " ").replace(/\band\b/g, "&");
}

/** Human label for a thesis dimension id. */
export function dimensionLabel(id: string): string {
  return id.replace(/_/g, " ").replace(/\bgtm\b/i, "GTM");
}

/** Sentence-case a lowercase enum-ish token for display. */
export function titleCase(v: string): string {
  return v.replace(/[_-]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
