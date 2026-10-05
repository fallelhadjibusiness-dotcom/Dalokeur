"use client";
import { useActionState } from "react";
import { Button, Field } from "@/components/ui";
import { FormMessage } from "@/components/AdminControls";
import { serviceAction, settingsAction } from "@/app/admin/actions";
import type { FormState } from "@/lib/session-actions";

type Svc = { id: string; name: string; priceMode: string; basePriceFcfa: number | null; transportFeeFcfa: number | null; allowsUrgent: boolean; isActive: boolean };

export function ServiceForm({ s }: { s: Svc }) {
  const [state, action, pending] = useActionState<FormState, FormData>(serviceAction.bind(null, s.id), {});
  const e = state.errors ?? {};
  return (
    <details className="rounded-xl2 border border-emerald-100 bg-white p-3">
      <summary className="cursor-pointer font-bold">{s.name} {!s.isActive && <span className="text-red-600">(désactivé)</span>}</summary>
      <form action={action} className="mt-3 space-y-3" noValidate>
        <FormMessage state={state} />
        <Field name="name" label="Nom" defaultValue={s.name} error={e.name} />
        <div className="space-y-1"><label htmlFor={`pm-${s.id}`} className="block text-sm font-bold">Prix</label>
          <select id={`pm-${s.id}`} name="priceMode" defaultValue={s.priceMode} className="min-h-12 w-full rounded-xl2 border-2 border-emerald-100 bg-white px-4"><option value="FIXED_ESTIMATE">Estimation fixe</option><option value="QUOTE_AFTER_DIAGNOSIS">Devis après diagnostic</option></select></div>
        <Field name="basePriceFcfa" label="Prix de base (FCFA)" type="number" min={0} defaultValue={s.basePriceFcfa ?? ""} error={e.basePriceFcfa} />
        <Field name="transportFeeFcfa" label="Frais de transport / livraison (FCFA)" type="number" min={0} defaultValue={s.transportFeeFcfa ?? ""} hint="Seuls frais réductibles par les points Keur. Vide = aucune réduction possible." error={e.transportFeeFcfa} />
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="allowsUrgent" defaultChecked={s.allowsUrgent} className="h-5 w-5 accent-emerald-600" />Intervention urgente possible</label>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="isActive" defaultChecked={s.isActive} className="h-5 w-5 accent-emerald-600" />Service actif</label>
        <Button type="submit" className="w-full" disabled={pending}>Enregistrer</Button>
      </form>
    </details>
  );
}

export function SettingsForm({ commission, zones, active, keur }: { commission: number; zones: string[]; active: string[]; keur: { pointValueFcfa: number; perMission: number; perReview: number } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(settingsAction, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field name="commission" label="Commission Dalokeur (%)" type="number" min={0} max={30} step="0.5" defaultValue={commission} hint="Entre 0 et 30 %. Sert au calcul des gains et du chiffre d'affaires estimés." error={e.commission} />
      <fieldset className="space-y-3"><legend className="text-sm font-bold">Points Keur</legend>
        <Field name="pointValueFcfa" label="Valeur d'un point (FCFA de réduction transport)" type="number" min={1} max={50} defaultValue={keur.pointValueFcfa} error={e.keur} />
        <Field name="perMission" label="Points gagnés par mission terminée" type="number" min={0} max={100} defaultValue={keur.perMission} />
        <Field name="perReview" label="Points gagnés par avis laissé" type="number" min={0} max={100} defaultValue={keur.perReview} hint="Les points ne réduisent que les frais de transport ou de livraison, jamais convertibles en argent." />
      </fieldset>
      <fieldset className="space-y-1"><legend className="text-sm font-bold">Zones de couverture</legend>
        {zones.map((z) => <label key={z} className="flex min-h-11 items-center gap-3"><input type="checkbox" name="zones" value={z} defaultChecked={active.includes(z)} className="h-5 w-5 accent-emerald-600" />{z}</label>)}
        {e.zones && <p role="alert" className="text-sm font-semibold text-red-600">{e.zones}</p>}
      </fieldset>
      <Button type="submit" className="w-full" disabled={pending}>Enregistrer</Button>
    </form>
  );
}
