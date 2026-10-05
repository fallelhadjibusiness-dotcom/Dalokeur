// Zones de couverture MVP : Dakar et Pikine. Configurable plus tard via la table settings.
export const ZONES: Record<string, string[]> = {
  Dakar: ["Plateau", "Médina", "Fann", "Point E", "Mermoz", "Sacré-Cœur", "Ouakam", "Ngor", "Yoff", "Almadies", "HLM", "Grand Yoff", "Liberté 6", "Sicap Baobabs", "Parcelles Assainies"],
  Pikine: ["Pikine Icotaf", "Thiaroye", "Guinaw Rails", "Dalifort", "Médina Gounass", "Keur Massar", "Guédiawaye", "Mbao"],
};

export const ALL_DISTRICTS = Object.values(ZONES).flat();

export function zoneOfDistrict(district: string): string | null {
  for (const [zone, districts] of Object.entries(ZONES)) {
    if (districts.includes(district)) return zone;
  }
  return null;
}
