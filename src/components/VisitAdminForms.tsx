"use client";
import { useActionState } from "react";
import { Button, Field, FormError } from "@/components/ui";
import { confirmVisitAction } from "@/app/admin/actions";
import type { FormState } from "@/lib/session-actions";

export function ConfirmVisitForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(confirmVisitAction.bind(null, id), {});
  return (
    <details className="rounded-xl2 border border-emerald-100 bg-white p-3">
      <summary className="cursor-pointer text-sm font-bold">Confirmer avec un créneau</summary>
      <form action={action} className="mt-2 space-y-2" noValidate>
        <FormError message={state.errors?.form} />
        <Field name="scheduledAt" label="Créneau confirmé" type="datetime-local" error={state.errors?.scheduledAt} />
        <textarea name="note" rows={2} placeholder="Note pour le client (point de rendez-vous…)" className="w-full rounded-xl2 border-2 border-emerald-100 p-2 text-sm" />
        <Button type="submit" className="min-h-10 w-full text-sm" disabled={pending}>Confirmer la visite</Button>
      </form>
    </details>
  );
}
