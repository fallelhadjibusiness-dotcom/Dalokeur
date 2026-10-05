import type { PriceMode } from "@prisma/client";
import { fcfa } from "@/lib/format";

type Props = { priceMode: PriceMode; estimateFcfa: number | null; transportFeeFcfa: number | null; keurPointsUsed: number; keurDiscountFcfa: number };

// Détail du prix : les points Keur ne réduisent que les frais de transport / livraison.
export function PriceBreakdown({ priceMode, estimateFcfa, transportFeeFcfa, keurPointsUsed, keurDiscountFcfa }: Props) {
  const quote = priceMode === "QUOTE_AFTER_DIAGNOSIS" || estimateFcfa == null;
  const rows: [string, string, boolean?][] = [];
  if (quote) rows.push(["Prestation", "Devis après diagnostic"]);
  else rows.push(["Estimation", fcfa(estimateFcfa)]);
  if (transportFeeFcfa && !(!quote && estimateFcfa === transportFeeFcfa)) rows.push(["Frais de déplacement", fcfa(transportFeeFcfa)]);
  if (keurPointsUsed > 0) rows.push([`Points Keur (${keurPointsUsed} pts)`, `− ${fcfa(keurDiscountFcfa)}`, true]);
  const total = !quote ? Math.max(0, (estimateFcfa ?? 0) - keurDiscountFcfa) : null;
  return (
    <dl className="space-y-1 text-sm" aria-label="Détail du prix">
      {rows.map(([k, v, accent]) => <div key={k} className="flex justify-between gap-2"><dt className="text-ink-soft">{k}</dt><dd className={`font-bold ${accent ? "text-amber-600" : ""}`}>{v}</dd></div>)}
      {total != null && <div className="flex justify-between gap-2 border-t border-emerald-100 pt-1"><dt className="font-bold">À régler à la prestation</dt><dd className="font-extrabold">{fcfa(total)}</dd></div>}
      {quote && transportFeeFcfa != null && <div className="flex justify-between gap-2 border-t border-emerald-100 pt-1"><dt className="font-bold">Déplacement à régler</dt><dd className="font-extrabold">{fcfa(Math.max(0, transportFeeFcfa - keurDiscountFcfa))}</dd></div>}
    </dl>
  );
}
