import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  companySchema,
  evidenceClaimSchema,
  signalEventSchema,
  sourceRecordSchema,
} from "@/lib/schemas";

/**
 * Real-data regression tests for the Batch 1 corpus.
 *
 * These lock in the distinctions Phase 3C exists to protect: unknown stays
 * unknown, company-reported stays company-reported, a reported financing is not
 * a completed one, funding is not automatically positive, and the raw handoff
 * never becomes tracked. They read the committed corpus on disk, so they fail
 * if a later regeneration loses one of these properties.
 */

const ROOT = process.cwd();

function readRecords<T>(name: string, schema: z.ZodType<T>): T[] {
  const parsed = JSON.parse(readFileSync(join(ROOT, "data/generated", name), "utf8")) as {
    records: unknown[];
  };
  return parsed.records.map((r) => schema.parse(r));
}

const companies = readRecords("companies.json", companySchema);
const events = readRecords("signal-events.json", signalEventSchema);
const claims = readRecords("evidence.json", evidenceClaimSchema);
const sources = readRecords("sources.json", sourceRecordSchema);

const company = (id: string) => companies.find((c) => c.id === id);

/** The 19 Batch 1 company ids. Batch 2 (Phase 4B) added 20 more to the corpus. */
const BATCH1_IDS = [
  "co-mintlify-com", "co-dust-tt", "co-llamaindex-ai", "co-crewai-com", "co-e2b-dev",
  "co-crosby-ai", "co-arcade-dev", "co-withpace-com", "co-resend-com", "co-retellai-com",
  "co-serval-com", "co-granola-ai", "co-gamma-app", "co-appliedcompute-com", "co-modal-com",
  "co-linear-app", "co-wisprflow-ai", "co-turbopuffer-com", "co-browserbase-com",
];
const batch1Events = events.filter((e) => e.companyId !== null && BATCH1_IDS.includes(e.companyId));

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

describe("Batch 1 corpus shape", () => {
  it("keeps all 19 Batch 1 companies present in the combined corpus", () => {
    for (const id of BATCH1_IDS) {
      expect(companies.find((c) => c.id === id), `${id} missing`).toBeDefined();
    }
    // Phase 4B added the 20 Batch 2 companies: 39 total.
    expect(companies.length).toBe(39);
  });

  it("does not contain OpenRouter", () => {
    for (const c of companies) {
      expect(c.name.toLowerCase()).not.toBe("openrouter");
      expect(c.domain ?? "").not.toBe("openrouter.ai");
    }
  });

  it("contains no synthetic Phase 3A company", () => {
    for (const c of companies) expect(c.domain ?? "").not.toContain(".example");
  });

  // Phase 3C baseline was 74 sources / 141 claims / 67 events. Phase 3D
  // evidence hardening adds 30 genuinely new external sources and, through the
  // 8 atomic-split directives plus the Wispr founding resolution, takes the
  // claim count to 188. The event count does not move.
  it("carries the combined Batch 1 + Batch 2 corpus counts", () => {
    // Batch 1 baseline was 104 / 199 / 67. Phase 4B added 59 sources, 208
    // evidence rows (140 dimension assessments + 68 high-impact claims), and
    // 46 dated events, taking it to 163 / 407 / 113. Phase 4C-B identity
    // enrichment then adds 59 identity SourceRecords and 103 atomic identity
    // EvidenceClaims (20 founding/origin + 20 headquarters + 20 stage +
    // 41 founder role + 2 public-launch). It adds no events.
    expect(sources.length).toBe(222);
    expect(claims.length).toBe(510);
    expect(events.length).toBe(113);
  });

  it("every Phase 3D source carries a support role", () => {
    const p3d = sources.filter((s) => (s.termsNote ?? "").includes("Phase 3D source"));
    expect(p3d.length).toBe(30);
    for (const s of p3d) expect(s.supportRole).not.toBeNull();
  });

  it("the Dealroom Applied Compute note derives from The Information, not a second origin", () => {
    const dealroom = sources.find((s) => (s.publisher ?? "") === "Dealroom News");
    const information = sources.find((s) => (s.publisher ?? "") === "The Information");
    expect(dealroom?.originatesFrom).toBe(information?.id);
  });
});

