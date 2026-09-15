/**
 * GET /companies/:id/export/evidence  ->  text/csv download
 *
 * Structured Evidence export for one company. Deterministic: consumes only the
 * production Screening read model and the committed corpus. No LLM, no live
 * fetch, no scoring recomputation beyond the sanctioned read path.
 *
 * Route security: `id` is matched against the fixed set of corpus company ids
 * (generateStaticParams + dynamicParams=false). Any other id is a 404. No path,
 * URL, or file argument is read from the request.
 */

import { getCompanyDirectory, getCompanyScreeningDetail } from "@/lib/screening-read";
import { buildEvidenceCsv, slugify } from "@/lib/export/evidence-csv";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return getCompanyDirectory().map((c) => ({ id: c.companyId }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = getCompanyScreeningDetail(id);
  if (!detail) return new Response("Not found", { status: 404 });

  const csv = buildEvidenceCsv(detail);
  const filename = `davi-${slugify(detail.identity.name)}-evidence.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
