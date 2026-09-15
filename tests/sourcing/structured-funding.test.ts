import { describe, expect, it } from "vitest";
import {
  parseDatapileCryptoPage,
  looksLikeCompanyName,
  classifyStageEligibility,
  findDisqualifier,
  type RawFundingRecord,
} from "@/lib/sourcing/structured-funding/normalize";
import { runStructuredFundingEngine, STRUCTURED_FUNDING_ENGINE, type SourceRecordsOutcome } from "@/lib/sourcing/structured-funding/engine";
import { runHeadlineEngine } from "@/lib/sourcing/engine";
import type { FeedConfig } from "@/lib/sourcing/feeds";
import type { DiscoveryChannel } from "@/lib/sourcing/engine";
import type { ResolvableCompany } from "@/lib/research/entity/resolve";

const NOW = "2026-09-14T00:00:00.000Z";
const COMPANIES: ResolvableCompany[] = [];

/**
 * Builds a synthetic page matching the real Datapile crypto-sector page's
 * shape: a `self.__next_f.push([1,"<escaped-json-string>"])` chunk whose
 * decoded text contains `"initialList":{"data":[...records]}`, exactly as
 * captured from the live page (see local-artifacts/scratch for the source
 * diagnostic). Tests never depend on the current live network response.
 */
function page(rows: unknown[]): string {
  const inner = `19:["$","$L1a",null,{"initialFilters":{"category":"Crypto"},"initialList":{"data":${JSON.stringify(rows)}}}]`;
  return `<html><body><script>self.__next_f.push([1,${JSON.stringify(inner)}])</script></body></html>`;
}

function row(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 1,
    slug: "example-labs-1",
    companyName: "Example Labs",
    companyDescription: "Example Labs is a crypto custody startup.",
    companyCategory: "Crypto",
    companySubcategory: "Custody",
    amountRaisedUsd: 8_000_000,
    roundType: "Seed",
    country: "United States",
    investors: ["Frontier Capital"],
    investorDetails: [{ name: "Frontier Capital", type: "institution", isLead: true }],
    publishedAt: "$D2026-09-07T00:00:00.000Z",
    ...overrides,
  };
}

describe("Datapile crypto-sector page parsing", () => {
  it("extracts fields directly from the source's own record, never through headline regex extraction", () => {
    const records = parseDatapileCryptoPage(page([row({})]));
    expect(records).not.toBeNull();
    expect(records![0]!.companyName).toBe("Example Labs");
    expect(records![0]!.stage).toBe("Seed");
    expect(records![0]!.amountUsd).toBe(8_000_000);
    expect(records![0]!.country).toBe("United States");
    expect(records![0]!.sectors).toEqual(["Crypto", "Custody"]);
    expect(records![0]!.leadInvestors).toEqual(["Frontier Capital"]);
    expect(records![0]!.announcementDate).toBe("2026-09-07T00:00:00.000Z");
    expect(records![0]!.sourceUrl).toBe("https://datapile.co/funding-news/example-labs-1");
  });

  it("splits lead vs. other investors from investorDetails.isLead", () => {
    const records = parseDatapileCryptoPage(
      page([
        row({
          investorDetails: [
            { name: "Lead Fund", isLead: true },
            { name: "Other Fund", isLead: false },
          ],
        }),
      ]),
    );
    expect(records![0]!.leadInvestors).toEqual(["Lead Fund"]);
    expect(records![0]!.otherInvestors).toEqual(["Other Fund"]);
  });

  it("CONTRACT FAILURE: fails closed (returns null, not an empty array) when the data marker is missing", () => {
    const html = "<html><body><script>self.__next_f.push([1,\"19:[\\\"no funding data here\\\"]\"])</script></body></html>";
    expect(parseDatapileCryptoPage(html)).toBeNull();
  });

  it("CONTRACT FAILURE: fails closed when the array cannot be balanced (truncated payload)", () => {
    const inner = '19:["$","$L1a",null,{"initialList":{"data":[{"id":1,"companyName":"Truncated"';
    const html = `<html><body><script>self.__next_f.push([1,${JSON.stringify(inner)}])</script></body></html>`;
    expect(parseDatapileCryptoPage(html)).toBeNull();
  });

  it("REQUIRED FIELD VALIDATION: skips a row with no companyName rather than inventing one", () => {
    const records = parseDatapileCryptoPage(page([row({ companyName: null }), row({ id: 2, slug: "real-co-2", companyName: "Real Co" })]));
    expect(records).toHaveLength(1);
    expect(records![0]!.companyName).toBe("Real Co");
  });

  it("MALFORMED ROW: one malformed row does not fail the whole batch", () => {
    const records = parseDatapileCryptoPage(page([{ garbage: true }, row({})]));
    expect(records).toHaveLength(1);
    expect(records![0]!.companyName).toBe("Example Labs");
  });

  it("handles an empty but well-formed data array (not a structural failure)", () => {
    const records = parseDatapileCryptoPage(page([]));
    expect(records).toEqual([]);
  });
});

