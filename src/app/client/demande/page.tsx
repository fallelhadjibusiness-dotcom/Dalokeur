import { ClientShell } from "@/components/ClientShell";
import { NewRequestForm } from "@/components/NewRequestForm";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { ZONES } from "@/lib/zones";

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ service?: string; mode?: string }> }) {
  await requireRole("CLIENT");
  const sp = await searchParams;
  const rows = await db.service.findMany({ where: { isActive: true, category: { isLaunch: true, isActive: true } }, orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }] });
  const services = rows.map((s) => ({ slug: s.slug, name: s.name, allowsUrgent: s.allowsUrgent, quote: s.priceMode === "QUOTE_AFTER_DIAGNOSIS", base: s.basePriceFcfa }));
  return <ClientShell title="Demander un service"><NewRequestForm services={services} zones={ZONES} initial={sp} /></ClientShell>;
}
