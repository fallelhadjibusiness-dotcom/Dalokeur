"use client";
import Link from "next/link";
import { useActionState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Button, Field, FormError } from "@/components/ui";
import { registerClientAction, type FormState } from "@/lib/session-actions";

export default function RegisterPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(registerClientAction, {});
  const e = state.errors ?? {};
  return (
    <AuthShell title="Créer mon compte" footer={<>Vous êtes prestataire ? <Link className="font-bold text-emerald-700" href="/inscription/prestataire">Inscrivez-vous ici</Link></>}>
      <form action={action} className="space-y-4" noValidate>
        <FormError message={e.form} />
        <Field name="fullName" label="Nom complet" autoComplete="name" error={e.fullName} />
        <Field name="phone" label="Téléphone" type="tel" inputMode="tel" autoComplete="tel" placeholder="77 123 45 67" error={e.phone} />
        <Field name="password" label="Mot de passe" type="password" autoComplete="new-password" hint="8 caractères minimum" error={e.password} />
        <Button type="submit" className="w-full" disabled={pending}>{pending ? "Création…" : "Créer mon compte"}</Button>
      </form>
    </AuthShell>
  );
}
