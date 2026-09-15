import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { companySchema, evidenceClaimSchema, signalEventSchema } from "@/lib/schemas";

/**
 * Real-data regression tests for the Batch 2 corpus (Phase 4B ingestion).
 *
 * These lock the distinctions the Batch 2 handoff exists to protect: company
 * reported stays company reported even with journalism support, a third-party
 * estimate stays an estimate, primary is not secondary, an unconfirmed
 * financing is not completed capital, a relative growth rate is not absolute
 * revenue, customer job volume is not company revenue, and a negative security
 * event stays visible. They read the committed corpus on disk.
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

const BATCH2 = [
  ["David AI", "co-withdavid-ai"],
  ["Exa", "co-exa-ai"],
  ["Listen Labs", "co-listenlabs-com"],
  ["Rillet", "co-rillet-com"],
  ["Parallel Web Systems", "co-parallel-ai"],
  ["Braintrust", "co-braintrust-dev"],
  ["XBOW", "co-xbow-com"],
  ["Basis", "co-getbasis-ai"],
  ["Avoca", "co-avoca-ai"],
  ["Assort Health", "co-assorthealth-com"],
  ["ElevenLabs", "co-elevenlabs-io"],
  ["Vercel", "co-vercel-com"],
  ["OpenEvidence", "co-openevidence-com"],
  ["Decagon", "co-decagon-ai"],
  ["Glean", "co-glean-com"],
  ["Sierra", "co-sierra-ai"],
  ["Canva", "co-canva-com"],
  ["Lovable", "co-lovable-dev"],
  ["fal", "co-fal-ai"],
  ["Baseten", "co-baseten-co"],
] as const;
const BATCH2_IDS: string[] = BATCH2.map(([, id]) => id);

const forCompany = (id: string) => claims.filter((c) => c.companyId === id);
// These discipline checks are about sourced and derived claims. Analyst
// dimension assessments (source-less assumptions) restate the same figures in
// their prose, so they are excluded here to keep the match unambiguous.
const find = (id: string, re: RegExp) =>
  forCompany(id).find(
    (c) => re.test(c.claim) && !(c.researchAssessmentId ?? "").startsWith("b2-assess-"),
  );

describe("Batch 2 corpus shape", () => {
  it("1. the combined corpus has 39 active companies", () => {
    expect(companies.length).toBe(39);
  });

  it("2. all 20 Batch 2 companies are present, resolved by exact domain identity", () => {
    for (const [name, id] of BATCH2) {
      const c = companies.find((x) => x.id === id);
      expect(c, `${name} missing`).toBeDefined();
      expect(c?.name).toBe(name);
    }
    // Braintrust resolves to braintrust.dev, not another company of the same name.
    expect(companies.find((c) => c.id === "co-braintrust-dev")?.domain).toBe("braintrust.dev");
  });

  it("3. all 19 Batch 1 companies remain", () => {
    for (const id of [
      "co-mintlify-com", "co-dust-tt", "co-llamaindex-ai", "co-crewai-com", "co-e2b-dev",
      "co-crosby-ai", "co-arcade-dev", "co-withpace-com", "co-resend-com", "co-retellai-com",
      "co-serval-com", "co-granola-ai", "co-gamma-app", "co-appliedcompute-com", "co-modal-com",
      "co-linear-app", "co-wisprflow-ai", "co-turbopuffer-com", "co-browserbase-com",
    ]) {
      expect(companies.find((c) => c.id === id), `${id} missing`).toBeDefined();
    }
  });

  it("4. OpenRouter is absent", () => {
    for (const c of companies) {
      expect(c.name.toLowerCase()).not.toBe("openrouter");
      expect(c.domain ?? "").not.toBe("openrouter.ai");
    }
  });

  it("5. no synthetic Phase 3A company is present", () => {
    for (const c of companies) expect(c.domain ?? "").not.toContain(".example");
    for (const n of ["Northwind Ledger", "Quiet Harbor Analytics", "Harbor Atlas"]) {
      expect(companies.map((c) => c.name)).not.toContain(n);
    }
  });

  it("6. no raw Phase 4A ZIP or research/imports file is tracked", () => {
    const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    expect(tracked.filter((p) => p.startsWith("research/imports/"))).toEqual([]);
    expect(tracked.filter((p) => p.toLowerCase().endsWith(".zip"))).toEqual([]);
  });
});

describe("Batch 2 provenance and claim-origin discipline", () => {
  it("8. company-reported metrics stay company_reported even with journalism support", () => {
    for (const [id, re] of [
      ["co-canva-com", /reached \$4B ARR by the end of 2025/],
      ["co-rillet-com", /more than 600 customers/],
      ["co-sierra-ai", /more than 40% of the Fortune 50/],
      ["co-lovable-dev", /\$500M annualized revenue run-rate/],
    ] as const) {
      const c = find(id, re);
      expect(c, re.source).toBeDefined();
      expect(c?.sourceSubtype).toBe("company_reported");
    }
  });

  it("33. the strict independent-origin metric does not count management repetition", () => {
    // Canva $4B ARR reaches the corpus through a founder interview. It stays
    // company_reported, so it is never in claimsWithIndependentOriginSupport,
    // and the corpus-wide count matches the hand-checked fixture.
    const canva = find("co-canva-com", /reached \$4B ARR by the end of 2025/);
    expect(canva?.sourceSubtype).toBe("company_reported");
    const summary = JSON.parse(
      readFileSync(join(ROOT, "data/generated/research-summary.json"), "utf8"),
    ) as { metrics: { claimSupport: Record<string, number> } };
    expect(summary.metrics.claimSupport.claimsWithIndependentOriginSupport).toBe(20);
  });
});

describe("Batch 2 revenue and transaction discipline", () => {
  it("9. Avoca's $1B jobs claim is customer job volume, not revenue", () => {
    const c = find("co-avoca-ai", /\$1B in jobs/);
    expect(c?.claim).toMatch(/customer job volume, not Avoca revenue/i);
    expect(c?.numericValue).toBeNull();
  });

  it("10. Avoca's exact Series B amount stays unresolved", () => {
    const c = find("co-avoca-ai", /Exact Series B amount is not established/);
    expect(c?.provenance).toBe("unknown");
    expect(companies.find((x) => x.id === "co-avoca-ai")?.notes ?? "").toMatch(/Series B amount/i);
  });

  it("11. Glean's $300M ARR keeps its consumption/hybrid pricing caveat", () => {
    const headline = find("co-glean-com", /reported \$300M ARR in May 2026/);
    expect(headline?.modelEligibility).toBe("caveat");
    const caveat = find("co-glean-com", /consumption-based/);
    expect(caveat?.provenance).toBe("derived");
    expect(caveat?.claim).toMatch(/annualized revenue run-rate than traditional subscription ARR/i);
  });

  it("12. Lovable's $500M stays annualized revenue run-rate", () => {
    const c = find("co-lovable-dev", /\$500M annualized revenue run-rate/);
    expect(c?.claim).not.toMatch(/contracted ARR/);
    expect(c?.notes ?? "").toMatch(/not automatically contracted ARR/i);
  });

  it("13. Decagon revenue is a third-party estimate", () => {
    const c = find("co-decagon-ai", /Sacra estimates Decagon reached about \$100M/);
    expect(c?.sourceSubtype).toBe("third_party_estimate");
    expect(c?.modelEligibility).toBe("caveat");
  });

  it("14. Sierra cumulative funding is a third-party estimate", () => {
    const c = find("co-sierra-ai", /approximately \$1\.585B total funding/);
    expect(c?.sourceSubtype).toBe("third_party_estimate");
  });

  it("15. fal ~$400M revenue is a third-party estimate", () => {
    const c = find("co-fal-ai", /annualized revenue had reached about \$400M/);
    expect(c?.sourceSubtype).toBe("third_party_estimate");
    expect(c?.modelEligibility).toBe("caveat");
  });

  it("16-18. fal 2026 financing is reported_unconfirmed and separate from the Series D", () => {
    const fal = events.filter((e) => e.companyId === "co-fal-ai");
    const talks = fal.filter((e) => e.eventStatus === "reported_unconfirmed");
    expect(talks.length).toBe(1);
    expect(talks[0]?.unconfirmedNote).not.toBeNull();
    expect(talks[0]?.signalDirection).toBe("ambiguous");
    // The December 2025 Series D is a separate, completed event.
    const seriesD = fal.find(
      (e) => e.eventStatus === "completed" && /\$140M Series D/.test(e.evidenceSummary),
    );
    expect(seriesD).toBeDefined();
    // fal's totalRaised is never set from an unconfirmed round.
    expect(companies.find((c) => c.id === "co-fal-ai")?.totalRaised.provenance).toBe("unknown");
  });

  it("19. Baseten's split-priced valuation is represented", () => {
    const c = find("co-baseten-co", /split-priced across tranches at \$13B and \$11B/);
    expect(c?.sourceSubtype).toBe("reported_fact");
  });

  it("20. the Canva RVI $25M transaction is not assumed primary", () => {
    const c = find("co-canva-com", /Class A common stock/);
    expect(c?.notes ?? "").toMatch(/do not count it as company capital/i);
    expect(companies.find((x) => x.id === "co-canva-com")?.totalRaised.provenance).toBe("unknown");
  });

  it("21-23. ElevenLabs, Vercel, and Decagon tenders stay secondary and ambiguous", () => {
    for (const [id, re] of [
      ["co-elevenlabs-io", /\$100M tender/],
      ["co-vercel-com", /\$300M tender/],
      ["co-decagon-ai", /employee tender/],
    ] as const) {
      const c = find(id, re);
      expect(c?.notes ?? c?.claim, re.source).toMatch(/[Ss]econdary/);
    }
    for (const e of events.filter((x) => /tender/i.test(x.evidenceSummary))) {
      expect(e.signalDirection).toBe("ambiguous");
    }
  });

  it("24. XBOW ~$272M is derived and caveated", () => {
    const c = find("co-xbow-com", /approximately \$272M/);
    expect(c?.provenance).toBe("derived");
    expect(c?.modelEligibility).toBe("caveat");
    expect(c?.notes ?? "").toMatch(/derived/i);
  });
});

describe("Batch 2 negative events and signal discipline", () => {
  it("25-27. Braintrust, Vercel, and Lovable security events are negative", () => {
    const sec = events.filter((e) => e.signalType === "security_incident");
    expect(sec.map((e) => e.companyId).sort()).toEqual(
      ["co-braintrust-dev", "co-lovable-dev", "co-vercel-com"].sort(),
    );
    for (const e of sec) expect(e.signalDirection).toBe("negative");
  });

  it("28. OpenEvidence is not represented as conventional SaaS", () => {
    const note = companies.find((c) => c.id === "co-openevidence-com")?.notes ?? "";
    expect(note).toMatch(/free ad-supported/i);
    expect(note).toMatch(/Do not infer SaaS/i);
  });

  it("29. every funding SignalEvent stays ambiguous", () => {
    const funding = events.filter((e) => e.signalType === "funding");
    expect(funding.length).toBeGreaterThan(40);
    for (const e of funding) expect(e.signalDirection).toBe("ambiguous");
  });

  it("30. corroborating sources did not create duplicate events", () => {
    // 46 Batch 2 event candidates in, 46 Batch 2 events out.
    const b2 = events.filter((e) => e.companyId !== null && BATCH2_IDS.includes(e.companyId));
    expect(b2.length).toBe(46);
    const ids = b2.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("31. model eligibility stays conservative: no Batch 2 claim is model_input", () => {
    const b2Claims = claims.filter((c) => c.companyId !== null && BATCH2_IDS.includes(c.companyId));
    expect(b2Claims.length).toBeGreaterThan(200);
    expect(b2Claims.filter((c) => c.modelEligibility === "model_input").length).toBe(0);
  });
});

describe("Batch 2 dimension assessments", () => {
  it("7. 140 analyst dimension assessments are preserved as assessment-provenance claims", () => {
    const assess = claims.filter((c) => (c.researchAssessmentId ?? "").startsWith("b2-assess-"));
    expect(assess.length).toBe(140);
    for (const c of assess) {
      expect(c.provenance).toBe("assumption");
      expect(c.sourceSubtype).toBeNull();
      expect(c.analystInterpretation).not.toBeNull();
      expect(["supported", "mixed", "insufficient"]).toContain(c.evidenceStatus);
      // readiness language is preserved but never becomes a score
      expect(c.notes ?? "").toMatch(/readiness/i);
    }
  });

  it("readiness terms are not converted into a numeric value", () => {
    for (const c of claims.filter((c) => (c.researchAssessmentId ?? "").startsWith("b2-assess-"))) {
      expect(c.numericValue).toBeNull();
      expect(c.statedValue).toBeNull();
    }
  });

  it("34. no assessment carries an arbitrary source anchor", () => {
    const assess = claims.filter((c) => (c.researchAssessmentId ?? "").startsWith("b2-assess-"));
    expect(assess.length).toBe(140);
    for (const c of assess) {
      expect(c.sourceId).toBeNull();
      expect(c.sourceUrl).toBeNull();
      expect(c.supportingSourceIds).toEqual([]);
    }
  });

  it("35. every sourced or derived claim still resolves a real source", () => {
    const sourceIds = new Set(
      (
        JSON.parse(readFileSync(join(ROOT, "data/generated/sources.json"), "utf8")) as {
          records: Array<{ id: string }>;
        }
      ).records.map((s) => s.id),
    );
    for (const c of claims) {
      if (c.provenance === "sourced" || c.provenance === "derived") {
        expect(c.sourceId).not.toBeNull();
        expect(sourceIds.has(c.sourceId as string)).toBe(true);
      }
    }
  });

  it("36. the independent-origin metric does not count source-less assumptions", () => {
    // The count is hand-checked at 20 and every contributor is a reported_fact
    // whose primary citation is an independent outlet. Source-less assumptions
    // (all 140 assessments) can never enter it.
    const summary = JSON.parse(
      readFileSync(join(ROOT, "data/generated/research-summary.json"), "utf8"),
    ) as { metrics: { claimSupport: Record<string, number> } };
    expect(summary.metrics.claimSupport.claimsWithIndependentOriginSupport).toBe(20);
  });

  it("37. the corpus is schema version 6", () => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, "data/generated/MANIFEST.json"), "utf8"),
    ) as { entries?: Array<{ schemaVersion: number }>; files?: Array<{ schemaVersion: number }> };
    const entries = manifest.entries ?? manifest.files ?? [];
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(e.schemaVersion).toBe(6);
    for (const c of claims) expect(c.schemaVersion).toBe(6);
  });
});
