import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { ActionButton } from "@/components/AdminControls";
import { priceText } from "@/components/PropertyCard";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { adminListProperties, LISTING_LABELS, PROPERTY_LABELS } from "@/lib/property";
import { propertyActiveAction } from "../actions";

export default async function AdminProperties() {
  const admin = await requireRole("ADMIN");
  const items = await adminListProperties(admin.id);
  return (
    <AdminShell title="Immobilier">
      <div className="flex gap-2"><ButtonLink href="/admin/immobilier/nouveau" className="flex-1">+ Nouvelle annonce</ButtonLink><ButtonLink href="/admin/visites" variant="outline">Visites</ButtonLink></div>
      <ul className="space-y-2">{items.map((p) => (
        <li key={p.id}><Card className="space-y-2">
          <div className="flex items-start justify-between gap-2"><Link href={`/admin/immobilier/${p.id}`} className="font-extrabold underline">{p.title}</Link><Badge tone={p.isActive ? "green" : "gray"}>{p.isActive ? "Active" : "Désactivée"}</Badge></div>
          <p className="text-sm text-ink-soft">{LISTING_LABELS[p.listingType]} · {PROPERTY_LABELS[p.propertyType]} · {p.district} · {priceText(p)} · {p._count.visits} visite(s)</p>
          <ActionButton label={p.isActive ? "Désactiver" : "Activer"} action={propertyActiveAction.bind(null, p.id, !p.isActive)} />
        </Card></li>
      ))}</ul>
    </AdminShell>
  );
}
