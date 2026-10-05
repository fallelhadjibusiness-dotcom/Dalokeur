"use client";
import { useActionState, useState, useTransition } from "react";
import { Button, Card, Field, FormError } from "@/components/ui";
import { beginSetupAction, confirmSetupAction, disableAction, type SetupState } from "@/app/admin/securite/actions";

export function TwoFactorSetup({ enabled, recoveryLeft, required }: { enabled: boolean; recoveryLeft: number; required: boolean }) {
  const [begin, setBegin] = useState<SetupState>({});
  const [pending, start] = useTransition();
  const [confirm, confirmAction, confirming] = useActionState<SetupState, FormData>(confirmSetupAction, {});
  const [dis, disAction, disabling] = useActionState<SetupState, FormData>(disableAction, {});

  if (confirm.done && confirm.recoveryCodes) {
    return (
      <Card className="space-y-3 border-emerald-500">
        <p className="font-extrabold text-emerald-800">✅ Double authentification activée</p>
        <p className="text-sm">Conservez ces <b>codes de secours</b> en lieu sûr. Chaque code ne fonctionne qu'une fois et ne sera <b>plus jamais affiché</b>.</p>
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm" data-testid="recovery-codes">{confirm.recoveryCodes.map((c) => <li key={c} className="rounded bg-cream-100 px-2 py-1">{c}</li>)}</ul>
      </Card>
    );
  }
  if (enabled) {
    return (
      <Card className="space-y-3">
        <p className="font-extrabold text-emerald-800">✅ Double authentification active</p>
        <p className="text-sm text-ink-soft">Codes de secours restants : {recoveryLeft}.</p>
        {required ? <p className="text-sm">Elle est obligatoire sur cette plateforme.</p> : (
          <form action={disAction} className="space-y-2">
            <FormError message={dis.error} />
            <Field name="code" label="Code actuel pour désactiver" inputMode="numeric" autoComplete="one-time-code" />
            <Button variant="danger" type="submit" disabled={disabling}>Désactiver</Button>
          </form>
        )}
      </Card>
    );
  }
  return (
    <Card className="space-y-3">
      <p className="font-extrabold">Protégez l'espace administrateur</p>
      <p className="text-sm text-ink-soft">À chaque connexion, un code à 6 chiffres généré par une application d'authentification (Google Authenticator, Authy…) sera demandé en plus du mot de passe.</p>
      {required && <p className="rounded-xl2 bg-amber-100 p-3 text-sm font-bold">La double authentification est obligatoire pour accéder à l'administration.</p>}
      {!begin.secret ? (
        <>
          <FormError message={begin.error} />
          <Button disabled={pending} onClick={() => start(async () => setBegin(await beginSetupAction()))}>Activer la double authentification</Button>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-bold">1. Scannez ce code avec votre application (ou saisissez la clé).</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={begin.qr} alt="QR code de double authentification" width={220} height={220} className="mx-auto rounded-xl2 border border-emerald-100" />
          <p className="break-all text-center font-mono text-sm" data-testid="totp-secret">{begin.secret}</p>
          <p className="text-sm font-bold">2. Saisissez le code à 6 chiffres affiché.</p>
          <form action={confirmAction} className="space-y-2">
            <FormError message={confirm.error} />
            <Field name="code" label="Code à 6 chiffres" inputMode="numeric" autoComplete="one-time-code" />
            <Button type="submit" className="w-full" disabled={confirming}>Confirmer et activer</Button>
          </form>
        </div>
      )}
    </Card>
  );
}
