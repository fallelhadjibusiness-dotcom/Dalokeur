import { ProviderShell } from "@/components/ProviderShell";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { getEarnings } from "@/lib/missions";
import { dateFr, fcfa } from "@/lib/format";

export default async function EarningsPage() {
  const user = await requireRole("PROVIDER");
  const e = await getEarnings(user.id);
  return (
    <ProviderShell title="Gains">
      <Card>
        <div className="flex items-center justify-between"><p className="font-bold">Gains estimés (net)</p><Badge tone="amber">Démonstration</Badge></div>
        <p className="mt-1 text-3xl font-extrabold">{fcfa(e?.totalNet ?? 0)}</p>
        <p className="mt-1 text-sm text-ink-soft">Après commission Dalokeur de {e?.commission ?? 10} %. Aucun versement réel n'est effectué. Les prestations « devis après diagnostic » ne sont pas comptées.</p>
      </Card>
      <ul className="space-y-2">
        {(e?.lines ?? []).map((l) => (
          <li key={l.id}><Card className="flex justify-between"><div><p className="font-bold">{l.service}</p><p className="text-sm text-ink-soft">{l.reference} · {l.completedAt ? dateFr(l.completedAt) : ""}</p></div><b>{l.quote ? "Devis" : fcfa(l.net)}</b></Card></li>
        ))}
      </ul>
    </ProviderShell>
  );
}
