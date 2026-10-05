import { notFound } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { PropertyForm } from "@/components/PropertyForm";
import { requireRole } from "@/lib/guards";
import { adminGetProperty } from "@/lib/property";

export default async function EditProperty({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole("ADMIN");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const p = await adminGetProperty(admin.id, id);
  if (!p) notFound();
  return <AdminShell title="Modifier l'annonce"><PropertyForm id={p.id} init={{ title: p.title, listingType: p.listingType, propertyType: p.propertyType, priceFcfa: p.priceFcfa, bedrooms: p.bedrooms ?? "", surfaceM2: p.surfaceM2 ?? "", district: p.district, exactAddress: p.exactAddress ?? "", description: p.description }} /></AdminShell>;
}
