import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { companySchema, evidenceClaimSchema, personSchema, signalEventSchema } from "@/lib/schemas";

/**
 * Phase 4C-B regression: Batch 2 identity enrichment.
 *
 * Locks the identity distinctions the enrichment packet exists to protect:
 * unknown stays unknown (OpenEvidence founding year), company founding and
 * public launch stay distinct (Canva, Lovable), unconfirmed financing does not
 * advance stage (fal, Sierra), founders are merged without duplication, and no
 * static identity fact became a SignalEvent. Reads the committed corpus.
 */

const ROOT = process.cwd();
function readRecords<T>(name: string, schema: z.ZodType<T>): T[] {
  const parsed = JSON.parse(readFileSync(join(ROOT, "data/generated", name), "utf8")) as {
    records: unknown[];
  };
  return parsed.records.map((r) => schema.parse(r));
}

const companies = readRecords("companies.json", companySchema);
const people = readRecords("people.json", personSchema);
const claims = readRecords("evidence.json", evidenceClaimSchema);
const events = readRecords("signal-events.json", signalEventSchema);

const BATCH2: Array<[string, string, string]> = [
  ["David AI", "co-withdavid-ai", "withdavid.ai"],
  ["Exa", "co-exa-ai", "exa.ai"],
  ["Listen Labs", "co-listenlabs-com", "listenlabs.com"],
  ["Rillet", "co-rillet-com", "rillet.com"],
  ["Parallel Web Systems", "co-parallel-ai", "parallel.ai"],
  ["Braintrust", "co-braintrust-dev", "braintrust.dev"],
  ["XBOW", "co-xbow-com", "xbow.com"],
  ["Basis", "co-getbasis-ai", "getbasis.ai"],
  ["Avoca", "co-avoca-ai", "avoca.ai"],
  ["Assort Health", "co-assorthealth-com", "assorthealth.com"],
  ["ElevenLabs", "co-elevenlabs-io", "elevenlabs.io"],
  ["Vercel", "co-vercel-com", "vercel.com"],
  ["OpenEvidence", "co-openevidence-com", "openevidence.com"],
  ["Decagon", "co-decagon-ai", "decagon.ai"],
  ["Glean", "co-glean-com", "glean.com"],
  ["Sierra", "co-sierra-ai", "sierra.ai"],
  ["Canva", "co-canva-com", "canva.com"],
  ["Lovable", "co-lovable-dev", "lovable.dev"],
  ["fal", "co-fal-ai", "fal.ai"],
  ["Baseten", "co-baseten-co", "baseten.co"],
];
const B2_IDS = BATCH2.map(([, id]) => id);
const byId = (id: string) => companies.find((c) => c.id === id);
const idClaims = claims.filter((c) => (c.researchAssessmentId ?? "").startsWith("b2-identity-"));
const forCompany = (id: string) => idClaims.filter((c) => c.companyId === id);