describe("Phase 3D atomic splits and derived capital", () => {
  const byRef = (ref: string) => claims.filter((c) => c.hardeningRef === ref);
  const gamma = () => claims.filter((c) => c.companyId === "co-gamma-app");
  const linear = () => claims.filter((c) => c.companyId === "co-linear-app");
  const retell = () => claims.filter((c) => c.companyId === "co-retellai-com");

  it("Gamma's compound capital-efficiency blob was atomized, not left as one claim", () => {
    // The original compound claim named $100M ARR, $23M initial funding, a
    // 50-person team and the $68M Series B in one inseparable sentence.
    const compound = gamma().find(
      (c) => /\$100M ARR/i.test(c.claim) && /\$23M/.test(c.claim) && /\$68M/.test(c.claim),
    );
    expect(compound, "no single ARR+funding+team+round claim remains").toBeUndefined();
    expect(byRef("p3d-split-gamma-capital_efficiency").length).toBe(6);
  });

  it("Gamma's ~$48M Series B primary and ~$71M cumulative primary are derived, not sourced", () => {
    const primary = gamma().find((c) => c.hardeningRef === "p3d-derive-gamma-series_b_primary");
    const cumulative = gamma().find((c) => c.hardeningRef === "p3d-derive-gamma-cumulative_primary");
    for (const c of [primary, cumulative]) {
      expect(c?.provenance).toBe("derived");
      expect(c?.sourceSubtype).toBeNull();
      expect(c?.numericValue).toBeNull();
      expect(c?.notes ?? "").toMatch(/input/i);
    }
    expect(cumulative?.claim).toMatch(/approximately \$71M/);
    expect(cumulative?.claim).toMatch(/rounding/i);
  });

  it("Linear's tender contributes $0 primary and the Series C primary split stays unknown", () => {
    const tender = linear().find((c) => /tender/i.test(c.claim) && /no new primary/i.test(c.claim));
    expect(tender?.notes ?? "").toMatch(/\$0/);
    const seriesC = linear().find((c) => /Series C primary/i.test(c.claim) && /unknown/i.test(c.claim));
    expect(seriesC?.provenance).toBe("unknown");
    const pre = linear().find((c) => c.hardeningRef === "p3d-derive-linear-pre_series_c_primary");
    expect(pre?.provenance).toBe("derived");
    expect(pre?.claim).toMatch(/\$52\.2M/);
  });

  it("Retell's two Sacra revenue snapshots are separate third-party estimates, not merged", () => {
    const april = retell().find((c) => /April 2026/.test(c.claim));
    const august = retell().find((c) => /August 2026/.test(c.claim));
    expect(april?.sourceSubtype).toBe("third_party_estimate");
    expect(august?.sourceSubtype).toBe("third_party_estimate");
    expect(april?.id).not.toBe(august?.id);
    // company-reported profitability stays company-reported
    const profit = retell().find((c) => /reported full profitability/i.test(c.claim));
    expect(profit?.sourceSubtype).toBe("company_reported");
  });

  it("Dust's NRR and churn claims remain company-reported after the split", () => {
    const dust = claims.filter((c) => c.companyId === "co-dust-tt" && c.hardeningRef === "p3d-split-dust-growth_momentum");
    expect(dust.length).toBe(6);
    for (const c of dust) expect(c.sourceSubtype).toBe("company_reported");
  });

  it("Wispr keeps operating origin 2021 and legal founding 2023 as distinct concepts", () => {
    const w = company("co-wisprflow-ai");
    expect(w?.operatingOriginYear).toBe(2021);
    expect(w?.foundedYear.value).toBe(2023);
  });

  it("turbopuffer 'less than $1M raised' stays a bound, never becomes exactly $1M", () => {
    const tp = claims.filter((c) => c.companyId === "co-turbopuffer-com");
    const bound = tp.find((c) => /less than \$1M/i.test(c.claim));
    expect(bound).toBeDefined();
    expect(bound?.numericValue).toBeNull();
    expect(bound?.claim).not.toMatch(/raised \$1M\b/i);
    const company = companies.find((c) => c.id === "co-turbopuffer-com");
    expect(company?.totalRaised.provenance).toBe("unknown");
  });

  it("turbopuffer funding evidence asserts no ordering between the founder disclosure and the BetaKit financing", () => {
    const tp = claims.filter((c) => c.companyId === "co-turbopuffer-com" && c.hardeningRef === "p3d-issue-turbopuffer-funding_revenue");
    for (const c of tp) {
      const text = `${c.claim} ${c.notes ?? ""} ${c.analystInterpretation ?? ""}`;
      expect(text, c.id).not.toMatch(/\b(later|subsequent|since raised|earlier disclosure)\b/i);
    }
  });

  it("Retell's $40M revenue disclosure carries no fabricated as-of date", () => {
    const retell = claims.filter((c) => c.companyId === "co-retellai-com");
    const forty = retell.find((c) => /\$40M annualized revenue/.test(c.claim));
    expect(forty?.metricAsOfDate).toBeNull();
    expect(forty?.publicationDate).toBeNull();
    expect(forty?.sourceSubtype).toBe("company_reported");
    // the dated Sacra estimates must not be used to backfill it
    expect(forty?.claim).toMatch(/no as-of date/i);
  });

  it("every atomized or derived claim keeps a researchAssessmentId or a hardeningRef", () => {
    for (const c of claims) {
      if (c.hardeningRef !== null) {
        expect(c.researchAssessmentId ?? c.hardeningRef).toBeTruthy();
      }
    }
  });
});

