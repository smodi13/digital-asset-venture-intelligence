/**
 * Datapile crypto-sector page -> structured funding record, plus deterministic
 * quality controls (see docs/sourcing-v1.md, section "Structured funding
 * discovery").
 *
 * The page embeds its funding-round dataset as a React Server Components
 * flight payload: one or more `self.__next_f.push([1,"<escaped-json-string>"])`
 * script calls in the HTML, one of which decodes to text containing
 * `"initialList":{"data":[ ...records... ]}`. Each record already carries a
 * split-out company name, round type, country, and investor list - so this
 * module extracts that array directly rather than parsing prose (no headline
 * regex extraction, ever, for a structured source: see engine.ts).
 *
 * Parsing is fail-closed: if the expected marker or a balanced JSON array is
 * not found in ANY decoded chunk, this returns null (a structural failure),
 * which the caller (datapile.ts / engine.ts) surfaces as a Source Health
 * failure - never as "zero records found" (section: fail closed if structure
 * changes, expose the failure rather than silently returning bad data).
 *
 * A field the source did not state stays null; nothing here estimates or
 * infers an amount, valuation, or investor the source did not report.
 */

export interface RawFundingRecord {
  companyName: string;
  amountDisplay: string | null;
  amountUsd: number | null;
  /** Stage/round exactly as the source labeled it, or null when the source gave none. */
  stage: string | null;
  country: string | null;
  /** Sector/category tags (e.g. ["crypto", "DeFi Protection"]). */
  sectors: string[];
  description: string | null;
  /** Funding announcement date, ISO, or null when the source gave none. */
  announcementDate: string | null;
  sourceUrl: string | null;
  sourceItemId: string;
  title: string;
  leadInvestors: string[];
  otherInvestors: string[];
  valuationDisplay: string | null;
}

/* -------------------------------------------------------------------------- */
/* RSC flight payload extraction                                              */
/* -------------------------------------------------------------------------- */

const CHUNK_RE = /self\.__next_f\.push\(\[1,(".*?")\]\)/gs;
const DATA_MARKER = '"initialList":{"data":';

/** Finds the JSON-string-literal-aware balanced `[...]` starting at or after fromIndex. Never uses a regex for nested brackets. */
function findBalancedJsonArray(text: string, fromIndex: number): string | null {
  const start = text.indexOf("[", fromIndex);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null; // Unbalanced: the page structure changed. Fail closed, never guess.
}

