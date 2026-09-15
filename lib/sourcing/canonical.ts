/**
 * The canonical researched companies, as the sourcing matcher needs them.
 *
 * Server-only. Sourced from lib/digital-asset-product, the one sanctioned
 * read layer over the authoritative, shipped 44-company v7 product corpus
 * (data/v7-product/companies.v7.json) - the same data the Companies,
 * Worklist, and Market Map pages read. Sourcing never reads a second,
 * separately-maintained company list: doing so let it drift to the older
 * 39-company research/v6 corpus that lib/screening-read still serves to the
 * frozen Brief pages. This module only reads; it never writes the corpus.
 *
 * The id exposed here is the product slug (e.g. "aethir"), not the internal
 * entityId ("co-aethir"), because it is what a sourcing candidate's
 * "Already researched" link needs to resolve on /companies/[id].
 */

import { listCompanies } from "@/lib/digital-asset-product";
import type { ResolvableCompany } from "@/lib/research/entity/resolve";

let cached: ResolvableCompany[] | null = null;

export function loadCanonicalCompanies(): ResolvableCompany[] {
  if (cached) return cached;
  cached = listCompanies().map((c) => ({
    id: c.slug,
    name: c.name,
    domain: c.domain,
    aliases: [],
  }));
  return cached;
}

/** Test-only: drop the in-process memoisation. */
export function __resetCanonicalCache(): void {
  cached = null;
}
