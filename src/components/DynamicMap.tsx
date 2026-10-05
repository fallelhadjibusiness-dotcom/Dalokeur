"use client";
import dynamic from "next/dynamic";

// MapLibre est chargé uniquement quand une carte est affichée (économie de données).
export const DynamicMap = dynamic(() => import("./MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="flex h-[220px] items-center justify-center rounded-xl2 bg-cream-100 text-sm text-ink-soft">Chargement de la carte…</div>,
});
export { DAKAR } from "./MapView";
