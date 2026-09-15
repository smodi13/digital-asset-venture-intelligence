/**
 * Evidence CSV: the machine/analyst-friendly underlying evidence table for one
 * company. One row per EvidenceClaim x criterion relationship (supporting rows
 * and reviewed-but-excluded rows).
 *
 * Consumes ONLY the sanctioned production read model (CompanyScreeningDetail).
 * No scoring is done here. No raw article body is emitted. Missing values are
 * empty fields, never the string "null".
 */

import type { CompanyScreeningDetail, ClaimRef, SourceRef } from "@/lib/screening-read";
import { THESIS_DIMENSION_LABEL } from "@/lib/schemas/thesis-configuration";
import { criterionLabel } from "@/lib/ui/format";
import { toCsv } from "./csv";

export const EVIDENCE_CSV_HEADER = [
  "company_id",
  "company_name",
  "dimension",
  "criterion",
  "included_or_excluded",
  "claim_id",
  "claim_text",
  "claim_status",
  "source_id",
  "source_publisher",
  "source_title",
  "source_type",
  "source_published_at",
  "source_url",
  "origin_lineage",
  "criterion_raw_anchor",
  "criterion_adjusted_score",
  "criterion_coverage",
  "criterion_confidence_pct",
  "contradiction_state",
] as const;

/** Claim-level status derived from the read model's contradiction fields only. */
function claimStatus(c: ClaimRef): string {
  const conflicted = c.contradicts.length > 0 || c.contradictedBy.length > 0;
  if (!conflicted) return "ok";
  return c.contradictionNote ? "contradicted_noted" : "contradicted_unresolved";
}

/** Safe public URL only: drop file: and anything not http(s). */
function publicUrl(url: string | null): string {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : "";
}

export function buildEvidenceCsv(detail: CompanyScreeningDetail): string {
  const sourceById = new Map<string, SourceRef>(detail.citedSources.map((s) => [s.sourceId, s]));
  const rows: Array<Array<string | number | null | undefined>> = [];

  for (const crit of detail.criteria) {
    const emit = (claim: ClaimRef, inclusion: "included" | "excluded") => {
      const src = claim.sourceId ? sourceById.get(claim.sourceId) : undefined;
      rows.push([
        detail.identity.companyId,
        detail.identity.name,
        THESIS_DIMENSION_LABEL[crit.dimension],
        criterionLabel(crit.criterionId),
        inclusion,
        claim.claimId,
        claim.claim,
        claimStatus(claim),
        claim.sourceId ?? "",
        src?.publisher ?? "",
        src?.title ?? "",
        src?.sourceType ?? "",
        src?.publishedAt ?? "",
        publicUrl(src?.url ?? null),
        src?.originatesFrom ?? "",
        crit.rawAnchor ?? "",
        Math.round(crit.adjustedScore),
        crit.coverage,
        Math.round(crit.confidence * 100),
        crit.contradiction,
      ]);
    };
    for (const claim of crit.supportingClaims) emit(claim, "included");
    for (const claim of crit.reviewedButExcludedClaims) emit(claim, "excluded");
  }

  return toCsv([...EVIDENCE_CSV_HEADER], rows);
}

/** Deterministic, sanitised download filename. */
export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "company";
}
