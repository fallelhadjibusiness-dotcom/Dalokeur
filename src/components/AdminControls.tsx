"use client";
import { useActionState, useState, useTransition } from "react";
import { Button, FormError } from "@/components/ui";
import type { FormState } from "@/lib/session-actions";

// Bouton simple lié à une server action déjà « bindée » côté serveur.
export function ActionButton({ action, label, variant = "outline", confirm }: { action: () => Promise<FormState>; label: string; variant?: "primary" | "outline" | "danger" | "accent"; confirm?: string }) {
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div>
      <Button variant={variant} className="min-h-10 px-3 text-sm" disabled={pending}
        onClick={() => { if (confirm && !window.confirm(confirm)) return; start(async () => { const r = await action(); setErr(r.errors?.form); }); }}>{label}</Button>
      {err && <p role="alert" className="mt-1 text-sm font-semibold text-red-600">{err}</p>}
    </div>
  );
}

// Formulaire avec motif / décision (obligatoire côté serveur).
export function NoteAction({ action, label, placeholder, variant = "outline", name = "note" }: { action: (s: FormState, fd: FormData) => Promise<FormState>; label: string; placeholder: string; variant?: "primary" | "outline" | "danger"; name?: string }) {
  const [state, act, pending] = useActionState<FormState, FormData>(action, {});
  return (
    <details className="rounded-xl2 border border-emerald-100 bg-white p-3">
      <summary className="cursor-pointer text-sm font-bold">{label}</summary>
      <form action={act} className="mt-2 space-y-2">
        <FormError message={state.errors?.form} />
        <textarea name={name} rows={2} placeholder={placeholder} className="w-full rounded-xl2 border-2 border-emerald-100 p-2 text-sm" />
        <Button variant={variant} type="submit" className="min-h-10 w-full text-sm" disabled={pending}>{label}</Button>
      </form>
    </details>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  return state.ok ? <p role="status" className="rounded-xl2 bg-emerald-100 p-3 text-sm font-bold text-emerald-800">Enregistré.</p> : <FormError message={state.errors?.form} />;
}
