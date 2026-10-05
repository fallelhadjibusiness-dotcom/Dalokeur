// ~0.005° ≈ 550 m : précision suffisante pour la zone approximative, pas pour l'adresse.
const APPROX_STEP = 0.005;

export function approximate(value: number): number {
  return Math.round(value / APPROX_STEP) * APPROX_STEP;
}

export function approximatePoint(lat: number, lng: number) {
  return {
    approxLat: Number(approximate(lat).toFixed(3)),
    approxLng: Number(approximate(lng).toFixed(3)),
  };
}

// Emprise grossière Dakar + Pikine (validation des coordonnées saisies)
export const DAKAR_BOUNDS = { minLat: 14.62, maxLat: 14.87, minLng: -17.6, maxLng: -17.2 };

export function isInDakarArea(lat: number, lng: number): boolean {
  return (
    lat >= DAKAR_BOUNDS.minLat &&
    lat <= DAKAR_BOUNDS.maxLat &&
    lng >= DAKAR_BOUNDS.minLng &&
    lng <= DAKAR_BOUNDS.maxLng
  );
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Centres approximatifs des quartiers : sert uniquement à SUGGÉRER un quartier, que le client peut corriger.
export const DISTRICT_CENTERS: Record<string, { lat: number; lng: number }> = {
  Plateau: { lat: 14.6708, lng: -17.438 }, "Médina": { lat: 14.683, lng: -17.451 }, Fann: { lat: 14.6925, lng: -17.466 },
  "Point E": { lat: 14.696, lng: -17.46 }, Mermoz: { lat: 14.705, lng: -17.473 }, "Sacré-Cœur": { lat: 14.711, lng: -17.462 },
  Ouakam: { lat: 14.72, lng: -17.488 }, Ngor: { lat: 14.75, lng: -17.517 }, Yoff: { lat: 14.748, lng: -17.47 }, Almadies: { lat: 14.744, lng: -17.518 },
  HLM: { lat: 14.704, lng: -17.44 }, "Grand Yoff": { lat: 14.73, lng: -17.445 }, "Liberté 6": { lat: 14.723, lng: -17.46 },
  "Sicap Baobabs": { lat: 14.715, lng: -17.452 }, "Parcelles Assainies": { lat: 14.76, lng: -17.44 },
  "Pikine Icotaf": { lat: 14.755, lng: -17.39 }, Thiaroye: { lat: 14.76, lng: -17.35 }, "Guinaw Rails": { lat: 14.77, lng: -17.39 },
  Dalifort: { lat: 14.728, lng: -17.4 }, "Médina Gounass": { lat: 14.76, lng: -17.4 }, "Keur Massar": { lat: 14.78, lng: -17.31 },
  "Guédiawaye": { lat: 14.775, lng: -17.4 }, Mbao: { lat: 14.74, lng: -17.33 },
};

export function nearestDistrict(lat: number, lng: number, maxKm = 5): string | null {
  let best: string | null = null;
  let bestKm = Infinity;
  for (const [name, c] of Object.entries(DISTRICT_CENTERS)) {
    const d = haversineKm({ lat, lng }, c);
    if (d < bestKm) { best = name; bestKm = d; }
  }
  return bestKm <= maxKm ? best : null;
}

// Précision GPS : au-delà de ce seuil on invite le client à ajuster l'épingle.
export const LOW_ACCURACY_M = 100;