interface RawDatapileRow {
  id?: unknown;
  slug?: unknown;
  companyName?: unknown;
  companyDescription?: unknown;
  companyCategory?: unknown;
  companySubcategory?: unknown;
  amountRaisedUsd?: unknown;
  roundType?: unknown;
  country?: unknown;
  investors?: unknown;
  investorDetails?: Array<{ name?: unknown; isLead?: unknown }>;
  publishedAt?: unknown;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** React Flight serializes a Date as "$D<iso>"; strip the marker if present. */
function stripFlightDateMarker(v: string | null): string | null {
  if (!v) return null;
  return v.startsWith("$D") ? v.slice(2) : v;
}

function formatUsdShort(usd: number | null): string | null {
  if (usd === null) return null;
  if (usd >= 1_000_000_000) return `$${round1(usd / 1_000_000_000)}B`;
  if (usd >= 1_000_000) return `$${round1(usd / 1_000_000)}M`;
  if (usd >= 1_000) return `$${round1(usd / 1_000)}K`;
  return `$${usd}`;
}
function round1(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function toRecord(row: RawDatapileRow): RawFundingRecord | null {
  const id = typeof row.id === "number" ? String(row.id) : str(row.id);
  const companyName = str(row.companyName);
  if (!id || !companyName) return null; // Required-field contract: never invents an identity.

  const amountUsd = typeof row.amountRaisedUsd === "number" ? row.amountRaisedUsd : null;
  const investorDetails = Array.isArray(row.investorDetails) ? row.investorDetails : [];
  const leadInvestors = investorDetails.filter((d) => d.isLead === true).map((d) => str(d.name)).filter((v): v is string => Boolean(v));
  const namedInvestors = investorDetails.map((d) => str(d.name)).filter((v): v is string => Boolean(v));
  const fallbackInvestors = Array.isArray(row.investors) ? row.investors.filter((v): v is string => typeof v === "string") : [];
  const allInvestors = namedInvestors.length ? namedInvestors : fallbackInvestors;
  const otherInvestors = allInvestors.filter((n) => !leadInvestors.includes(n));

  const stage = str(row.roundType);
  const slug = str(row.slug);

  return {
    companyName,
    amountDisplay: formatUsdShort(amountUsd),
    amountUsd,
    stage,
    country: str(row.country),
    sectors: [str(row.companyCategory), str(row.companySubcategory)].filter((v): v is string => Boolean(v)),
    description: str(row.companyDescription),
    announcementDate: stripFlightDateMarker(str(row.publishedAt)),
    sourceUrl: slug ? `https://datapile.co/funding-news/${slug}` : null,
    sourceItemId: `datapile-crypto-${id}`,
    title: `${companyName} raises ${formatUsdShort(amountUsd) ?? "an undisclosed amount"}${stage ? ` ${stage}` : ""}`,
    leadInvestors,
    otherInvestors,
    valuationDisplay: null, // Not present in this payload; never estimated.
  };
}

/**
 * Parses the Datapile crypto-sector HTML page into structured funding
 * records. Returns null (a structural failure, not an empty result) when the
 * expected RSC data marker cannot be found in any decoded chunk, or the
 * array cannot be balanced/parsed - fail closed rather than silently return
 * zero records for a page that actually changed shape.
 */
export function parseDatapileCryptoPage(html: string): RawFundingRecord[] | null {
  if (typeof html !== "string" || html.length === 0) return null;

  for (const match of html.matchAll(CHUNK_RE)) {
    let decoded: string;
    try {
      decoded = JSON.parse(match[1]!) as string;
    } catch {
      continue; // Not a decodable chunk; try the next one.
    }
    const markerIndex = decoded.indexOf(DATA_MARKER);
    if (markerIndex === -1) continue;

    const arrayText = findBalancedJsonArray(decoded, markerIndex + DATA_MARKER.length);
    if (!arrayText) return null; // Marker found, but structure broke mid-array: fail closed.

    let rows: unknown;
    try {
      rows = JSON.parse(arrayText);
    } catch {
      return null; // Marker found, array boundary found, but not valid JSON: fail closed.
    }
    if (!Array.isArray(rows)) return null;

    const out: RawFundingRecord[] = [];
    for (const row of rows) {
      try {
        const record = toRecord(row as RawDatapileRow);
        if (record) out.push(record);
      } catch {
        // One malformed row is skipped, not fatal to the batch.
      }
    }
    return out;
  }

  return null; // No chunk carried the expected data marker: fail closed.
}

/* -------------------------------------------------------------------------- */
/* Quality controls (spec: structured funding is a lead source, not ground    */
/* truth). Event/entity semantics, never a company-name blocklist.            */
/* -------------------------------------------------------------------------- */

const STRONG_ALLOWED_STAGES = new Set(
  [
    "angel",
    "pre-seed",
    "preseed",
    "seed",
    "seed extension",
    "pre-series a",
    "series a",
    "series a extension",
    "pre-series b",
    "series b",
    "series b extension",
    "early-stage",
    "early vc",
    "incubation",
  ].map((s) => s.toLowerCase()),
);

/** Only eligible when no disqualifier fired and the record clearly reads as an emerging private entity. */
const CONDITIONAL_STAGES = new Set(["strategic", "private", "funding round", "undisclosed"]);

const STAGE_DISQUALIFIER_RE =
  /\bseries [c-z]\b|\bpre-series c\b|\bdebt\b|\bconvertible note\b|\bipo\b|\bpost-ipo\b|\bpublic\b/i;

/** Amounts above this, with no stage label and no early-stage wording, read as a mega/late-stage round, not a missing label on a small round (a deliberate ceiling, not a stage inference: see classifyStageEligibility). */
const NO_STAGE_AMOUNT_CEILING_USD = 50_000_000;
const EARLY_STAGE_WORDING_RE = /\b(pre-seed|seed round|seed funding|series a|series b|early-stage|early vc|incubation)\b/i;
const FUNDING_EVENT_WORDING_RE = /\b(raised|raises|funding round|seed round|financing round|series [a-e]|invest(?:s|ed|ment)|backed by)\b/i;

/** Event/entity-semantic disqualifiers on the record's own text (section 4). */
const RECORD_DISQUALIFIERS: ReadonlyArray<{ re: RegExp; reason: string }> = [
  { re: /\b(shut(s|ting)? down|shutting down|ceased operations?|winding down|dissolv(ed|ing)|bankrupt(cy)?|insolvent)\b/i, reason: "shutdown or ceased operations" },
  { re: /\b(lawsuit|sued|fraud charges?|indicted|sec charges?|settlement with (the )?sec)\b/i, reason: "legal controversy" },
  { re: /\bipo\b|\binitial public offering\b/i, reason: "IPO / public offering" },
  { re: /\bpublic compan(y|ies)\b|\bnasdaq\b|\bnyse\b|\blisted compan(y|ies)\b/i, reason: "public-company financing" },
  { re: /\bbuyout\b|\bprivate equity\b.*\bacquisition\b|\bpe firm\b/i, reason: "private equity buyout" },
  { re: /\bacquir(es?|ed)\b|\bacquisition\b|\bmerger\b|\bmerges? with\b/i, reason: "M&A" },
  { re: /\b(presale|pre-sale|public token sale|\bico\b|token generation event|\btge\b)\b/i, reason: "token presale / public token sale" },
  { re: /\bnew (venture )?fund\b|\bclos(?:es|ed) (?:its |a )?(?:\$[\d.]+\s*(?:m|million|b|billion)?\s*)?(?:venture )?fund\b|\bventure fund\b/i, reason: "fund formation" },
  { re: /\bin talks to raise\b|\bin talks for\b|\breportedly in talks\b|\bis in talks\b/i, reason: "unconfirmed / in-talks financing, not a closed round" },
];

const REGULATOR_OR_GENERIC_NAMES = new Set([
  "sec", "fed", "irs", "ftc", "doj", "ecb", "imf", "cftc", "fca", "treasury",
  "senate", "congress", "white house", "startup", "startups", "funding round",
  "series a", "series b", "series c",
]);

export interface EligibilityVerdict {
  eligible: boolean;
  /** Short factual reason, for provenance / diagnostics. */
  reason: string;
}

/** Deterministic company-name sanity (section 8): entity-shape checks, no hardcoded company blacklist. */
export function looksLikeCompanyName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (REGULATOR_OR_GENERIC_NAMES.has(lower)) return false;
  if (/\bfunding round\b/i.test(trimmed)) return false;
  // A plural generic group ("Kenyan Web3 Startups", "crypto startups"), not one company.
  if (/\bstartups\b/i.test(trimmed)) return false;
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 0 || tokens.length > 8) return false;
  if (!/[A-Za-z]/.test(tokens[0]!)) return false;
  return true;
}

