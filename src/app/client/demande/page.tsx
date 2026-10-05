import { ClientShell } from "@/components/ClientShell";
import { NewRequestForm } from "@/components/NewRequestForm";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { ZONES } from "@/lib/zones";
import { getKeurRules } from "@/lib/keur";

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ service?: string; mode?: string }> }) {
  const user = await requireRole("CLIENT");
  const sp = await searchParams;
  const rows = await db.service.findMany({ where: { isActive: true, category: { isLaunch: true, isActive: true } }, orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }] });
  const services = rows.map((s) => ({ slug: s.slug, name: s.name, allowsUrgent: s.allowsUrgent, quote: s.priceMode === "QUOTE_AFTER_DIAGNOSIS", base: s.basePriceFcfa, transportFee: s.transportFeeFcfa }));
  const [points, rules] = await Promise.all([db.keurPoints.findUnique({ where: { userId: user.id } }), getKeurRules()]);
  return <ClientShell title="Demander un service"><NewRequestForm services={services} zones={ZONES} initial={sp} keur={{ balance: points?.balance ?? 0, rules }} /></ClientShell>;
}
