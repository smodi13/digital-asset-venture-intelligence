import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyDirectory, getCompanyBySlug } from "@/lib/digital-asset-product";
import { ProductCompanyDetail } from "@/components/company/ProductCompanyDetail";

export const dynamic = "force-static";

export function generateStaticParams() {
  return getCompanyDirectory().map((c) => ({ id: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = getCompanyBySlug(id);
  return { title: c ? `${c.name} - Digital Asset Venture Intelligence` : "Company not found" };
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = getCompanyBySlug(id);
  if (!company) notFound();
  return <ProductCompanyDetail company={company} />;
}
