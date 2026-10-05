import { ClientShell } from "@/components/ClientShell";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { getWallet } from "@/lib/requests";
import { dateFr, fcfa } from "@/lib/format";

export default async function WalletPage() {
  const user = await requireRole("CLIENT");
  const { wallet, keur, keurTx } = await getWallet(user.id);
  return (
    <ClientShell title="Portefeuille">
      <Card>
        <div className="flex items-center justify-between"><p className="font-bold">Solde en FCFA</p><Badge tone="amber">Démonstration</Badge></div>
        <p className="mt-1 text-3xl font-extrabold">{fcfa(wallet?.balanceFcfa ?? 0)}</p>
        <p className="mt-1 text-sm text-ink-soft">Aucun vrai paiement n'est connecté pour le moment.</p>
      </Card>
      <Card className="border-amber-400">
        <p className="font-bold">Points Keur</p>
        <p className="mt-1 text-3xl font-extrabold text-amber-600">{keur?.balance ?? 0} pts</p>
        <p className="mt-1 text-sm text-ink-soft">Les points Keur réduisent uniquement les frais de transport ou de livraison. Ils ne sont pas convertibles en argent.</p>
        {keurTx.length > 0 && <ul className="mt-3 space-y-1 text-sm">{keurTx.map((t) => <li key={t.id} className="flex justify-between"><span>{t.reason} · {dateFr(t.createdAt)}</span><b>{t.delta > 0 ? "+" : ""}{t.delta}</b></li>)}</ul>}
      </Card>
      <Card>
        <p className="font-bold">Moyens de paiement (bientôt)</p>
        <ul className="mt-2 space-y-1 text-ink-soft"><li>📱 Wave</li><li>🟠 Orange Money</li><li>💵 Paiement à la prestation</li></ul>
      </Card>
    </ClientShell>
  );
}