describe("unknown stays unknown", () => {
  it("turbopuffer funding is unknown, not a guessed number", () => {
    const tp = company("co-turbopuffer-com");
    expect(tp?.totalRaised.provenance).toBe("unknown");
    expect(tp?.totalRaised.value).toBeNull();
    expect(tp?.lastRound.provenance).toBe("unknown");
    expect(tp?.lastRound.value).toBeNull();
  });

  it("no evidence claim invented a numeric value the research did not state", () => {
    // The Batch 1 translation carries facts as prose, never as extracted
    // numbers. A later pass may add numericValue deliberately; until then a
    // non-null value would mean a machine guessed one.
    for (const c of claims) expect(c.numericValue).toBeNull();
  });

  it("every company carries its reviewer-facing research notes", () => {
    for (const c of companies) {
      expect(typeof c.notes).toBe("string");
      expect((c.notes ?? "").length).toBeGreaterThan(0);
    }
  });
});

describe("company-reported is not audited", () => {
  it("keeps company_reported subtype on the private-metric claims", () => {
    const reported = claims.filter((c) => c.sourceSubtype === "company_reported");
    expect(reported.length).toBeGreaterThan(50);
    const retell = claims.filter((c) => c.companyId === "co-retellai-com");
    expect(retell.length).toBeGreaterThan(0);
    expect(retell.every((c) => ["sourced", "assumption", "derived"].includes(c.provenance))).toBe(true);
  });

  it("promotes only a small minority of claims to model_input", () => {
    const modelInputs = claims.filter((c) => c.modelEligibility === "model_input");
    expect(modelInputs.length).toBeLessThan(claims.length / 10);
  });

  it("keeps evidenceStatus as an assessment, never a number", () => {
    for (const c of claims) {
      if (c.evidenceStatus !== null) {
        expect(["supported", "mixed", "insufficient"]).toContain(c.evidenceStatus);
      }
    }
  });
});

