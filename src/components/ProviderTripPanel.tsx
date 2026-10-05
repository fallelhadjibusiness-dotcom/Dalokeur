"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { pushLocationAction, startTripAction, stopSharingAction } from "@/app/prestataire/tracking-actions";

const INTERVAL_MS = 15_000;
type Fix = { lat: number; lng: number; accuracy: number | null; heading: number | null };

function getFix(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject({ code: 2 });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, heading: p.coords.heading }),
      (e) => reject(e), { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 });
  });
}
const gpsError = (e: { code?: number }) => e.code === 1 ? "Autorisation de localisation refusée. Autorisez la position dans les réglages du navigateur, ou continuez sans partage." : e.code === 3 ? "Signal GPS trop lent. Réessayez à l'air libre." : "Position indisponible.";

export function ProviderTripPanel({ requestId, canStart, active: initiallyActive, status }: { requestId: string; canStart: boolean; active: boolean; status: string }) {
  const [active, setActive] = useState(initiallyActive);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [last, setLast] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };

  const tick = useCallback(async () => {
    if (!navigator.onLine) { setNotice("Hors connexion : le partage reprendra au retour du réseau."); return; }
    try {
      const fix = await getFix();
      const r = await pushLocationAction(requestId, fix);
      if (r.ok) { setLast(new Date()); setNotice(undefined); }
      else { stopTimer(); setActive(false); setNotice(r.error); } // mission terminée, annulée ou expirée
    } catch (e) { setNotice(gpsError(e as { code?: number })); }
  }, [requestId]);

  // Reprise automatique si le partage était déjà actif (page rechargée)
  useEffect(() => {
    if (!active) return stopTimer();
    void tick();
    timer.current = setInterval(tick, INTERVAL_MS);
    return stopTimer;
  }, [active, tick]);

  async function start() {
    setError(undefined); setBusy(true);
    try {
      const fix = await getFix(); // la permission GPS est demandée ici, sur action explicite
      const r = await startTripAction(requestId, fix, consent);
      if (r.ok) { setActive(true); setLast(new Date()); } else setError(r.error);
    } catch (e) { setError(gpsError(e as { code?: number })); }
    setBusy(false);
  }

  async function stop() {
    setBusy(true); stopTimer();
    await stopSharingAction(requestId);
    setActive(false); setBusy(false); setNotice("Partage de position arrêté.");
  }

  if (active) {
    return (
      <section aria-label="Partage de position" className="space-y-3 rounded-xl2 border-2 border-emerald-600 bg-emerald-50 p-4">
        <p className="font-extrabold text-emerald-800">📡 Partage de position actif</p>
        <p className="text-sm">Votre position est envoyée environ toutes les 15 secondes au client de cette mission uniquement. Gardez l'application ouverte.</p>
        {last && <p className="text-xs text-ink-soft">Dernier envoi : {last.toLocaleTimeString("fr-FR", { timeZone: "Africa/Dakar" })}</p>}
        {status === "ARRIVED" && <p className="text-sm font-bold">Vous êtes arrivé : vous pouvez arrêter le partage.</p>}
        {notice && <p role="status" className="text-sm font-bold text-amber-600">{notice}</p>}
        <Button variant="danger" className="w-full" disabled={busy} onClick={stop}>⏹ Arrêter le partage de ma position</Button>
      </section>
    );
  }
  if (!canStart) return notice ? <p role="status" className="rounded-xl2 bg-cream-100 p-3 text-sm font-bold">{notice}</p> : null;
  return (
    <section aria-label="Commencer le trajet" className="space-y-3 rounded-xl2 border border-emerald-100 bg-white p-4">
      <p className="font-extrabold">🚗 Commencer le trajet</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>Votre position est visible <b>uniquement par le client de cette mission</b>.</li>
        <li>Elle n'est partagée <b>que pendant la durée de la mission</b> : arrêt automatique à la fin, à l'annulation ou à l'expiration.</li>
        <li>Vous pouvez l'arrêter à tout moment avec le bouton « Arrêter le partage ».</li>
        <li>Les données de trajet sont supprimées après 24 heures.</li>
      </ul>
      <label className="flex min-h-12 items-start gap-3 rounded-xl2 bg-cream-100 p-3">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5 accent-emerald-600" />
        <span className="text-sm font-bold">J'accepte de partager ma position en direct avec le client pendant cette mission.</span>
      </label>
      {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
      {notice && <p role="status" className="text-sm font-bold">{notice}</p>}
      <Button variant="accent" className="w-full" disabled={!consent || busy} onClick={start}>{busy ? "Localisation…" : "Commencer le trajet"}</Button>
      <p className="text-xs text-ink-soft">Sans partage, vous pouvez quand même utiliser « Je suis en route » ci-dessous.</p>
    </section>
  );
}
