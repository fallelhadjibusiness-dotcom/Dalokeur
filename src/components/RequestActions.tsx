"use client";
import { useActionState, useTransition } from "react";
import { Button, Card, FormError } from "@/components/ui";
import { cancelAction, completeAction, reportAction, reviewAction } from "@/app/client/actions";
import type { FormState } from "@/lib/session-actions";

export function CancelForm({ id, reasonRequired }: { id: string; reasonRequired: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(cancelAction.bind(null, id), {});
  return (
    <details className="rounded-xl2 border border-red-200 bg-white p-4">
      <summary className="cursor-pointer font-bold text-red-700">Annuler la demande</summary>
      <form action={action} className="mt-3 space-y-3">
        <FormError message={state.errors?.form} />
        <p className="text-sm text-ink-soft">{reasonRequired ? "Un prestataire a accepté : merci d'indiquer le motif." : "Sans conséquence tant qu'aucun prestataire n'a accepté."}</p>
        <textarea name="reason" rows={2} placeholder={reasonRequired ? "Motif (obligatoire)" : "Motif (facultatif)"} required={reasonRequired} className="w-full rounded-xl2 border-2 border-emerald-100 p-3" />
        <Button variant="danger" type="submit" className="w-full" disabled={pending}>Confirmer l'annulation</Button>
      </form>
    </details>
  );
}

export function CompleteButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <Button className="w-full" disabled={pending} onClick={() => start(async () => { await completeAction(id); })}>✅ Confirmer que le service est terminé</Button>;
}

export function ReviewForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(reviewAction.bind(null, id), {});
  return (
    <Card>
      <h2 className="font-extrabold">Donnez votre avis</h2>
      <form action={action} className="mt-3 space-y-3">
        <FormError message={state.errors?.form} />
        <fieldset className="flex gap-1"><legend className="sr-only">Note de 1 à 5</legend>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="flex-1"><input type="radio" name="rating" value={n} className="peer sr-only" required />
              <span className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl2 border-2 border-emerald-100 font-extrabold peer-checked:border-amber-500 peer-checked:bg-amber-100 peer-focus-visible:ring-2">{n} ⭐</span></label>
          ))}
        </fieldset>
        <textarea name="comment" rows={3} maxLength={500} placeholder="Votre commentaire (facultatif)" className="w-full rounded-xl2 border-2 border-emerald-100 p-3" />
        <Button type="submit" className="w-full" disabled={pending}>Envoyer mon avis</Button>
      </form>
    </Card>
  );
}

export function ReportForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(reportAction.bind(null, id), {});
  if (state.ok) return <Card>Merci, votre signalement a été transmis à notre équipe. Nous vous contactons rapidement.</Card>;
  return (
    <details className="rounded-xl2 border border-emerald-100 bg-white p-4">
      <summary className="cursor-pointer font-bold text-emerald-800">🆘 Assistance / signaler un problème</summary>
      <form action={action} className="mt-3 space-y-3">
        <FormError message={state.errors?.form} />
        <textarea name="reason" rows={3} placeholder="Que s'est-il passé ?" className="w-full rounded-xl2 border-2 border-emerald-100 p-3" />
        <Button variant="outline" type="submit" className="w-full" disabled={pending}>Envoyer</Button>
      </form>
    </details>
  );
}