describe("financing discipline", () => {
  it("every funding event stays direction ambiguous", () => {
    const funding = events.filter((e) => e.signalType === "funding");
    expect(funding.length).toBeGreaterThan(0);
    for (const e of funding) expect(e.signalDirection).toBe("ambiguous");
  });

  it("Applied Compute's possible $350M round is reported_unconfirmed, not completed", () => {
    const ac = events.filter((e) => e.companyId === "co-appliedcompute-com" && e.signalType === "funding");
    const unconfirmed = ac.filter((e) => e.eventStatus === "reported_unconfirmed");
    expect(unconfirmed.length).toBe(1);
    expect(unconfirmed[0]?.unconfirmedNote).not.toBeNull();
    for (const e of ac) {
      if (e.eventStatus === "completed") expect(e.evidenceSummary).not.toContain("350M");
    }
  });

  it("Gamma's Series B primary capital is not fabricated", () => {
    const g = company("co-gamma-app");
    expect(g?.totalRaised.provenance).toBe("unknown");
    expect(g?.lastRound.value).toBeNull();
    // Phase 3D resolved the split with caveat: the note no longer claims the
    // split is entirely unknown, but it must still flag the derived figure.
    expect(g?.notes ?? "").not.toMatch(/primary versus secondary/i);
    expect(g?.notes ?? "").toMatch(/derived/i);
    expect(g?.notes ?? "").toMatch(/\$71M/);
    expect(g?.notes ?? "").toMatch(/not an audited/i);
  });

  it("Linear's $99M tender is not recorded as new primary capital", () => {
    const l = company("co-linear-app");
    expect(l?.totalRaised.provenance).toBe("unknown");
    expect(l?.lastRound.value).toBeNull();
    const tender = events.find(
      (e) => e.companyId === "co-linear-app" && e.evidenceSummary.includes("tender"),
    );
    expect(tender, "Linear tender event present").toBeDefined();
    expect(tender?.signalDirection).toBe("ambiguous");
  });
});

