"use client";
import { useState } from "react";
import { Button } from "@/components/ui";
import { DAKAR, DynamicMap } from "@/components/DynamicMap";
import { LOW_ACCURACY_M, isInDakarArea, nearestDistrict } from "@/lib/geo";

type Pos = { lat: number; lng: number; accuracy: number | null; source: "GPS" | "PIN" };
type Status = "idle" | "asking" | "ok" | "denied" | "unavailable" | "timeout" | "outside" | "offline";

const MESSAGES: Partial<Record<Status, string>> = {
  denied: "Autorisation de localisation refusée. Pas de souci : choisissez votre quartier et saisissez votre adresse ci-dessous.",
  unavailable: "Position indisponible (signal GPS absent). Placez l'épingle sur la carte ou saisissez votre adresse.",
  timeout: "La localisation prend trop de temps. Réessayez à l'air libre ou saisissez votre adresse.",
  outside: "Votre position est hors de Dakar et Pikine, zones couvertes pour le moment. Choisissez votre quartier et saisissez l'adresse.",
  offline: "Pas de connexion internet. Vous pouvez saisir votre adresse manuellement.",
};

// Le GPS n'est demandé QUE lorsque le client appuie sur le bouton.
export function LocationPicker({ onDistrictSuggest, serverError }: { onDistrictSuggest: (d: string) => void; serverError?: string }) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [showMap, setShowMap] = useState(false);

  function place(lat: number, lng: number, accuracy: number | null, source: "GPS" | "PIN") {
    if (!isInDakarArea(lat, lng)) { setStatus("outside"); return false; }
    setPos({ lat, lng, accuracy, source });
    const d = nearestDistrict(lat, lng);
    if (d) onDistrictSuggest(d);
    setShowMap(true);
    setStatus("ok");
    return true;
  }

  function locate() {
    if (!("geolocation" in navigator)) return setStatus("unavailable");
    if (!navigator.onLine) return setStatus("offline");
    setStatus("asking");
    navigator.geolocation.getCurrentPosition(
      (p) => place(p.coords.latitude, p.coords.longitude, p.coords.accuracy, "GPS"),
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  const low = pos?.source === "GPS" && pos.accuracy != null && pos.accuracy > LOW_ACCURACY_M;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={locate} disabled={status === "asking"}>{status === "asking" ? "Localisation…" : "📍 Utiliser ma position"}</Button>
        {!showMap && <Button type="button" variant="ghost" onClick={() => setShowMap(true)}>🗺️ Placer l'épingle sur la carte</Button>}
        {pos && <Button type="button" variant="ghost" onClick={() => { setPos(null); setStatus("idle"); }}>Retirer</Button>}
      </div>
      <p className="text-sm text-ink-soft">Votre position exacte n'est visible que par le prestataire qui accepte votre demande. Avant, il ne voit qu'une zone approximative.</p>

      {MESSAGES[status] && <p role="status" className="rounded-xl2 bg-amber-100 p-3 text-sm font-bold">{MESSAGES[status]}</p>}
      {serverError && <p role="alert" className="text-sm font-semibold text-red-600">{serverError}</p>}

      {showMap && (
        <>
          <DynamicMap center={pos ?? DAKAR} zoom={pos ? 16 : 11} pin={pos} ariaLabel="Carte : touchez pour placer l'épingle ou faites-la glisser" height={260}
            onPinMove={(p) => place(p.lat, p.lng, null, "PIN")} />
          <p className="text-sm text-ink-soft">{pos ? "Faites glisser l'épingle pour la placer exactement sur votre porte." : "Touchez la carte pour placer l'épingle."}</p>
        </>
      )}
      {pos && (
        <p role="status" className={`text-sm font-bold ${low ? "text-amber-600" : "text-emerald-700"}`}>
          {pos.source === "GPS" && pos.accuracy != null ? `Précision ±${Math.round(pos.accuracy)} m.` : "Épingle placée."}{" "}
          {low && "Position imprécise : déplacez l'épingle pour plus de précision, et indiquez un point de repère."}
        </p>
      )}
      <input type="hidden" name="lat" value={pos?.lat ?? ""} />
      <input type="hidden" name="lng" value={pos?.lng ?? ""} />
      <input type="hidden" name="accuracy" value={pos?.accuracy ?? ""} />
      <input type="hidden" name="source" value={pos?.source ?? "MANUAL"} />
    </div>
  );
}
