/**
 * CryptoRank /v3/funding-rounds/list payload -> RawFundingRecord[].
 *
 * The list endpoint identifies the raised coin only by currencyId (see
 * https://docs.cryptorank.io/openapi.json, FundingRoundListItemDto); the
 * project/company name comes from resolving that id against the
 * /v3/currencies/map payload, fetched once per run (cryptorank-fetch.ts).
 *
 * The list endpoint does not split lead vs. other investors (that split is
 * only on the per-round detail endpoint, which this connector does not call,
 * to stay within "don't waste API credits"), so every listed investor is
 * carried as an "other investor" rather than guessing who led.
 */

import type { RawFundingRecord } from "./structured-funding/normalize";

interface RawInvestor {
  name?: unknown;
}
interface RawCategory {
  name?: unknown;
}
interface RawFundingRound {
  id?: unknown;
  currencyId?: unknown;
  type?: unknown;
  date?: unknown;
  raised?: unknown;
  category?: RawCategory | null;
  allInvestors?: RawInvestor[];
}
interface RawCurrencyMapItem {
  id?: unknown;
  name?: unknown;
  symbol?: unknown;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export interface CurrencyMap {
  nameById: Map<number, string>;
}

export function buildCurrencyMap(payload: unknown): CurrencyMap {
  const rows = Array.isArray((payload as { data?: unknown })?.data) ? (payload as { data: RawCurrencyMapItem[] }).data : [];
  const nameById = new Map<number, string>();
  for (const row of rows) {
    const id = typeof row.id === "number" ? row.id : null;
    const name = str(row.name) ?? str(row.symbol);
    if (id !== null && name) nameById.set(id, name);
  }
  return { nameById };
}

/** CryptoRank's "raised" figure as a display string, e.g. "$5,000,000". */
function formatAmount(raisedUsd: number | null): string | null {
  if (raisedUsd === null) return null;
  return `$${raisedUsd.toLocaleString("en-US")}`;
}

export function mapCryptoRankFundingRounds(payload: unknown, currencyMap: CurrencyMap): RawFundingRecord[] {
  const rows = Array.isArray((payload as { data?: unknown })?.data) ? (payload as { data: RawFundingRound[] }).data : [];
  const out: RawFundingRecord[] = [];

  for (const row of rows) {
    const id = typeof row.id === "number" ? String(row.id) : str(row.id);
    const currencyId = typeof row.currencyId === "number" ? row.currencyId : null;
    const companyName = currencyId !== null ? (currencyMap.nameById.get(currencyId) ?? null) : null;
    if (!id || !companyName) continue; // Never invents a company name CryptoRank did not resolve.

    const raisedRaw = str(row.raised);
    const amountUsd = raisedRaw !== null && Number.isFinite(Number(raisedRaw)) ? Number(raisedRaw) : null;
    const otherInvestors = (row.allInvestors ?? []).map((i) => str(i.name)).filter((v): v is string => Boolean(v));
    const stage = str(row.type);

    out.push({
      companyName,
      amountDisplay: formatAmount(amountUsd),
      amountUsd,
      stage,
      country: null, // CryptoRank's funding-rounds list does not report a country.
      // CryptoRank's entire catalog is crypto/blockchain projects (that is the
      // product), so "crypto" is an honest source-level fact, not an invented
      // one - it lets the shared digital-asset relevance gate (built for a
      // mixed-vertical source like Datapile) recognize a project whose name
      // and category alone carry no crypto-specific vocabulary.
      sectors: ["crypto", str(row.category?.name) ?? ""].filter(Boolean),
      description: null, // The list endpoint carries no description (only the per-round detail does).
      announcementDate: str(row.date),
      sourceUrl: `https://cryptorank.io/funding-rounds/${id}`,
      sourceItemId: `cryptorank-${id}`,
      title: `${companyName} ${stage ?? "funding round"}`,
      leadInvestors: [],
      otherInvestors,
      valuationDisplay: null,
    });
  }

  return out;
}
