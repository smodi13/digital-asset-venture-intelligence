/**
 * The canonical researched companies, as the sourcing matcher needs them.
 *
 * Server-only. Reads the committed generated corpus with node:fs, exactly as
 * lib/screening-read does, and never writes it. Sourcing only reads canonical
 * data to answer "is this candidate already a researched company".
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ResolvableCompany } from "@/lib/research/entity/resolve";

interface CompanyRecord {
  id: string;
  name: string;
  domain: string | null;
  aliases?: string[];
}

let cached: ResolvableCompany[] | null = null;

export function loadCanonicalCompanies(): ResolvableCompany[] {
  if (cached) return cached;
  const path = join(process.cwd(), "data", "generated", "companies.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { records: CompanyRecord[] };
  cached = parsed.records.map((c) => ({
    id: c.id,
    name: c.name,
    domain: c.domain ?? null,
    aliases: c.aliases ?? [],
  }));
  return cached;
}

/** Test-only: drop the in-process memoisation. */
export function __resetCanonicalCache(): void {
  cached = null;
}
