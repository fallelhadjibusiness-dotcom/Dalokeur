"use client";
import { useActionState } from "react";
import { Button, Field, FormError } from "@/components/ui";
import { updateProfileAction } from "@/app/prestataire/actions";
import type { FormState } from "@/lib/session-actions";

export function ProfileForm({ zones, selected, jobTitle, bio, experienceYears }: { zones: string[]; selected: string[]; jobTitle: string; bio: string; experienceYears: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfileAction, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={e.form} />
      {state.ok && <p role="status" className="rounded-xl2 bg-emerald-100 p-3 text-sm font-bold text-emerald-800">Profil enregistré.</p>}
      <Field name="jobTitle" label="Métier" defaultValue={jobTitle} error={e.jobTitle} />
      <Field name="experienceYears" label="Années d'expérience" type="number" min={0} defaultValue={experienceYears} error={e.experienceYears} />
      <div className="space-y-1"><label htmlFor="bio" className="block text-sm font-bold">Présentation</label>
        <textarea id="bio" name="bio" rows={3} defaultValue={bio} maxLength={500} className="w-full rounded-xl2 border-2 border-emerald-100 p-3" /></div>
      <fieldset className="space-y-1"><legend className="text-sm font-bold">Zones desservies</legend>
        {zones.map((z) => <label key={z} className="flex min-h-11 items-center gap-3"><input type="checkbox" name="zones" value={z} defaultChecked={selected.includes(z)} className="h-5 w-5 accent-emerald-600" />{z}</label>)}
        {e.zones && <p role="alert" className="text-sm font-semibold text-red-600">{e.zones}</p>}
      </fieldset>
      <Button type="submit" className="w-full" disabled={pending}>Enregistrer</Button>
    </form>
  );
}
