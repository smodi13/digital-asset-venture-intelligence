import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getCompanyScreeningDetail,
  getScreeningReadModelMeta,
  getCompanyDirectory,
} from "@/lib/screening-read";
import { THESIS_DIMENSION_LABEL } from "@/lib/schemas/thesis-configuration";
import { criterionLabel } from "@/lib/ui/format";
import { Brief } from "@/app/companies/[id]/brief/Brief";
import { GET, generateStaticParams } from "@/app/companies/[id]/export/evidence/route";
import { SCREENING_CRITERION_IDS } from "@/lib/scoring/screening";

const meta = getScreeningReadModelMeta();
const FIXED_TS = "2026-09-08T12:00:00.000Z";

function render(companyId: string): string {
  const detail = getCompanyScreeningDetail(companyId)!;
  return renderToStaticMarkup(
    createElement(Brief, { detail, meta, generatedAt: FIXED_TS }),
  );
}

const WELL_COVERED = "co-linear-app";
const INSUFFICIENT = "co-avoca-ai";
const LOW_COV_HIGH_CONF = "co-xbow-com";
const NEGATIVE_SIGNAL = "co-braintrust-dev";
const REPORTED_UNCONFIRMED = "co-appliedcompute-com";

const html = render(WELL_COVERED);

describe("Screening Brief - identity and framing", () => {
  const detail = getCompanyScreeningDetail(WELL_COVERED)!;

  it("carries the correct company identity and the Screening Brief label", () => {
    expect(html).toContain("Screening Brief");
    expect(html).toContain(detail.identity.name);
  });

  it("is not framed as an investment memo or recommendation", () => {
    expect(html).toContain("Not an investment recommendation");
    expect(html).toContain("no investment recommendation");
    expect(html).not.toMatch(/\bIC Memo\b/i);
    expect(html).not.toMatch(/\binvestment memo\b(?!,? and not)/i);
    expect(html).not.toMatch(/investment committee/i);
  });

  it("matches the read model's Fit / Coverage / Confidence", () => {
    expect(html).toContain(`${Math.round(detail.screeningThesisFit)} / 100`);
    expect(html).toContain(`${Math.round(detail.overallEvidenceCoverage * 100)}%`);
    expect(html).toContain(`${Math.round(detail.overallEvidenceConfidence * 100)}%`);
  });

  it("states Mandate NOT_ASSESSED and does not assert full evidence eligibility", () => {
    expect(html).toContain("NOT_ASSESSED");
    expect(html).toContain("Unresolved");
    // never asserts a positive eligibility verdict
    expect(html).not.toMatch(/status[:\s]+ELIGIBLE|is ELIGIBLE\b|Mandate[:\s]+ELIGIBLE/i);
    expect(html).not.toMatch(/investment eligible|qualified investment|\bapproved\b/i);
  });

  it("uses the sanctioned evidence-bar wording", () => {
    expect(html).toMatch(/Meets Screening evidence bar|Does not yet meet Screening evidence bar/);
  });
});

describe("Screening Brief - analytical completeness", () => {
  it("represents all 7 dimensions", () => {
    for (const label of Object.values(THESIS_DIMENSION_LABEL)) {
      expect(html).toContain(label);
    }
  });

  it("represents all 14 criteria", () => {
    expect(SCREENING_CRITERION_IDS.size).toBe(14);
    for (const id of SCREENING_CRITERION_IDS) {
      expect(html).toContain(criterionLabel(id).replace(/&/g, "&amp;"));
    }
  });

  it("distinguishes the human raw anchor from the deterministic adjusted score", () => {
    expect(html).toMatch(/human anchor/);
    expect(html).toMatch(/adjusted/);
    expect(html).toContain("Analyst rationale (human judgment)");
  });

  it("includes an evidence-gaps section and research questions", () => {
    expect(html).toContain("Evidence gaps");
    expect(html).toContain("Research questions");
  });

  it("includes a numbered source appendix and the provenance chain", () => {
    expect(html).toContain("Source appendix");
    expect(html).toContain("EvidenceClaim");
    const detail = getCompanyScreeningDetail(WELL_COVERED)!;
    expect(detail.citedSources.length).toBeGreaterThan(0);
    // in-text reference to source #1 appears somewhere in the criterion detail
    expect(html).toMatch(/\[1(,|\])/);
  });

  it("carries a methodology / limitations note that stands alone", () => {
    expect(html).toContain("Methodology and limitations");
    expect(html).toContain("deterministic");
    expect(html).toContain("neutral");
    expect(html).toContain("public data only");
  });
});

