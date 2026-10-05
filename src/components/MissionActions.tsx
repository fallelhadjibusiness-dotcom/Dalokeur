"use client";
import { useActionState, useState, useTransition } from "react";
import type { RequestStatus } from "@prisma/client";
import { Button, FormError } from "@/components/ui";
import { acceptAction, advanceAction, availabilityAction, declineAction } from "@/app/prestataire/actions";
import type { FormState } from "@/lib/session-actions";

export function AcceptDecline({ id, canAccept, reason }: { id: string; canAccept: boolean; reason?: string }) {
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const [dState, dAction, dPending] = useActionState<FormState, FormData>(declineAction.bind(null, id), {});
  return (
    <div className="space-y-3">
      <FormError message={err ?? dState.errors?.form} />
      {!canAccept && reason && <p className="rounded-xl2 bg-amber-100 p-3 text-sm font-bold">{reason}</p>}
      <Button className="w-full" disabled={!canAccept || pending} onClick={() => start(async () => { const r = await acceptAction(id); setErr(r.errors?.form); })}>✅ Accepter la mission</Button>
      <form action={dAction}><Button variant="outline" type="submit" className="w-full" disabled={dPending}>Refuser</Button></form>
    </div>
  );
}

const NEXT: Partial<Record<RequestStatus, { to: RequestStatus; label: string }>> = {
  ACCEPTED: { to: "EN_ROUTE", label: "🚗 Je suis en route" },
  EN_ROUTE: { to: "ARRIVED", label: "📍 Je suis arrivé" },
  ARRIVED: { to: "IN_PROGRESS", label: "▶️ Démarrer l'intervention" },
  IN_PROGRESS: { to: "COMPLETED", label: "🏁 Terminer l'intervention" },
};

export function AdvanceButton({ id, status }: { id: string; status: RequestStatus }) {
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const next = NEXT[status];
  if (!next) return null;
  return (
    <div className="space-y-2">
      <FormError message={err} />
      <Button variant="accent" className="w-full" disabled={pending} onClick={() => start(async () => { const r = await advanceAction(id, next.to); setErr(r.errors?.form); })}>{next.label}</Button>
    </div>
  );
}

export function AvailabilityToggle({ available }: { available: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button role="switch" aria-checked={available} disabled={pending} onClick={() => start(async () => { await availabilityAction(!available); })}
      className={`flex min-h-12 w-full items-center justify-between rounded-xl2 px-4 font-bold ${available ? "bg-emerald-600 text-white" : "bg-cream-100 text-ink-soft"}`}>
      <span>{available ? "Disponible" : "Indisponible"}</span><span aria-hidden>{available ? "● Actif" : "○ Inactif"}</span>
    </button>
  );
}
