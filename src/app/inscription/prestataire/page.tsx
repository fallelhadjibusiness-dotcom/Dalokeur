"use client";
import { useActionState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Button, Field, FormError } from "@/components/ui";
import { registerProviderAction, type FormState } from "@/lib/session-actions";
import { ZONES } from "@/lib/zones";

const SERVICES = [
  ["menage-lessive", "Ménage, lessive et nettoyage"],
  ["plomberie", "Plomberie"],
  ["electricite", "Électricité"],
  ["climatisation", "Climatisation"],
  ["serrurerie", "Serrurerie"],
  ["livraison-locale", "Livraison locale"],
];

export default function ProviderRegisterPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(registerProviderAction, {});
  const e = state.errors ?? {};
  return (
    <AuthShell title="Devenir prestataire">
      <p className="mb-4 text-sm text-ink-soft">Votre profil sera examiné par notre équipe avant d'activer votre compte.</p>
      <form action={action} className="space-y-4" noValidate>
        <FormError message={e.form} />
        <Field name="fullName" label="Nom complet" error={e.fullName} />
        <Field name="phone" label="Téléphone" type="tel" inputMode="tel" placeholder="77 123 45 67" error={e.phone} />
        <Field name="password" label="Mot de passe" type="password" autoComplete="new-password" hint="8 caractères minimum" error={e.password} />
        <Field name="jobTitle" label="Votre métier" placeholder="Plombier, aide-ménagère, livreur…" error={e.jobTitle} />
        <Field name="experienceYears" label="Années d'expérience" type="number" min={0} defaultValue={0} error={e.experienceYears} />
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">Services proposés</legend>
          {SERVICES.map(([slug, label]) => (
            <label key={slug} className="flex min-h-11 items-center gap-3"><input type="checkbox" name="serviceSlugs" value={slug} className="h-5 w-5 accent-emerald-600" />{label}</label>
          ))}
          {e.serviceSlugs && <p role="alert" className="text-sm font-semibold text-red-600">{e.serviceSlugs}</p>}
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">Zones d'intervention</legend>
          {Object.keys(ZONES).map((z) => (
            <label key={z} className="flex min-h-11 items-center gap-3"><input type="checkbox" name="zones" value={z} className="h-5 w-5 accent-emerald-600" />{z}</label>
          ))}
          {e.zones && <p role="alert" className="text-sm font-semibold text-red-600">{e.zones}</p>}
        </fieldset>
        <Button type="submit" className="w-full" disabled={pending}>{pending ? "Envoi…" : "Envoyer ma candidature"}</Button>
      </form>
    </AuthShell>
  );
}