describe("Screening Brief - prohibited content", () => {
  for (const id of [WELL_COVERED, INSUFFICIENT, LOW_COV_HIGH_CONF, NEGATIVE_SIGNAL, REPORTED_UNCONFIRMED]) {
    it(`${id}: exposes no Priority / rank / Momentum / Convergence value or verdict`, () => {
      const h = render(id);
      // no priority / rank presented as a value
      expect(h).not.toMatch(/Priority[:\s]+\d/i);
      expect(h).not.toMatch(/Priority score/i);
      expect(h).not.toMatch(/\bRank(ed)?[:\s]+#?\d/i);
      expect(h).not.toMatch(/#\d+\s+of\s+\d+/i);
      // no productionised temporal scores
      expect(h).not.toMatch(/Momentum(\s+score)?[:\s]+[\d.]/i);
      expect(h).not.toMatch(/Convergence(\s+score)?[:\s]+[\d.]/i);
      // no investment verdict vocabulary
      expect(h).not.toMatch(/\bTop Pick\b|\bconviction\b|\brecommend to invest\b|\bbuy \/ pass\b/i);
      expect(h).not.toMatch(/Fit[:\s]+(high|medium|low|strong|weak)\b|(high|medium|low)\s+Fit\b/i);
      // the required disclaimers ARE present
      expect(h).toContain("no Fit band");
    });
  }
});

describe("Screening Brief - display states and signals", () => {
  it("INSUFFICIENT_EVIDENCE company is shown as such", () => {
    const h = render(INSUFFICIENT);
    expect(h).toContain("Insufficient evidence");
  });

  it("low-coverage / high-confidence company keeps the two measures separate", () => {
    const detail = getCompanyScreeningDetail(LOW_COV_HIGH_CONF)!;
    const h = render(LOW_COV_HIGH_CONF);
    expect(detail.overallEvidenceCoverage).toBeLessThan(detail.overallEvidenceConfidence);
    expect(h).toContain(`${Math.round(detail.overallEvidenceCoverage * 100)}%`);
    expect(h).toContain(`${Math.round(detail.overallEvidenceConfidence * 100)}%`);
  });

  it("preserves negative signals explicitly", () => {
    const detail = getCompanyScreeningDetail(NEGATIVE_SIGNAL)!;
    expect(detail.signalEvents.some((e) => e.signalDirection.toLowerCase() === "negative")).toBe(true);
    const h = render(NEGATIVE_SIGNAL);
    expect(h).toMatch(/negative signal/i);
  });

  it("preserves reported-unconfirmed status labelling", () => {
    const detail = getCompanyScreeningDetail(REPORTED_UNCONFIRMED)!;
    expect(detail.signalEvents.some((e) => e.eventStatus === "reported_unconfirmed")).toBe(true);
    const h = render(REPORTED_UNCONFIRMED);
    expect(h).toContain("reported, unconfirmed");
  });

  it("is deterministic for a fixed company and timestamp", () => {
    expect(render(WELL_COVERED)).toBe(html);
  });
});

describe("Evidence export route security", () => {
  it("lists exactly the corpus companies as static params", () => {
    const params = generateStaticParams();
    expect(params).toHaveLength(39);
    expect(params.map((p) => p.id).sort()).toEqual(
      getCompanyDirectory().map((c) => c.companyId).sort(),
    );
  });

  it("returns 404 for an unknown company id", async () => {
    const res = await GET(new Request("http://test/x"), {
      params: Promise.resolve({ id: "co-not-a-real-company" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns a CSV attachment for a known company id", async () => {
    const res = await GET(new Request("http://test/x"), {
      params: Promise.resolve({ id: WELL_COVERED }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("davi-linear-evidence.csv");
    const body = await res.text();
    expect(body.split("\r\n")[0]).toContain("company_id");
  });
});

describe("read-model / firewall guarantees for export", () => {
  it("read-model meta still reports zero persisted score snapshots", () => {
    expect(meta.persistedScoreSnapshots).toBe(0);
  });
});
