"use client";
import Link from "next/link";
import { useActionState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Button, Field, FormError } from "@/components/ui";
import { loginAction, type FormState } from "@/lib/session-actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  const e = state.errors ?? {};
  return (
    <AuthShell title="Connexion" footer={<>Pas encore de compte ? <Link className="font-bold text-emerald-700" href="/inscription">Créer un compte</Link></>}>
      <form action={action} className="space-y-4" noValidate>
        <FormError message={e.form} />
        <Field name="phone" label="Téléphone" type="tel" inputMode="tel" autoComplete="tel" placeholder="77 123 45 67" error={e.phone} />
        <Field name="password" label="Mot de passe" type="password" autoComplete="current-password" error={e.password} />
        <details className="rounded-xl2 border border-emerald-100 bg-white p-3">
          <summary className="cursor-pointer text-sm font-bold">Administrateur : code de vérification</summary>
          <div className="mt-2"><Field name="totp" label="Code à 6 chiffres (ou code de secours)" inputMode="numeric" autoComplete="one-time-code" hint="Uniquement si la double authentification est activée sur votre compte." /></div>
        </details>
        <Button type="submit" className="w-full" disabled={pending}>{pending ? "Connexion…" : "Se connecter"}</Button>
      </form>
    </AuthShell>
  );
}
