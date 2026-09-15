import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCompanyDirectory,
  getCompanyScreeningDetail,
  getScreeningReadModelMeta,
} from "@/lib/screening-read";
import { Brief } from "./Brief";
import { BriefActions } from "./PrintButton";
import "./brief.css";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return getCompanyDirectory().map((c) => ({ id: c.companyId }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const d = getCompanyScreeningDetail(id);
  return { title: d ? `${d.identity.name} - Screening Brief` : "Company not found" };
}

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = getCompanyScreeningDetail(id);
  if (!detail) notFound();
  const meta = getScreeningReadModelMeta();

  return (
    <>
      <BriefActions companyId={id} csvHref={`/companies/${id}/export/evidence`} />
      <Brief detail={detail} meta={meta} generatedAt={new Date().toISOString()} />
    </>
  );
}
