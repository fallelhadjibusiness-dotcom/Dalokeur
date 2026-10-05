"use client";
import { useActionState, useState } from "react";
import { Button, Card, Field, FormError } from "@/components/ui";
import { RequestPhotos } from "@/components/RequestPhotos";
import { LocationPicker } from "@/components/LocationPicker";
import { computeQuote, type KeurRules } from "@/lib/pricing";
import { fcfa } from "@/lib/format";
import { createRequestAction } from "@/app/client/actions";
import type { FormState } from "@/lib/session-actions";

type Svc = { slug: string; name: string; allowsUrgent: boolean; quote: boolean; base: number | null; transportFee: number | null };

export function NewRequestForm({ services, zones, initial, keur }: { services: Svc[]; zones: Record<string, string[]>; initial: { service?: string; mode?: string }; keur: { balance: number; rules: KeurRules } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createRequestAction, {});
  const e = state.errors ?? {};
  const [slug, setSlug] = useState(services.find((s) => s.slug === initial.service)?.slug ?? services[0]?.slug);
  const svc = services.find((s) => s.slug === slug)!;
  const [mode, setMode] = useState(initial.mode === "URGENT" && svc?.allowsUrgent ? "URGENT" : "SCHEDULED");
  const effectiveMode = svc.allowsUrgent ? mode : "SCHEDULED";
  const [district, setDistrict] = useState("");
  const [useKeur, setUseKeur] = useState(false);
  const [touched, setTouched] = useState(false); // le client a choisi lui-même : on ne le corrige plus
  const quote = computeQuote({ priceMode: svc.quote ? "QUOTE_AFTER_DIAGNOSIS" : "FIXED_ESTIMATE", estimateFcfa: svc.quote ? null : svc.base, transportFeeFcfa: svc.transportFee, balance: keur.balance, wantPoints: useKeur, rules: keur.rules });
  const sel = "min-h-12 w-full rounded-xl2 border-2 border-emerald-100 bg-white px-4";

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={e.form} />
      <div className="space-y-1">
        <label htmlFor="serviceSlug" className="block text-sm font-bold">1. Service</label>
        <select id="serviceSlug" name="serviceSlug" value={slug} onChange={(ev) => setSlug(ev.target.value)} className={sel}>
          {services.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
        </select>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold">2. Quand ?</legend>
        {svc.allowsUrgent && (
          <label className="flex min-h-12 items-center gap-3 rounded-xl2 border-2 border-emerald-100 bg-white px-4">
            <input type="radio" name="mode" value="URGENT" checked={effectiveMode === "URGENT"} onChange={() => setMode("URGENT")} className="h-5 w-5 accent-emerald-600" />
            <span><b>Intervention urgente</b><br /><span className="text-sm text-ink-soft">Un prestataire dès que possible</span></span>
          </label>
        )}
        <label className="flex min-h-12 items-center gap-3 rounded-xl2 border-2 border-emerald-100 bg-white px-4">
          <input type="radio" name="mode" value="SCHEDULED" checked={effectiveMode === "SCHEDULED"} onChange={() => setMode("SCHEDULED")} className="h-5 w-5 accent-emerald-600" />
          <b>Réserver un créneau</b>
        </label>
        {effectiveMode === "SCHEDULED" && <Field name="scheduledAt" label="Date et heure" type="datetime-local" error={e.scheduledAt} />}
        {e.mode && <p role="alert" className="text-sm font-semibold text-red-600">{e.mode}</p>}
      </fieldset>

      <div className="space-y-1">
        <label htmlFor="description" className="block text-sm font-bold">3. Votre besoin</label>
        <textarea id="description" name="description" rows={4} placeholder="Ex : fuite d'eau sous l'évier de la cuisine" className={`${sel} py-3`} aria-invalid={!!e.description} />
        {e.description && <p role="alert" className="text-sm font-semibold text-red-600">{e.description}</p>}
      </div>
      <RequestPhotos error={e.photos} />

      <fieldset className="space-y-3">
        <legend className="text-sm font-bold">4. Où ?</legend>
        <LocationPicker onDistrictSuggest={(d) => { if (!touched) setDistrict(d); }} serverError={e.location} />
        <div className="space-y-1">
          <label htmlFor="district" className="block text-sm font-bold">Quartier</label>
          <select id="district" name="district" value={district} onChange={(ev) => { setDistrict(ev.target.value); setTouched(true); }} className={sel} aria-invalid={!!e.district}>
            <option value="" disabled>Choisir un quartier</option>
            {Object.entries(zones).map(([z, ds]) => <optgroup key={z} label={z}>{ds.map((d) => <option key={d}>{d}</option>)}</optgroup>)}
          </select>
          {e.district && <p role="alert" className="text-sm font-semibold text-red-600">{e.district}</p>}
        </div>
        <Field name="addressLine" label="Adresse" placeholder="Rue, numéro, villa…" error={e.addressLine} />
        <Field name="landmark" label="Point de repère" placeholder="Ex : derrière la mosquée, porte bleue" hint="Très utile à Dakar et Pikine pour vous trouver." error={e.landmark} />
        <p className="text-sm text-ink-soft">Votre adresse exacte n'est partagée qu'avec le prestataire qui accepte votre demande.</p>
      </fieldset>

      <Card className="space-y-2 bg-amber-100">
        <p className="font-bold">Prix</p>
        <p>{svc.quote ? "Devis après diagnostic : le prestataire vous donne le prix sur place, avant de commencer." : `Estimation : à partir de ${fcfa(svc.base ?? 0)}, à régler à la prestation.`}</p>
        {svc.transportFee != null && (
          <>
            <p className="text-sm">Frais de {svc.quote ? "déplacement" : "livraison"} : <b>{fcfa(svc.transportFee)}</b>{quote.pointsUsed > 0 && <> → <b>{fcfa(quote.transportAfterFcfa ?? 0)}</b> avec vos points</>}</p>
            <label className="flex min-h-12 items-start gap-3 rounded-xl2 bg-white p-3">
              <input type="checkbox" name="useKeur" checked={useKeur} onChange={(e) => setUseKeur(e.target.checked)} disabled={quote.maxPointsUsable === 0} className="mt-1 h-5 w-5 accent-amber-500" />
              <span className="text-sm"><b>Utiliser mes points Keur</b><br />Vous avez {keur.balance} pts{quote.maxPointsUsable > 0 ? ` : jusqu'à ${fcfa(quote.maxPointsUsable * keur.rules.pointValueFcfa)} de réduction sur ces frais` : " : pas encore de réduction possible"}. Les points ne réduisent que les frais de transport, jamais la prestation.</span>
            </label>
            {e.useKeur && <p role="alert" className="text-sm font-semibold text-red-600">{e.useKeur}</p>}
          </>
        )}
      </Card>

      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Envoi…" : "Confirmer ma demande"}</Button>
    </form>
  );
}
