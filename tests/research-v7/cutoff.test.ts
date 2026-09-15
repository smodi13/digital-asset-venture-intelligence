import { describe, it, expect } from "vitest";
import { checkCutoff, isOnOrBeforeCutoff, RESEARCH_CUTOFF } from "@/lib/research-v7/dates";
import { compileBatch } from "@/lib/research-v7/compile";
import { baseCompanyPacket, baseSource } from "./fixtures";

describe("research cutoff (2026-09-10)", () => {
  it("is frozen at 2026-09-10", () => {
    expect(RESEARCH_CUTOFF).toBe("2026-09-10");
  });

  it("accepts a date on the cutoff", () => {
    expect(isOnOrBeforeCutoff("2026-09-10")).toBe(true);
  });

  it("rejects a date after the cutoff", () => {
    expect(isOnOrBeforeCutoff("2026-09-11")).toBe(false);
  });

  it("availabilityDate is decisive: missing availabilityDate fails even with an on-time publicationDate", () => {
    const result = checkCutoff({ publicationDate: "2026-08-01", availabilityDate: null });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("availability_date_missing");
  });

  it("does not infer availabilityDate from publicationDate", () => {
    // A source with an on-time publicationDate and no availabilityDate is
    // leakage-unproven, not automatically eligible.
    const a = checkCutoff({ publicationDate: "2026-01-01", availabilityDate: null });
    const b = checkCutoff({ publicationDate: "2026-01-01", availabilityDate: "2026-01-01" });
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(true);
  });

  it("publication/availability distinction: an after-cutoff publicationDate fails even with an on-time availabilityDate", () => {
    const result = checkCutoff({ publicationDate: "2026-09-15", availabilityDate: "2026-09-01" });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("publication_date_after_cutoff");
  });

  it("rejects a batch with a source that leaked past the cutoff (case K)", () => {
    const packet = baseCompanyPacket({
      sources: [baseSource({ availabilityDate: "2026-09-15" })],
    });
    const result = compileBatch([{ label: "leaky", raw: packet }], { batch: "SYNTHETIC" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "cutoff_leakage")).toBe(true);
  });

  it("rejects a packet whose researchCutoff does not match the frozen cutoff", () => {
    const packet = baseCompanyPacket({ researchCutoff: "2026-01-01" });
    const result = compileBatch([{ label: "wrong-cutoff", raw: packet }], {
      batch: "SYNTHETIC",
      contract: {
        byCandidateId: new Map([
          ["cand-synthetic-001", { candidateId: "cand-synthetic-001", canonicalName: "Synthetic Widgets Inc", category: null, entityType: "company", assetType: "equity" }],
        ]),
        cohortByCandidateId: new Map(),
      },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "cutoff_mismatch")).toBe(true);
  });
});
