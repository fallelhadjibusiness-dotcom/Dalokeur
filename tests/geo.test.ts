import { describe, expect, it } from "vitest";
import { approximatePoint, haversineKm, isInDakarArea, nearestDistrict } from "@/lib/geo";

describe("géolocalisation (fonctions pures)", () => {
  it("distance Plateau → Pikine ≈ 10-15 km", () => {
    const d = haversineKm({ lat: 14.6708, lng: -17.438 }, { lat: 14.755, lng: -17.39 });
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThan(15);
  });
  it("zone de service : Dakar/Pikine oui, Paris et Saint-Louis non", () => {
    expect(isInDakarArea(14.6937, -17.4441)).toBe(true);
    expect(isInDakarArea(14.76, -17.35)).toBe(true);
    expect(isInDakarArea(48.85, 2.35)).toBe(false);
    expect(isInDakarArea(16.02, -16.5)).toBe(false);
  });
  it("suggestion de quartier", () => {
    expect(nearestDistrict(14.6935, -17.4655)).toBe("Fann");
    expect(nearestDistrict(14.7605, -17.351)).toBe("Thiaroye");
    expect(nearestDistrict(14.0, -16.0)).toBeNull();
  });
  it("position approximative ≈ 500 m, jamais exacte", () => {
    const a = approximatePoint(14.69371, -17.44412);
    expect(haversineKm({ lat: 14.69371, lng: -17.44412 }, { lat: a.approxLat, lng: a.approxLng })).toBeLessThan(0.5);
    expect(a.approxLat).not.toBe(14.69371);
  });
});
