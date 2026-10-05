// Règles de prix et de points Keur : fonctions pures.
// Les points Keur réduisent UNIQUEMENT les frais de transport / livraison. Jamais convertibles en argent.
export type KeurRules = { pointValueFcfa: number; perMission: number; perReview: number };
export const DEFAULT_KEUR_RULES: KeurRules = { pointValueFcfa: 10, perMission: 10, perReview: 5 };

export type QuoteInput = {
  priceMode: "FIXED_ESTIMATE" | "QUOTE_AFTER_DIAGNOSIS";
  estimateFcfa: number | null;
  transportFeeFcfa: number | null;
  balance: number; // points disponibles
  wantPoints: boolean;
  rules: KeurRules;
};

export type Quote = {
  transportFeeFcfa: number | null;
  pointsUsed: number;
  discountFcfa: number;
  transportAfterFcfa: number | null;
  estimateAfterFcfa: number | null; // total estimé après réduction (prix fixe seulement)
  maxPointsUsable: number;
};

export function computeQuote(i: QuoteInput): Quote {
  const fee = i.transportFeeFcfa && i.transportFeeFcfa > 0 ? i.transportFeeFcfa : null;
  const value = Math.max(1, i.rules.pointValueFcfa);
  // On n'utilise jamais plus de points que de frais à couvrir, ni plus que le solde.
  const maxPointsUsable = fee ? Math.min(Math.max(0, Math.floor(i.balance)), Math.floor(fee / value)) : 0;
  const pointsUsed = i.wantPoints ? maxPointsUsable : 0;
  const discountFcfa = pointsUsed * value;
  return {
    transportFeeFcfa: fee, pointsUsed, discountFcfa, maxPointsUsable,
    transportAfterFcfa: fee ? fee - discountFcfa : null,
    // L'estimation d'un service à prix fixe inclut les frais de transport : la réduction s'y déduit.
    estimateAfterFcfa: i.priceMode === "FIXED_ESTIMATE" && i.estimateFcfa != null ? Math.max(0, i.estimateFcfa - discountFcfa) : null,
  };
}

export const pointsToFcfa = (points: number, rules: KeurRules) => points * rules.pointValueFcfa;
