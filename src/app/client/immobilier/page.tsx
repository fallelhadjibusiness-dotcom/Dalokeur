import Link from "next/link";
import { ClientShell } from "@/components/ClientShell";
import { PropertyCard } from "@/components/PropertyCard";
import { Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { PROPERTY_LABELS, searchProperties, type PropertyFilters } from "@/lib/property";
import { ZONES } from "@/lib/zones";

export default async function RealEstatePage({ searchParams }: { searchParams: Promise<PropertyFilters> }) {
  await requireRole("CLIENT");
  const f = await searchParams;
  const type = f.type === "SALE" ? "SALE" : "RENT";
  const items = await searchProperties(f);
  const sel = "min-h-11 w-full rounded-xl2 border-2 border-emerald-100 bg-white px-3 text-sm";
  return (
    <ClientShell title="Agence immobilière">
      <div role="tablist" aria-label="Type d'annonce" className="grid grid-cols-2 gap-2">
        {([["RENT", "Louer"], ["SALE", "Acheter"]] as const).map(([t, l]) => (
          <Link key={t} role="tab" aria-selected={type === t} href={`/client/immobilier?type=${t}`} className={`flex min-h-12 items-center justify-center rounded-xl2 font-bold ${type === t ? "bg-emerald-600 text-white" : "bg-white text-emerald-800"}`}>{l}</Link>
        ))}
      </div>
      <form className="grid grid-cols-2 gap-2" aria-label="Filtres">
        <input type="hidden" name="type" value={type} />
        <select name="kind" defaultValue={f.kind ?? ""} aria-label="Type de bien" className={sel}><option value="">Tous types de bien</option>{Object.entries(PROPERTY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select name="district" defaultValue={f.district ?? ""} aria-label="Quartier" className={sel}><option value="">Tous quartiers</option>{Object.entries(ZONES).map(([z, ds]) => <optgroup key={z} label={z}>{ds.map((d) => <option key={d}>{d}</option>)}</optgroup>)}</select>
        <input name="min" inputMode="numeric" defaultValue={f.min} placeholder="Budget min (FCFA)" aria-label="Budget minimum" className={sel} />
        <input name="max" inputMode="numeric" defaultValue={f.max} placeholder="Budget max (FCFA)" aria-label="Budget maximum" className={sel} />
        <select name="sort" defaultValue={f.sort ?? ""} aria-label="Tri" className={`${sel} col-span-2`}><option value="">Plus récentes</option><option value="price_asc">Prix croissant</option><option value="price_desc">Prix décroissant</option></select>
        <button className="col-span-2 min-h-11 rounded-xl2 bg-emerald-600 font-bold text-white">Filtrer</button>
      </form>
      <Link href="/client/immobilier/visites" className="block text-center font-bold text-emerald-700 underline">Mes demandes de visite</Link>
      <p className="text-sm text-ink-soft">{items.length} annonce(s). Les adresses exactes sont communiquées après validation de la visite.</p>
      {items.length === 0 ? <Card>Aucune annonce ne correspond à votre recherche.</Card> : <ul className="space-y-3">{items.map((p) => <li key={p.id}><PropertyCard p={p} /></li>)}</ul>}
    </ClientShell>
  );
}