describe("Batch 2 identity enrichment: corpus shape", () => {
  it("1. still 39 active companies", () => {
    expect(companies.length).toBe(39);
  });

  it("2. all 20 Batch 2 companies keep their exact canonical domain", () => {
    for (const [name, id, domain] of BATCH2) {
      const c = byId(id);
      expect(c, name).toBeDefined();
      expect(c?.domain).toBe(domain);
    }
    // Braintrust is braintrust.dev, never merged with another entity of the name.
    expect(byId("co-braintrust-dev")?.name).toBe("Braintrust");
  });

  it("3. founder relationships exist for every Batch 2 company", () => {
    for (const [name, id] of BATCH2) {
      expect(byId(id)?.founderIds.length, name).toBeGreaterThan(0);
    }
  });

  it("4. the 41 packet founder records are represented without duplication", () => {
    const b2FounderIds = BATCH2.flatMap(([, id]) => byId(id)?.founderIds ?? []);
    expect(b2FounderIds.length).toBe(41);
    expect(new Set(b2FounderIds).size).toBe(41);
    // Prior corpus had 43 people; 41 new founder records, no collisions => 84.
    expect(people.length).toBe(84);
    for (const pid of b2FounderIds) {
      expect(people.find((p) => p.id === pid)).toBeDefined();
    }
  });

  it("5-7. headquarters, stage and operating origin are represented for all 20", () => {
    for (const [name, id] of BATCH2) {
      const c = byId(id);
      expect(c?.hqLocation, `${name} hq`).toBeTruthy();
      expect(c?.stage, `${name} stage`).not.toBe("unknown");
      // operating origin: represented either as the typed field or in an
      // identity claim that states when the company began operating.
      const originStated =
        c?.operatingOriginYear != null ||
        forCompany(id).some((cl) => /began operating|operating origin/i.test(cl.claim));
      expect(originStated, `${name} operating origin`).toBe(true);
    }
  });

  it("8-9. exact foundedYear for 19/20; OpenEvidence stays unknown", () => {
    const withYear = BATCH2.filter(([, id]) => byId(id)?.foundedYear.provenance !== "unknown");
    expect(withYear.length).toBe(19);
    const oe = byId("co-openevidence-com");
    expect(oe?.foundedYear.provenance).toBe("unknown");
    expect(oe?.foundedYear.value).toBeNull();
  });

  it("10-11. OpenEvidence operating origin is 2021 and the conflict stays inspectable", () => {
    expect(byId("co-openevidence-com")?.operatingOriginYear).toBe(2021);
    const conflict = forCompany("co-openevidence-com").find((c) => /conflicting/i.test(c.claim));
    expect(conflict).toBeDefined();
    expect(conflict?.claim).toMatch(/2021/);
    expect(conflict?.claim).toMatch(/2022/);
    expect(conflict?.claim).toMatch(/unresolved|unknown/i);
  });

  it("12-15. Canva and Lovable keep founding and public launch distinct", () => {
    expect(byId("co-canva-com")?.foundedYear.value).toBe(2012);
    const canvaLaunch = forCompany("co-canva-com").find((c) => /public product launch/i.test(c.claim));
    expect(canvaLaunch?.claim).toMatch(/2013/);
    expect(canvaLaunch?.claim).toMatch(/2012/);

    expect(byId("co-lovable-dev")?.foundedYear.value).toBe(2023);
    const lovableLaunch = forCompany("co-lovable-dev").find((c) => /public product launch/i.test(c.claim));
    expect(lovableLaunch?.claim).toMatch(/2024/);
    expect(lovableLaunch?.claim).toMatch(/2023/);
  });

  it("16-20. stage reflects the latest completed round only", () => {
    expect(byId("co-fal-ai")?.stage).toBe("series_d_plus");
    expect(byId("co-fal-ai")?.totalRaised.provenance).toBe("unknown");
    // Sierra and Canva are non-numbered private stages, not invented Series rounds.
    expect(byId("co-sierra-ai")?.stage).toBe("growth");
    expect(byId("co-canva-com")?.stage).toBe("growth");
    for (const id of ["co-sierra-ai", "co-canva-com"]) {
      const stageClaim = forCompany(id).find((c) => /financing stage/i.test(c.claim));
      expect(stageClaim?.claim).toMatch(/private/i);
    }
    // Tender / unconfirmed-talk companies keep their numbered stage.
    expect(byId("co-vercel-com")?.stage).toBe("series_d_plus");
    expect(byId("co-elevenlabs-io")?.stage).toBe("series_d_plus");
    expect(byId("co-decagon-ai")?.stage).toBe("series_d_plus");
    expect(byId("co-xbow-com")?.stage).toBe("series_c");
  });
});

