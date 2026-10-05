import Link from "next/link";
import { Badge, Card } from "./ui";
import { LISTING_LABELS, PROPERTY_LABELS, type PublicProperty } from "@/lib/property";
import { fcfa } from "@/lib/format";

const ICON = { APARTMENT: "🏢", VILLA: "🏡", STUDIO: "🛏️", LAND: "🌳", OFFICE: "💼" } as const;
export const priceText = (p: { listingType: string; priceFcfa: number }) => `${fcfa(p.priceFcfa)}${p.listingType === "RENT" ? " / mois" : ""}`;

// Les photos réelles arrivent avec le stockage de fichiers : en attendant, visuel de remplacement.
export function PropertyVisual({ type, height = 120 }: { type: keyof typeof ICON; height?: number }) {
  return <div role="img" aria-label="Photo bientôt disponible" className="flex items-center justify-center rounded-xl2 bg-gradient-to-br from-emerald-100 to-amber-100 text-5xl" style={{ height }}>{ICON[type]}</div>;
}

export function PropertyCard({ p }: { p: PublicProperty }) {
  return (
    <Link href={`/client/immobilier/${p.id}`}>
      <Card className="space-y-2">
        <PropertyVisual type={p.propertyType} />
        <div className="flex items-start justify-between gap-2"><p className="font-extrabold">{p.title}</p><Badge tone={p.listingType === "RENT" ? "green" : "amber"}>{LISTING_LABELS[p.listingType]}</Badge></div>
        <p className="text-lg font-extrabold text-emerald-800">{priceText(p)}</p>
        <p className="text-sm text-ink-soft">📍 {p.district} · {PROPERTY_LABELS[p.propertyType]}{p.bedrooms ? ` · ${p.bedrooms} ch.` : ""}{p.surfaceM2 ? ` · ${p.surfaceM2} m²` : ""}</p>
      </Card>
    </Link>
  );
}