/**
 * Whether the record's own text plausibly describes a financing round at
 * all, independent of stage. A record with no investor list and no
 * funding-event wording in its description (e.g. a bid/activity story that
 * happens to carry a dollar figure) is not a sourcing lead.
 */
function describesFundingEvent(record: RawFundingRecord): boolean {
  if (record.leadInvestors.length > 0 || record.otherInvestors.length > 0) return true;
  return FUNDING_EVENT_WORDING_RE.test(record.description ?? "");
}

/** Early-stage eligibility (section 5): the source's stage plus contextual evidence, never dollar amount alone. */
export function classifyStageEligibility(record: RawFundingRecord, hasDisqualifier: boolean, strongDigitalAssetRelevance: boolean): EligibilityVerdict {
  const stage = record.stage?.trim().toLowerCase() ?? null;

  if (!stage) {
    if (hasDisqualifier) return { eligible: false, reason: "no stage reported and a disqualifying signal is present" };
    if (!strongDigitalAssetRelevance) return { eligible: false, reason: "no stage reported and insufficient digital-asset context" };
    if (!describesFundingEvent(record)) return { eligible: false, reason: "no stage reported and the record does not clearly describe a financing round" };
    const hasEarlyWording = EARLY_STAGE_WORDING_RE.test(record.description ?? "") || EARLY_STAGE_WORDING_RE.test(record.title);
    if (record.amountUsd !== null && record.amountUsd > NO_STAGE_AMOUNT_CEILING_USD && !hasEarlyWording) {
      return { eligible: false, reason: `no stage reported and the amount (${record.amountDisplay ?? "undisclosed"}) reads as a later-stage round` };
    }
    return { eligible: true, reason: "no stage reported, but clearly a private emerging digital-asset entity" };
  }

  if (STAGE_DISQUALIFIER_RE.test(stage)) return { eligible: false, reason: `late-stage or non-equity round (${record.stage})` };
  if (STRONG_ALLOWED_STAGES.has(stage)) return { eligible: true, reason: `early-stage round (${record.stage})` };
  if (CONDITIONAL_STAGES.has(stage)) {
    if (hasDisqualifier) return { eligible: false, reason: `${record.stage} round with a disqualifying signal present` };
    if (!strongDigitalAssetRelevance) return { eligible: false, reason: `${record.stage} round without clear digital-asset context` };
    return { eligible: true, reason: `${record.stage} round, clearly a private emerging digital-asset entity` };
  }
  return { eligible: false, reason: `unrecognized or late-stage round label (${record.stage})` };
}

/** Section 4: event/entity-semantic disqualifiers on the record's own title/description. */
export function findDisqualifier(record: RawFundingRecord): string | null {
  const hay = `${record.title} \n ${record.description ?? ""}`;
  for (const { re, reason } of RECORD_DISQUALIFIERS) {
    if (re.test(hay)) return reason;
  }
  return null;
}