describe("Structured funding eligibility", () => {
  function rec(overrides: Partial<RawFundingRecord>): RawFundingRecord {
    return {
      companyName: "Test Co",
      amountDisplay: "$1.2M",
      amountUsd: 1_200_000,
      stage: "Seed",
      country: "United States",
      sectors: ["Crypto"],
      description: "Test Co is a crypto infrastructure startup.",
      announcementDate: NOW,
      sourceUrl: null,
      sourceItemId: "t1",
      title: "Test Co raises $1.2M Seed",
      leadInvestors: [],
      otherInvestors: ["Some Fund"],
      valuationDisplay: null,
      ...overrides,
    };
  }

  it("VALID: pre-seed crypto infrastructure startup is eligible", () => {
    const v = classifyStageEligibility(rec({ stage: "Pre-seed" }), false, true);
    expect(v.eligible).toBe(true);
  });

  it("VALID: undisclosed emerging protocol funding is eligible with strong relevance and no disqualifier", () => {
    const v = classifyStageEligibility(rec({ stage: "Undisclosed" }), false, true);
    expect(v.eligible).toBe(true);
  });

  it("VALID: null stage with a small amount and investor-backed description is eligible (Firelight Protocol shape)", () => {
    const v = classifyStageEligibility(rec({ stage: null, amountUsd: 8_000_000, amountDisplay: "$8M", otherInvestors: ["Tribe Capital"] }), false, true);
    expect(v.eligible).toBe(true);
  });

  it("INVALID: Series C is never eligible", () => {
    const v = classifyStageEligibility(rec({ stage: "Series C" }), false, true);
    expect(v.eligible).toBe(false);
  });

  it("INVALID: debt financing is never eligible", () => {
    const v = classifyStageEligibility(rec({ stage: "Debt" }), false, true);
    expect(v.eligible).toBe(false);
  });

  it("INVALID: null stage with a mega amount and no early-stage wording reads as later-stage (Polymarket/Ajaib shape)", () => {
    const v = classifyStageEligibility(rec({ stage: null, amountUsd: 1_000_000_000, amountDisplay: "$1B", description: "A prediction market platform." }), false, true);
    expect(v.eligible).toBe(false);
    expect(v.reason).toMatch(/later-stage/);
  });

  it("INVALID: null stage with no investors and no funding-event wording does not describe a financing round (Machi Big Brother shape)", () => {
    const v = classifyStageEligibility(
      rec({ stage: null, otherInvestors: [], description: "Associated with a significant bid that revitalized an inactive app." }),
      false,
      true,
    );
    expect(v.eligible).toBe(false);
    expect(v.reason).toMatch(/does not clearly describe a financing round/);
  });

  it("INVALID: IPO is disqualified regardless of stage", () => {
    const reason = findDisqualifier(rec({ description: "PublicCo completes its IPO on Nasdaq." }));
    expect(reason).toMatch(/IPO/);
  });

  it("INVALID: VC fund formation is disqualified", () => {
    const reason = findDisqualifier(rec({ description: "Chain Capital closes a $100M venture fund to invest in crypto startups." }));
    expect(reason).toMatch(/fund formation/);
  });

  it("INVALID: shutdown story referencing historical funding is disqualified", () => {
    const reason = findDisqualifier(rec({ description: "DefunctChain, which raised $5M in 2022, is shutting down." }));
    expect(reason).toMatch(/shutdown/);
  });

  it("INVALID: unconfirmed in-talks financing is disqualified (Polymarket shape)", () => {
    const reason = findDisqualifier(rec({ description: "The company is currently in talks to raise significant funding." }));
    expect(reason).toMatch(/in-talks/);
  });

  it("INVALID: regulator entity is rejected by name sanity", () => {
    expect(looksLikeCompanyName("SEC")).toBe(false);
  });

  it("INVALID: unnamed group is rejected by name sanity", () => {
    expect(looksLikeCompanyName("Kenyan Web3 Startups")).toBe(false);
  });

  it("INVALID: token presale is disqualified", () => {
    const reason = findDisqualifier(rec({ description: "TokenLaunchCo runs a public token presale ahead of its TGE." }));
    expect(reason).toMatch(/presale/);
  });
});

const channel: DiscoveryChannel = {
  id: "datapile-crypto-funding",
  name: "Datapile Crypto Funding",
  publisher: "Datapile Crypto Funding",
  url: "https://datapile.co/funding-news/sector/crypto",
  transport: "structured_funding",
};

function run(records: RawFundingRecord[]) {
  const outcome: SourceRecordsOutcome = { channel, ok: true, records };
  return runStructuredFundingEngine(STRUCTURED_FUNDING_ENGINE, [outcome], {
    canonicalCompanies: COMPANIES,
    now: NOW,
    lookbackDays: 30,
  });
}

