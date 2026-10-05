"use client";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MLMap, Marker } from "maplibre-gl";

export type MapMarker = { id: string; lat: number; lng: number; color?: string };
type LatLng = { lat: number; lng: number };
type Props = {
  center: LatLng; zoom?: number; markers?: MapMarker[]; approx?: LatLng & { radiusM: number };
  pin?: LatLng | null; onPinMove?: (p: LatLng) => void; height?: number; ariaLabel: string; fit?: boolean;
};

const DAKAR: LatLng = { lat: 14.7167, lng: -17.4677 };
// Fond de carte : variable d'environnement (MapTiler, Protomaps…). Repli OpenStreetMap pour le développement uniquement :
// les tuiles publiques d'OSM ne sont pas prévues pour un usage en production.
function styleFromEnv(): string | object {
  const url = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
  const key = process.env.NEXT_PUBLIC_MAP_KEY ?? "";
  if (url) return url.includes("{key}") ? url.replace("{key}", key) : key && !url.includes("key=") ? `${url}${url.includes("?") ? "&" : "?"}key=${key}` : url;
  return { version: 8, sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap" } }, layers: [{ id: "osm", type: "raster", source: "osm" }] };
}

function circlePolygon(c: LatLng, radiusM: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([c.lng + (radiusM * Math.cos(a)) / (111320 * Math.cos((c.lat * Math.PI) / 180)), c.lat + (radiusM * Math.sin(a)) / 110540]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [pts] } };
}

export function MapView({ center, zoom = 15, markers = [], approx, pin, onPinMove, height = 220, ariaLabel, fit = false }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const markerRefs = useRef(new Map<string, Marker>());
  const pinRef = useRef<Marker | null>(null);
  const onMove = useRef(onPinMove);
  onMove.current = onPinMove;
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;
    const refs = markerRefs.current;
    (async () => {
      try {
        const ml = await import("maplibre-gl");
        if (cancelled || !box.current) return;
        lib.current = ml;
        const m = new ml.Map({ container: box.current, style: styleFromEnv() as never, center: [center.lng, center.lat], zoom, attributionControl: { compact: true } });
        map.current = m;
        m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        m.on("load", () => { if (!cancelled) setState("ready"); });
        m.on("error", () => { /* tuiles indisponibles : la carte reste utilisable */ });
        m.on("click", (e) => { if (onMove.current) onMove.current({ lat: e.lngLat.lat, lng: e.lngLat.lng }); });
      } catch { if (!cancelled) setState("failed"); } // WebGL indisponible, appareil ancien…
    })();
    return () => { cancelled = true; map.current?.remove(); map.current = null; refs.clear(); pinRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current, ml = lib.current;
    if (!m || !ml || state === "failed") return;
    const apply = () => {
      const seen = new Set<string>();
      for (const mk of markers) {
        seen.add(mk.id);
        const ex = markerRefs.current.get(mk.id);
        if (ex) ex.setLngLat([mk.lng, mk.lat]);
        else markerRefs.current.set(mk.id, new ml.Marker({ color: mk.color ?? "#0f6b4d" }).setLngLat([mk.lng, mk.lat]).addTo(m));
      }
      for (const [id, mk] of markerRefs.current) if (!seen.has(id)) { mk.remove(); markerRefs.current.delete(id); }

      if (pin) {
        if (pinRef.current) pinRef.current.setLngLat([pin.lng, pin.lat]);
        else {
          const mk = new ml.Marker({ color: "#d99a1f", draggable: true }).setLngLat([pin.lng, pin.lat]).addTo(m);
          mk.on("dragend", () => { const p = mk.getLngLat(); onMove.current?.({ lat: p.lat, lng: p.lng }); });
          pinRef.current = mk;
        }
      } else if (pinRef.current) { pinRef.current.remove(); pinRef.current = null; }

      if (approx) {
        const data = circlePolygon(approx, approx.radiusM);
        const src = m.getSource("approx") as { setData: (d: unknown) => void } | undefined;
        if (src) src.setData(data);
        else {
          m.addSource("approx", { type: "geojson", data });
          m.addLayer({ id: "approx-fill", type: "fill", source: "approx", paint: { "fill-color": "#0f6b4d", "fill-opacity": 0.2 } });
          m.addLayer({ id: "approx-line", type: "line", source: "approx", paint: { "line-color": "#0f6b4d", "line-width": 2 } });
        }
      }
      const pts = [...markers, ...(pin ? [{ ...pin, id: "pin" }] : [])];
      if (fit && pts.length >= 2) {
        const b = new ml.LngLatBounds();
        pts.forEach((p) => b.extend([p.lng, p.lat]));
        m.fitBounds(b, { padding: 50, maxZoom: 16, duration: 0 });
      } else if (pin) m.easeTo({ center: [pin.lng, pin.lat], zoom: Math.max(m.getZoom(), 15), duration: 300 });
      else if (markers.length === 1) m.easeTo({ center: [markers[0].lng, markers[0].lat], duration: 300 });
    };
    if (m.loaded()) apply(); else m.once("load", apply);
  }, [markers, pin, approx, fit, state]);

  if (state === "failed") {
    return (
      <div role="img" aria-label={ariaLabel} data-map-state="failed" className="flex items-center justify-center rounded-xl2 bg-cream-100 p-4 text-center text-sm text-ink-soft" style={{ height }}>
        Carte indisponible sur cet appareil. {pin ? `Position : ${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)}.` : "Utilisez la saisie manuelle de l'adresse."}
      </div>
    );
  }
  return <div ref={box} role="application" aria-label={ariaLabel} data-map-state={state} className="w-full overflow-hidden rounded-xl2 border border-emerald-100" style={{ height }} />;
}

export { DAKAR };
