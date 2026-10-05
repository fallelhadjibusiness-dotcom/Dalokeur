import { describe, expect, it } from "vitest";
import { computeQuote, DEFAULT_KEUR_RULES } from "@/lib/pricing";

const q = (o: Partial<Parameters<typeof computeQuote>[0]>) => computeQuote({ priceMode: "QUOTE_AFTER_DIAGNOSIS", estimateFcfa: null, transportFeeFcfa: 2000, balance: 0, wantPoints: true, rules: DEFAULT_KEUR_RULES, ...o });

describe("points Keur : calcul de la réduction", () => {
  it("1 point = 10 FCFA, plafonné aux frais de transport", () => {
    expect(q({ balance: 500 })).toMatchObject({ pointsUsed: 200, discountFcfa: 2000, transportAfterFcfa: 0 }); // jamais plus que les frais
    expect(q({ balance: 50 })).toMatchObject({ pointsUsed: 50, discountFcfa: 500, transportAfterFcfa: 1500 });
  });
  it("jamais plus que le solde, jamais négatif", () => {
    expect(q({ balance: 0 }).pointsUsed).toBe(0);
    expect(q({ balance: -20 }).pointsUsed).toBe(0);
  });
  it("sans option ou sans frais de transport : aucune réduction", () => {
    expect(q({ balance: 100, wantPoints: false })).toMatchObject({ pointsUsed: 0, discountFcfa: 0, maxPointsUsable: 100 });
    expect(q({ balance: 100, transportFeeFcfa: null })).toMatchObject({ pointsUsed: 0, discountFcfa: 0, transportAfterFcfa: null, maxPointsUsable: 0 });
  });
  it("livraison à prix fixe : la réduction se déduit du total, jamais sous zéro", () => {
    expect(q({ priceMode: "FIXED_ESTIMATE", estimateFcfa: 1500, transportFeeFcfa: 1500, balance: 60 })).toMatchObject({ discountFcfa: 600, estimateAfterFcfa: 900 });
    expect(q({ priceMode: "FIXED_ESTIMATE", estimateFcfa: 1500, transportFeeFcfa: 1500, balance: 999 }).estimateAfterFcfa).toBe(0);
  });
  it("le devis après diagnostic n'a pas de total estimé", () => {
    expect(q({ balance: 100 }).estimateAfterFcfa).toBeNull();
  });
  it("valeur du point configurable", () => {
    expect(q({ balance: 100, rules: { ...DEFAULT_KEUR_RULES, pointValueFcfa: 20 } })).toMatchObject({ pointsUsed: 100, discountFcfa: 2000 });
  });
});