describe("Structured funding engine funnel (source recency, malformed rows, duplicates)", () => {
  it("filters an old round outside the lookback window (unknown date never silently passes)", () => {
    const records = parseDatapileCryptoPage(
      page([row({ id: 2, slug: "oldcrypto-2", companyName: "OldCrypto", publishedAt: "$D2020-01-01T00:00:00.000Z" })]),
    )!;
    const result = run(records);
    expect(result.candidates).toHaveLength(0);
    expect(result.summary.filteredBuckets.outsideRecencyWindow).toBe(1);
  });

  it("filters a record with no announcement date at all (never treated as current)", () => {
    const records = parseDatapileCryptoPage(page([row({ id: 3, slug: "no-date-3", companyName: "NoDateCo", publishedAt: null })]))!;
    const result = run(records);
    expect(result.candidates).toHaveLength(0);
    expect(result.summary.filteredBuckets.outsideRecencyWindow).toBe(1);
  });

  it("admits an eligible seed-stage crypto custody startup as a New Candidate with full funding metadata", () => {
    const records = parseDatapileCryptoPage(page([row({})]))!;
    const result = run(records);
    expect(result.candidates).toHaveLength(1);
    const c = result.candidates[0]!;
    expect(c.name).toBe("Example Labs");
    expect(c.identityConfidence).toBe("confirmed");
    expect(c.funding?.round).toBe("Seed");
    expect(c.funding?.leadInvestors).toEqual(["Frontier Capital"]);
    expect(c.existing.companyId).toBeNull();
  });

  it("rejects a non-crypto-relevant row (no crypto vocabulary anywhere)", () => {
    const records = parseDatapileCryptoPage(
      page([
        row({
          id: 4,
          slug: "genericco-4",
          companyName: "GenericCo",
          companyCategory: "Marketplace",
          companySubcategory: null,
          companyDescription: "GenericCo builds enterprise procurement software for construction firms.",
        }),
      ]),
    )!;
    const result = run(records);
    expect(result.candidates).toHaveLength(0);
    expect(result.summary.filteredBuckets.nonDigitalAsset).toBe(1);
  });

  it("deterministically rejects known bad structured-record patterns (Series C+, IPO, debt, fund, public company, shutdown, regulator, unnamed group, presale, old round) with none surviving to New Candidates", () => {
    const rows = [
      row({ id: 10, slug: "s10", companyName: "LateCo", roundType: "Series C" }),
      row({ id: 11, slug: "s11", companyName: "PublicCo", roundType: "Undisclosed", companyDescription: "PublicCo completes its IPO on Nasdaq." }),
      row({ id: 12, slug: "s12", companyName: "DebtCo", roundType: "Debt" }),
      row({ id: 13, slug: "s13", companyName: "Chain Capital", roundType: "Strategic", companyDescription: "Chain Capital closes a $100M venture fund to invest in crypto startups." }),
      row({ id: 14, slug: "s14", companyName: "OldChain", publishedAt: "$D2020-01-01T00:00:00.000Z" }),
      row({ id: 15, slug: "s15", companyName: "SEC", roundType: null, companyDescription: "SEC crypto enforcement action results in a $75 million settlement." }),
      row({ id: 16, slug: "s16", companyName: "Kenyan Web3 Startups", roundType: "Seed" }),
      row({ id: 17, slug: "s17", companyName: "TokenLaunchCo", roundType: "Undisclosed", companyDescription: "TokenLaunchCo runs a public token presale ahead of its TGE." }),
    ];
    const records = parseDatapileCryptoPage(page(rows))!;
    const result = run(records);
    expect(result.candidates).toHaveLength(0);
  });
});

describe("Cross-source deduplication (structured funding + news)", () => {
  const feed: FeedConfig = {
    id: "coindesk-news",
    name: "CoinDesk",
    publisher: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss",
    engineId: "public-feed-discovery",
  };

  it("merges a Datapile crypto-sector record and a news headline for the same company into one candidate id", () => {
    const structRecords = parseDatapileCryptoPage(page([row({ id: 20, slug: "example-labs-20", companyName: "Example Labs" })]))!;
    const structResult = run(structRecords);

    const newsXml = `<rss><channel><item>
      <title>Example Labs raises $8M seed round for crypto custody</title>
      <link>https://coindesk.com/story</link>
      <pubDate>Mon, 07 Sep 2026 00:00:00 GMT</pubDate>
      <guid>cd-1</guid>
      <description>Example Labs, a crypto custody startup, announced new funding.</description>
    </item></channel></rss>`;
    const newsResult = runHeadlineEngine([{ feed, ok: true, xml: newsXml }], {
      canonicalCompanies: COMPANIES,
      now: NOW,
    });

    expect(structResult.candidates[0]!.id).toBe(newsResult.candidates[0]!.id);
  });

  it("does not collapse two genuinely different funding events for the same company into one event", () => {
    const seedRecord = parseDatapileCryptoPage(page([row({ id: 30, slug: "example-labs-30", companyName: "Example Labs", roundType: "Seed", publishedAt: "$D2026-08-20T00:00:00.000Z" })]))!;
    const seriesARecord = parseDatapileCryptoPage(page([row({ id: 31, slug: "example-labs-31", companyName: "Example Labs", roundType: "Series A", publishedAt: "$D2026-09-01T00:00:00.000Z" })]))!;
    const result = run([...seedRecord, ...seriesARecord]);
    // One candidate identity, but both funding events remain visible via provenance (2 records).
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.provenance).toHaveLength(2);
  });
});
