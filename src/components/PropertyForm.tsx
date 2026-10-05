"use client";
import { useActionState } from "react";
import { Button, Field, FormError } from "@/components/ui";
import { propertyAction } from "@/app/admin/actions";
import { PROPERTY_LABELS } from "@/lib/property";
import { ZONES } from "@/lib/zones";
import type { FormState } from "@/lib/session-actions";

type Init = { title: string; listingType: string; propertyType: string; priceFcfa: number | ""; bedrooms: number | ""; surfaceM2: number | ""; district: string; exactAddress: string; description: string };
export const EMPTY_PROPERTY: Init = { title: "", listingType: "RENT", propertyType: "APARTMENT", priceFcfa: "", bedrooms: "", surfaceM2: "", district: "", exactAddress: "", description: "" };

export function PropertyForm({ id, init }: { id: string | null; init: Init }) {
  const [state, action, pending] = useActionState<FormState, FormData>(propertyAction.bind(null, id), {});
  const e = state.errors ?? {};
  const sel = "min-h-12 w-full rounded-xl2 border-2 border-emerald-100 bg-white px-4";
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={e.form} />
      <Field name="title" label="Titre de l'annonce" defaultValue={init.title} error={e.title} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><label htmlFor="listingType" className="block text-sm font-bold">Annonce</label><select id="listingType" name="listingType" defaultValue={init.listingType} className={sel}><option value="RENT">À louer</option><option value="SALE">À vendre</option></select></div>
        <div className="space-y-1"><label htmlFor="propertyType" className="block text-sm font-bold">Type de bien</label><select id="propertyType" name="propertyType" defaultValue={init.propertyType} className={sel}>{Object.entries(PROPERTY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      <Field name="priceFcfa" label="Prix en FCFA (loyer mensuel ou prix de vente)" type="number" min={1} defaultValue={init.priceFcfa} error={e.priceFcfa} />
      <div className="grid grid-cols-2 gap-3"><Field name="bedrooms" label="Chambres" type="number" min={0} defaultValue={init.bedrooms} error={e.bedrooms} /><Field name="surfaceM2" label="Surface (m²)" type="number" min={1} defaultValue={init.surfaceM2} error={e.surfaceM2} /></div>
      <div className="space-y-1"><label htmlFor="district" className="block text-sm font-bold">Quartier (affiché publiquement)</label>
        <select id="district" name="district" defaultValue={init.district} className={sel}><option value="" disabled>Choisir</option>{Object.entries(ZONES).map(([z, ds]) => <optgroup key={z} label={z}>{ds.map((d) => <option key={d}>{d}</option>)}</optgroup>)}</select>
        {e.district && <p role="alert" className="text-sm font-semibold text-red-600">{e.district}</p>}</div>
      <Field name="exactAddress" label="Adresse exacte (jamais publiée)" defaultValue={init.exactAddress} error={e.exactAddress} hint="Communiquée au client seulement après confirmation de sa visite." />
      <div className="space-y-1"><label htmlFor="description" className="block text-sm font-bold">Description</label>
        <textarea id="description" name="description" rows={5} defaultValue={init.description} className="w-full rounded-xl2 border-2 border-emerald-100 p-3" aria-invalid={!!e.description} />
        {e.description && <p role="alert" className="text-sm font-semibold text-red-600">{e.description}</p>}</div>
      <p className="text-sm text-ink-soft">Photos : l'envoi d'images sera disponible avec le stockage de fichiers.</p>
      <Button type="submit" className="w-full" disabled={pending}>Enregistrer l'annonce</Button>
    </form>
  );
}
