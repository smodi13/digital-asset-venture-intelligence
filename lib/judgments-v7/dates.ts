/**
 * Frozen v7 judgment baseline constants (Phase 3C-0, PARALLEL / DORMANT).
 *
 * The CALIBRATION judgment workflow binds every packet to the exact research
 * commit it was judged against. This is the only place that commit is
 * hardcoded, so a future rebaseline touches one line, not every call site.
 */

/** Full 40-hex git commit the frozen v7 CALIBRATION research corpus was built at. */
export const FROZEN_RESEARCH_BASELINE_COMMIT = "0c10a376c3ccc5df3429d397673b59ab97812b5f";

/** Same commit, short form, for display only. Never compared against. */
export const FROZEN_RESEARCH_BASELINE_COMMIT_SHORT = "0c10a37";

/** Research cutoff the bound research corpus was built against. Judgment never reopens research past this date. */
export const RESEARCH_CUTOFF = "2026-09-10";