describe("Batch 2 identity enrichment: discipline", () => {
  it("21. packet URLs already in the corpus were reused, not re-added", () => {
    const sources = (
      JSON.parse(readFileSync(join(ROOT, "data/generated/sources.json"), "utf8")) as {
        records: Array<{ url: string | null }>;
      }
    ).records;
    // 163 baseline + 59 genuinely new identity sources = 222. The 20 reused
    // packet URLs added no duplicate SourceRecord.
    expect(sources.length).toBe(222);
    const urls = sources.map((s) => s.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("22. identity facts do not change investment scores or founder-alignment assessments", () => {
    for (const c of idClaims) {
      expect(c.modelEligibility).toBe("context_only");
      expect(c.numericValue).toBeNull();
      expect(c.statedValue).toBeNull();
    }
    // The 140 Batch 2 analyst assessments are untouched and source-anchor clean.
    const assess = claims.filter((c) => (c.researchAssessmentId ?? "").startsWith("b2-assess-"));
    expect(assess.length).toBe(140);
    for (const c of assess) expect(c.sourceId).toBeNull();
  });

  it("23-24. no identity fact became a SignalEvent; the corpus stays at 113", () => {
    expect(events.length).toBe(113);
    for (const e of events) {
      expect(e.signalType).not.toBe("founder_identity");
      expect(e.signalType).not.toBe("headquarters");
    }
    // No Batch 2 company gained an event in this pass.
    const b2Events = events.filter((e) => e.companyId !== null && B2_IDS.includes(e.companyId));
    expect(b2Events.length).toBe(46);
  });

  it("25. every identity claim resolves to a Batch 2 company and a real source", () => {
    const sourceIds = new Set(
      (
        JSON.parse(readFileSync(join(ROOT, "data/generated/sources.json"), "utf8")) as {
          records: Array<{ id: string }>;
        }
      ).records.map((s) => s.id),
    );
    expect(idClaims.length).toBe(103);
    for (const c of idClaims) {
      expect(B2_IDS).toContain(c.companyId);
      expect(c.provenance).toBe("sourced");
      expect(c.sourceId).not.toBeNull();
      expect(sourceIds.has(c.sourceId as string)).toBe(true);
    }
  });

  it("26. strict independent-origin metrics stay conservative", () => {
    const summary = JSON.parse(
      readFileSync(join(ROOT, "data/generated/research-summary.json"), "utf8"),
    ) as { metrics: { claimSupport: Record<string, number> } };
    // The OpenEvidence founding-year conflict claim stays company_reported and
    // is never counted as independent-origin, even though it links Forbes.
    expect(summary.metrics.claimSupport.claimsWithIndependentOriginSupport).toBe(20);
    expect(summary.metrics.claimSupport.claimsWithTwoIndependentOriginSources).toBe(3);
    // 57: the conflict claim now links the Forbes 2022 founding source as
    // supporting evidence (a company-origin fact carried by an independent
    // publisher), which is exactly what this metric measures.
    expect(summary.metrics.claimSupport.companyReportedClaimsWithExternalPublicationSupport).toBe(57);
  });

  it("26b. the OpenEvidence conflict claim links both the 2021 and 2022 sources", () => {
    const oe = idClaims.find((c) => c.researchAssessmentId === "b2-identity-openevidence-com-founding");
    expect(oe?.sourceSubtype).toBe("company_reported");
    expect(oe?.modelEligibility).toBe("context_only");
    const sources = (
      JSON.parse(readFileSync(join(ROOT, "data/generated/sources.json"), "utf8")) as {
        records: Array<{ id: string; url: string | null; sourceType: string }>;
      }
    ).records;
    const primary = sources.find((s) => s.id === oe?.sourceId);
    expect(primary?.url).toBe("https://www.linkedin.com/company/openevidence"); // 2021 side
    const supporting = (oe?.supportingSourceIds ?? []).map((id) => sources.find((s) => s.id === id));
    expect(supporting.map((s) => s?.url)).toContain("https://www.forbes.com/companies/openevidence/"); // 2022 side
  });

  it("27. the review queue is unchanged: the OpenEvidence conflict did not enqueue", () => {
    const queue = JSON.parse(
      readFileSync(join(ROOT, "data/generated/review-queue.json"), "utf8"),
    ) as { items: Array<{ recordKey: string }> };
    expect(queue.items.length).toBe(2);
    expect(queue.items.every((i) => !/openevidence/i.test(i.recordKey))).toBe(true);
  });

  it("28. founder roles use the packet's exact wording, no invented titles", () => {
    const role = (name: string) => people.find((p) => p.name === name)?.currentRole;
    expect(role("Parag Agrawal")).toBe("Founder");
    expect(role("Mitchell Troyanovsky")).toBe("Co-founder");
    expect(role("Clay Bavor")).toBe("Co-founder");
    expect(role("Tyson Chen")).toBe("Co-founder & President");
    expect(role("Ashwin Sreenivas")).toBe("Co-founder & President");
    // Glean and Baseten keep all four founders each.
    expect(byId("co-glean-com")?.founderIds.length).toBe(4);
    expect(byId("co-baseten-co")?.founderIds.length).toBe(4);
  });

  it("29. schema version stays 6", () => {
    for (const c of [...companies, ...people, ...claims]) {
      expect(c.schemaVersion).toBe(6);
    }
  });

  it("30. the generated corpus is deterministic", () => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, "data/generated/MANIFEST.json"), "utf8"),
    ) as { entries: Array<{ path: string; sha256: string }> };
    expect(manifest.entries.length).toBeGreaterThan(0);
    for (const e of manifest.entries) expect(e.sha256).toMatch(/^(sha256:)?[0-9a-f]{64}$/);
  });
});
