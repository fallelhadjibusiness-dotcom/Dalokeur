import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientShell } from "@/components/ClientShell";
import { DynamicMap } from "@/components/DynamicMap";
import { priceText, PropertyVisual } from "@/components/PropertyCard";
import { RequestVisitForm } from "@/components/VisitForms";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { getPublicProperty, LISTING_LABELS, PROPERTY_LABELS, VISIT_LABELS } from "@/lib/property";

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("CLIENT");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const p = await getPublicProperty(id);
  if (!p) notFound();
  const active = await db.propertyVisit.findFirst({ where: { propertyId: id, clientId: user.id, status: { in: ["REQUESTED", "CONFIRMED"] } }, select: { id: true, status: true } });
  return (
    <ClientShell title={p.title}>
      <PropertyVisual type={p.propertyType} height={180} />
      <div className="flex items-center justify-between"><p className="text-2xl font-extrabold text-emerald-800">{priceText(p)}</p><Badge tone={p.listingType === "RENT" ? "green" : "amber"}>{LISTING_LABELS[p.listingType]}</Badge></div>
      <Card className="space-y-1">
        <p className="font-bold">{PROPERTY_LABELS[p.propertyType]}{p.bedrooms ? ` · ${p.bedrooms} chambre(s)` : ""}{p.surfaceM2 ? ` · ${p.surfaceM2} m²` : ""}</p>
        <p className="text-sm text-ink-soft">📍 {p.district} (localisation approximative)</p>
        <p className="pt-2">{p.description}</p>
      </Card>
      {p.approxLat != null && p.approxLng != null && <DynamicMap center={{ lat: p.approxLat, lng: p.approxLng }} zoom={14} height={200} ariaLabel="Carte : zone approximative du bien" approx={{ lat: p.approxLat, lng: p.approxLng, radiusM: 500 }} />}
      <p className="rounded-xl2 bg-cream-100 p-3 text-sm">🔒 L'adresse exacte est communiquée après validation de votre visite par notre agence.</p>
      {active ? (
        <Card className="space-y-2"><p className="font-bold">Vous avez déjà une demande de visite : <Badge>{VISIT_LABELS[active.status]}</Badge></p><Link href={`/client/immobilier/visites/${active.id}`} className="font-bold text-emerald-700 underline">Suivre ma demande</Link></Card>
      ) : <RequestVisitForm propertyId={p.id} />}
    </ClientShell>
  );
}
