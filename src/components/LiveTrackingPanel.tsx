"use client";
import { useEffect, useState } from "react";
import { DynamicMap } from "@/components/DynamicMap";
import type { LiveState } from "@/lib/tracking";

const POLL_MS = 10_000;
const hms = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { timeZone: "Africa/Dakar" });

// Suivi côté client : dernière position connue, heure de mise à jour, estimation d'arrivée.
export function LiveTrackingPanel({ requestId, initial }: { requestId: string; initial: LiveState }) {
  const [live, setLive] = useState<LiveState>(initial);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/requests/${requestId}/tracking`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        setLive((await res.json()) as LiveState); setOffline(false);
      } catch { setOffline(true); }
    };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick); window.addEventListener("online", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); window.removeEventListener("online", tick); };
  }, [requestId]);

  return (
    <section aria-label="Suivi en direct" className="space-y-2 rounded-xl2 border border-emerald-100 bg-white p-4">
      <h2 className="font-extrabold">📡 Suivi du prestataire</h2>
      {offline && <p role="status" className="rounded-xl2 bg-amber-100 p-2 text-sm font-bold">Hors connexion — dernière position connue affichée.</p>}
      {live.state === "not_started" && <p className="text-sm text-ink-soft">Le prestataire n'a pas encore commencé son trajet. Vous pourrez le suivre ici dès son départ.</p>}
      {live.state === "stopped" && <p className="text-sm text-ink-soft">Le suivi en direct est terminé.</p>}
      {live.state === "active" && (
        <>
          <DynamicMap center={live.position} zoom={14} height={240} fit ariaLabel="Carte : position du prestataire"
            markers={[{ id: "provider", lat: live.position.lat, lng: live.position.lng, color: "#0f6b4d" }, ...(live.destination ? [{ id: "dest", lat: live.destination.lat, lng: live.destination.lng, color: "#d99a1f" }] : [])]} />
          <p className={`text-sm font-bold ${live.stale ? "text-amber-600" : "text-emerald-700"}`} data-testid="live-updated">
            {live.stale ? "Dernière position connue" : "Position mise à jour"} à {hms(live.position.recordedAt)}
          </p>
          {live.etaMinutes != null && <p className="text-sm">⏱ Arrivée estimée : environ {live.etaMinutes} min <span className="text-ink-soft">(estimation)</span></p>}
        </>
      )}
      <p className="text-xs text-ink-soft">Sa position n'est visible que par vous, uniquement pendant cette mission.</p>
    </section>
  );
}
