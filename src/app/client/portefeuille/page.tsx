import { ClientShell } from "@/components/ClientShell";
import { TopUpButtons } from "@/components/TopUpButtons";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { getWallet } from "@/lib/requests";
import { getKeurRules } from "@/lib/keur";
import { dateFr, fcfa } from "@/lib/format";

export default async function WalletPage() {
  const user = await requireRole("CLIENT");
  const [{ wallet, keur, keurTx }, rules] = await Promise.all([getWallet(user.id), getKeurRules()]);
  const balance = keur?.balance ?? 0;
  return (
    <ClientShell title="Portefeuille">
      <Card className="space-y-3">
        <div className="flex items-center justify-between"><p className="font-bold">Solde en FCFA</p><Badge tone="amber">Démonstration</Badge></div>
        <p className="text-3xl font-extrabold">{fcfa(wallet?.balanceFcfa ?? 0)}</p>
        <p className="text-sm text-ink-soft">Monnaie fictive : aucun vrai paiement n'est connecté, aucun argent n'est offert à l'inscription.</p>
        <TopUpButtons />
        {wallet && wallet.transactions.length > 0 && <ul className="space-y-1 text-sm">{wallet.transactions.map((t) => <li key={t.id} className="flex justify-between gap-2"><span>{t.note ?? t.kind} · {dateFr(t.createdAt)}</span><b>{t.amountFcfa > 0 ? "+" : ""}{fcfa(t.amountFcfa)}</b></li>)}</ul>}
      </Card>

      <Card className="space-y-3 border-amber-400">
        <div className="flex items-center justify-between"><p className="font-bold">Points Keur</p><Badge tone="amber">Fidélité</Badge></div>
        <p className="text-3xl font-extrabold text-amber-600">{balance} pts</p>
        <p className="text-sm">≈ {fcfa(balance * rules.pointValueFcfa)} de réduction possible sur des frais de transport ou de livraison.</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
          <li>+{rules.perMission} points à chaque mission terminée, +{rules.perReview} points pour chaque avis laissé.</li>
          <li>1 point = {fcfa(rules.pointValueFcfa)} de réduction, <b>uniquement</b> sur les frais de transport ou de livraison.</li>
          <li>Les points ne sont <b>pas convertibles en argent</b> et ne sont pas échangeables avec le solde en FCFA.</li>
          <li>Si une demande est annulée ou expire, les points utilisés vous sont rendus.</li>
        </ul>
        {keurTx.length > 0 && <ul className="space-y-1 border-t border-emerald-100 pt-2 text-sm">{keurTx.map((t) => <li key={t.id} className="flex justify-between gap-2"><span>{t.reason} · {dateFr(t.createdAt)}</span><b className={t.delta > 0 ? "text-emerald-700" : "text-amber-600"}>{t.delta > 0 ? "+" : ""}{t.delta}</b></li>)}</ul>}
      </Card>

      <Card>
        <p className="font-bold">Moyens de paiement (bientôt)</p>
        <ul className="mt-2 space-y-1 text-ink-soft"><li>📱 Wave</li><li>🟠 Orange Money</li><li>💵 Paiement à la prestation</li></ul>
      </Card>
    </ClientShell>
  );
}
