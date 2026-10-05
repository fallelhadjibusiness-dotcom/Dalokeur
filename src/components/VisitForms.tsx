"use client";
import { useActionState } from "react";
import { Button, Field, FormError } from "@/components/ui";
import { cancelVisitAction, requestVisitAction } from "@/app/client/immobilier/actions";
import type { FormState } from "@/lib/session-actions";

export function RequestVisitForm({ propertyId }: { propertyId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestVisitAction.bind(null, propertyId), {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-3 rounded-xl2 border border-emerald-100 bg-white p-4" noValidate>
      <h2 className="text-lg font-extrabold">Demander une visite</h2>
      <FormError message={e.form} />
      <Field name="preferredAt" label="Date et heure souhaitées" type="datetime-local" error={e.preferredAt} hint="Notre agence confirme le créneau, puis vous communique l'adresse exacte." />
      <div className="space-y-1"><label htmlFor="message" className="block text-sm font-bold">Message (facultatif)</label>
        <textarea id="message" name="message" rows={2} maxLength={500} placeholder="Ex : disponible plutôt le matin" className="w-full rounded-xl2 border-2 border-emerald-100 p-3" /></div>
      <Button type="submit" variant="accent" className="w-full" disabled={pending}>{pending ? "Envoi…" : "Demander une visite"}</Button>
    </form>
  );
}

export function CancelVisitForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(cancelVisitAction.bind(null, id), {});
  return (
    <details className="rounded-xl2 border border-red-200 bg-white p-4">
      <summary className="cursor-pointer font-bold text-red-700">Annuler la visite</summary>
      <form action={action} className="mt-3 space-y-3">
        <FormError message={state.errors?.form} />
        <textarea name="reason" rows={2} placeholder="Motif (facultatif)" className="w-full rounded-xl2 border-2 border-emerald-100 p-3" />
        <Button variant="danger" type="submit" className="w-full" disabled={pending}>Confirmer l'annulation</Button>
      </form>
    </details>
  );
}
