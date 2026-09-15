/**
 * Firm and prior-brand names that must not appear in Digital Asset Venture Intelligence.
 *
 * Digital Asset Venture Intelligence is firm agnostic. It is intended to read as a reusable
 * private-markets tool, not as a work sample addressed to one recipient, so no
 * investment firm may appear anywhere a reader can see.
 *
 * MATCHING DISCIPLINE
 *
 * Matching is word bounded, never substring. A substring scan for "usv" would
 * flag nothing useful and a substring scan for "glean" would flag the ordinary
 * English verb. Each entry declares whether it is case sensitive: distinctive
 * coined names are matched in any case, and entries that collide with ordinary
 * English words are matched only in their capitalised form, with the ordinary
 * lowercase word left alone.
 *
 * WHAT IS DELIBERATELY NOT BANNED
 *
 * Third-party open-source project names such as Scout, thesis-agent,
 * OpenDealflow, ScoutLayer, DealDesk, and Autonitia Intel are NOT banned.
 * docs/attribution.md is required to name them, because attributing a
 * conceptual reference honestly is more important than uniform blocklisting.
 *
 * "Headline" is NOT banned. Headline Radar is a planned module of this product
 * and the word is ordinary English.
 *
 * "Counterpart" is NOT banned. It is a common English noun and the false
 * positive rate would exceed any protection it offers.
 *
 * "Roboto" alone is NOT banned; the two-word proper noun is. The single word is
 * a widely used typeface and appears in ordinary CSS font stacks. This was
 * found by the guard itself firing on a font declaration, which is the
 * behaviour a word-bounded rule is supposed to produce: a narrow, specific
 * rule beats a broad one that authors learn to suppress.
 */

export interface BannedName {
  /** The term to detect. */
  term: string;
  /**
   * Match only this exact capitalisation.
   *
   * Set for terms that collide with ordinary English words, so the common word
   * is left alone and only the proper noun is caught.
   */
  caseSensitive: boolean;
  /** Why it is banned. Shown in the failure message. */
  reason: string;
}

export const BANNED_NAMES: readonly BannedName[] = [
  // Distinctive coined names. Matched in any case, which also catches slugs.
  { term: "PolicySentinelFirm", caseSensitive: false, reason: "policy test sentinel" },
  { term: "Goanna", caseSensitive: false, reason: "prior target firm" },
  { term: "Centerfield", caseSensitive: false, reason: "prior target firm" },
  { term: "Matchstick", caseSensitive: false, reason: "prior target firm" },
  { term: "Sky9", caseSensitive: false, reason: "prior target firm" },
  { term: "Instalily", caseSensitive: false, reason: "prior target firm" },
  { term: "Unicity", caseSensitive: false, reason: "prior research subject brand" },
  { term: "Cerberus", caseSensitive: false, reason: "prior project brand" },
  { term: "Magid", caseSensitive: false, reason: "prior employer" },
  { term: "Numeta", caseSensitive: false, reason: "prior employer" },
  { term: "VoltVeera", caseSensitive: false, reason: "prior project brand" },
  { term: "Omniroute", caseSensitive: false, reason: "prior project brand" },
  { term: "Lenovo", caseSensitive: false, reason: "prior target firm" },
  { term: "Anomaly Capital", caseSensitive: false, reason: "prior research subject" },
  { term: "K Street", caseSensitive: false, reason: "prior target firm" },
  { term: "KStreet", caseSensitive: false, reason: "prior target firm" },
  { term: "Plug and Play", caseSensitive: false, reason: "prior employer" },
  { term: "Plug N Play", caseSensitive: false, reason: "prior employer" },

  // Short acronyms. Word bounded and matched in any case.
  { term: "RRE", caseSensitive: false, reason: "prior target firm" },
  { term: "USV", caseSensitive: false, reason: "prior target firm" },
  { term: "LDV", caseSensitive: false, reason: "prior target firm" },

  // Terms that collide with ordinary English. Capitalised form only, so the
  // ordinary word remains usable in normal prose.
  //
  // "Glean" was removed in Phase 4B. It was blocked as a prior research subject
  // outside the canonical corpus; Phase 4A promoted Glean (glean.com) into the
  // approved firm-agnostic Batch 2 research universe, so the premise for banning
  // the name no longer holds. This is a scoped policy correction, not a
  // weakening of the guard: no other term changed and the matcher is unchanged.
  { term: "Roboto AI", caseSensitive: true, reason: "prior research subject (the Roboto typeface is unaffected)" },
  { term: "Northstar", caseSensitive: true, reason: "prior illustrative company (the phrase 'north star' is unaffected)" },
  { term: "Forester", caseSensitive: true, reason: "prior target firm" },
  { term: "Rhapsody", caseSensitive: true, reason: "prior target firm" },
  { term: "Denali", caseSensitive: true, reason: "prior research subject" },
  { term: "Veera", caseSensitive: true, reason: "prior project brand" },
];