describe("Phase 3D Stage 3 issue-resolution integration", () => {
  const forCompany = (id: string) => claims.filter((c) => c.companyId === id);
  const noteOf = (id: string) => company(id)?.notes ?? "";

  it("Linear legacy compound business-model claim is gone; NRR and cash-flow are atomic elsewhere", () => {
    const linear = forCompany("co-linear-app");
    expect(
      linear.find((c) => /recurring B2B software with strong expansion/i.test(c.claim)),
      "old compound claim removed",
    ).toBeUndefined();
    const bmq = linear.find((c) => c.researchAssessmentId === "b1-16-business-model-quality");
    expect(bmq?.claim).toBe("Linear operates a recurring B2B software business model.");
    expect(bmq?.modelEligibility).toBe("context_only");
    expect(linear.some((c) => /177% net revenue retention/i.test(c.claim) && c.sourceSubtype === "company_reported")).toBe(true);
    expect(linear.some((c) => /cash-flow positive/i.test(c.claim))).toBe(true);
  });

  it("model_input count is 0 by design after the Linear cleanup", () => {
    expect(claims.filter((c) => c.modelEligibility === "model_input").length).toBe(0);
  });

  it("Applied Compute financing stays reported_unconfirmed and $350M is not capital", () => {
    const ac = events.filter((e) => e.companyId === "co-appliedcompute-com" && e.signalType === "funding");
    expect(ac.filter((e) => e.eventStatus === "reported_unconfirmed").length).toBe(1);
    expect(company("co-appliedcompute-com")?.totalRaised.provenance).toBe("unknown");
    const revenue = forCompany("co-appliedcompute-com").find((c) => /approximately \$50M in annualized revenue/i.test(c.claim));
    expect(revenue?.sourceSubtype).toBe("third_party_estimate");
    expect(revenue?.modelEligibility).toBe("context_only");
    expect(noteOf("co-appliedcompute-com")).not.toMatch(/\bSaaS\b(?!.*not)/);
  });

  it("Crosby and Pace are not represented as pure SaaS", () => {
    expect(noteOf("co-crosby-ai")).toMatch(/law firm/i);
    expect(noteOf("co-crosby-ai")).toMatch(/do not apply SaaS/i);
    expect(noteOf("co-withpace-com")).toMatch(/not pure SaaS/i);
  });

  it("Browserbase current revenue stays unknown and the 2024 estimate is flagged stale", () => {
    const bb = forCompany("co-browserbase-com");
    const stale = bb.find((c) => /\$1M of 2024 revenue/i.test(c.claim) || /2024 revenue/i.test(c.claim));
    expect(stale?.modelEligibility).toBe("caveat");
    expect(noteOf("co-browserbase-com")).toMatch(/stale/i);
    expect(noteOf("co-browserbase-com")).toMatch(/unknown/i);
    const stripe = bb.find((c) => /Stripe reports Browserbase/i.test(c.claim));
    expect(stripe?.topic).toBe("growth_momentum");
  });

  it("E2B $32M and >$37M coexist without a contradiction link", () => {
    const e2b = forCompany("co-e2b-dev");
    const snapshot = e2b.find((c) => /\$32M total funding after its \$21M Series A/i.test(c.claim));
    const current = e2b.find((c) => /more than \$37M in funding/i.test(c.claim));
    expect(snapshot).toBeDefined();
    expect(current).toBeDefined();
    expect(current?.claim).toMatch(/no exact figure/i);
    for (const c of [snapshot, current]) {
      expect(c?.contradicts).toEqual([]);
      expect(c?.contradictedBy).toEqual([]);
    }
  });

  it("Resend $21.5M is a third-party estimate, official $18M Series A stays company-reported", () => {
    const resend = forCompany("co-resend-com");
    const cbi = resend.find((c) => /\$21\.5M total funding/i.test(c.claim));
    expect(cbi?.sourceSubtype).toBe("third_party_estimate");
    expect(noteOf("co-resend-com")).toMatch(/unresolved/i);
  });

  it("Granola absolute revenue stays unknown; only a relative growth rate is added", () => {
    const g = forCompany("co-granola-ai");
    expect(g.some((c) => /No reliable public revenue or profitability data/i.test(c.claim))).toBe(true);
    const rel = g.find((c) => /2\.5x the prior-year level/i.test(c.claim));
    expect(rel?.sourceSubtype).toBe("third_party_estimate");
    expect(rel?.claim).not.toMatch(/\$[0-9]/);
  });

  it("Phase 3D company notes are attached to the correct companies", () => {
    // guards against a mis-targeted note edit
    expect(noteOf("co-granola-ai")).toMatch(/mid-March 2026 at approximately 2\.5x/);
    expect(noteOf("co-serval-com")).toMatch(/Establish revenue scale, retention, and contract economics/);
    expect(noteOf("co-serval-com")).not.toMatch(/2\.5x the prior-year/);
    expect(noteOf("co-mintlify-com")).toMatch(/approximately \$67M/);
    expect(noteOf("co-retellai-com")).toMatch(/no established as-of date/);
    expect(noteOf("co-e2b-dev")).toMatch(/temporal difference/);
  });

  it("no new SignalEvents were created by Stage 3 corroborating sources", () => {
    // Batch 1 still contributes exactly its 67 events; Phase 4B added 46 more.
    expect(batch1Events.length).toBe(67);
    expect(events.length).toBe(113);
  });

  it("every Phase 3D issue claim resolves its cited sources", () => {
    const ids = new Set(sources.map((s) => s.id));
    const issueClaims = claims.filter((c) => (c.hardeningRef ?? "").startsWith("p3d-issue-"));
    expect(issueClaims.length).toBeGreaterThan(10);
    for (const c of issueClaims) {
      expect(c.sourceId).not.toBeNull();
      expect(ids.has(c.sourceId as string)).toBe(true);
      for (const s of c.supportingSourceIds) expect(ids.has(s)).toBe(true);
    }
  });

  it("the corpus holds no structured contradictions", () => {
    for (const c of claims) {
      expect(c.contradicts).toEqual([]);
      expect(c.contradictedBy).toEqual([]);
    }
  });

  it("Modal note reflects only approved Stage 2 hardening, not a new interpretation", () => {
    const n = noteOf("co-modal-com");
    expect(n).toMatch(/\$355M Series C/);
    expect(n).toMatch(/third-party compute/i);
    expect(n).toMatch(/do not treat as SaaS/i);
  });

  it("the four independent-origin claims are exactly the journalist-established facts", () => {
    const io = claims.filter(
      (c) =>
        BATCH1_IDS.includes(c.companyId ?? "") &&
        c.sourceSubtype === "reported_fact" &&
        sources.find((s) => s.id === c.sourceId)?.sourceType === "independent_journalism",
    );
    const companiesHit = [...new Set(io.map((c) => c.companyId))].sort();
    expect(companiesHit).toEqual(
      ["co-appliedcompute-com", "co-crosby-ai", "co-gamma-app", "co-turbopuffer-com"].sort(),
    );
    // company-announced round headlines must NOT be in this set
    expect(io.some((c) => /headline amount was \$68M/.test(c.claim))).toBe(false);
    expect(io.some((c) => /\$355M Series C/.test(c.claim))).toBe(false);
  });

  it("claim-level independence metrics match the hand-audited fixture", () => {
    const summary = JSON.parse(
      readFileSync(join(ROOT, "data/generated/research-summary.json"), "utf8"),
    ) as { metrics: { claimSupport: Record<string, number>; evidenceCoverage: Record<string, number> } };
    // Combined Batch 1 + Batch 2 corpus. The strict independent-origin rule is
    // unchanged: management-repeated metrics (Canva $4B ARR, Lovable $500M,
    // Rillet, Sierra Fortune 50) stay company_reported and are not counted here.
    // companyReportedClaimsWithExternalPublicationSupport is 57, not 56: the
    // OpenEvidence founding-year conflict claim (company_reported) links the
    // Forbes 2022 founding source as supporting evidence, which is exactly what
    // that metric counts. It does not become independent-origin.
    expect(summary.metrics.claimSupport).toEqual({
      companiesWithIndependentJournalismSource: 34,
      companiesWithTwoIndependentJournalismSources: 15,
      claimsWithIndependentOriginSupport: 20,
      claimsWithTwoIndependentOriginSources: 3,
      claimsWithThirdPartyEstimateSupport: 21,
      companyReportedClaimsWithExternalPublicationSupport: 57,
    });
    // legacy company-level coverage statistic, retained and documented
    expect(summary.metrics.evidenceCoverage.companiesWithTwoIndependentSources).toBe(18);
  });
});

