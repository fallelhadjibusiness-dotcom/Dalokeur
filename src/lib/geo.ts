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
