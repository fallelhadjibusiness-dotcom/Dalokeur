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
        <Button type="submit" className="w-full" disabled={pending}>{pending ? "Connexion…" : "Se connecter"}</Button>
      </form>
    </AuthShell>
  );
}