describe("historical availability survives normalization", () => {
  it("every Batch 1 event keeps an availability date and an intrinsic-timestamp method", () => {
    for (const e of batch1Events) {
      expect(e.availabilityDate).not.toBeNull();
      expect(e.availabilityEvidence.method).toBe("intrinsic_timestamp");
      expect(e.availabilityEvidence.sourceUrl).toBeTruthy();
      expect(typeof e.publicationDate).toBe("string");
    }
  });

  it("every event, Batch 1 and Batch 2, has an established availability date", () => {
    for (const e of events) {
      expect(e.availabilityDate).not.toBeNull();
      expect(e.availabilityEvidence.sourceUrl).toBeTruthy();
      expect(["intrinsic_timestamp", "manual_verified", "regulatory_filing_timestamp"]).toContain(
        e.availabilityEvidence.method,
      );
    }
  });
});

describe("entity resolution", () => {
  it("resolves every event to a company by exact domain", () => {
    for (const e of events) {
      expect(e.companyId).not.toBeNull();
      expect(e.entityMatchMethod).toBe("domain");
      expect(e.entityMatchConfidence).toBeGreaterThanOrEqual(0.7);
    }
  });

  it("resolves every evidence claim to a company", () => {
    for (const c of claims) expect(c.companyId).not.toBeNull();
  });

  it("every source id referenced by a claim exists as a source record", () => {
    const ids = new Set(sources.map((s) => s.id));
    for (const c of claims) {
      // A source-less analyst assumption is allowed; anything else must resolve.
      if (c.sourceId !== null) expect(ids.has(c.sourceId)).toBe(true);
      for (const s of c.supportingSourceIds) expect(ids.has(s)).toBe(true);
    }
  });
});

describe("import hygiene", () => {
  it("no file under research/imports is tracked", () => {
    expect(tracked.filter((p) => p.startsWith("research/imports/"))).toEqual([]);
  });

  it("no ZIP file is tracked", () => {
    expect(tracked.filter((p) => p.toLowerCase().endsWith(".zip"))).toEqual([]);
  });

  it("no research input file supplies an ingestion timestamp", () => {
    const text = readFileSync(join(ROOT, "research/input/events.yaml"), "utf8");
    expect(text).not.toContain("ingestedAt");
    expect(text).not.toContain("observationDate");
  });
});
