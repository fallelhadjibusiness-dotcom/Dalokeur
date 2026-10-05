import { notFound } from "next/navigation";
import { ClientShell } from "@/components/ClientShell";
import { Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { getClientRequest } from "@/lib/requests";
import { dateFr, fcfa } from "@/lib/format";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("CLIENT");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const r = await getClientRequest(user.id, id);
  if (!r || r.status !== "COMPLETED") notFound();
  const provider = r.assignments[0]?.provider.user.fullName ?? "—";
  return (
    <ClientShell title="Reçu">
      <Card>
        <p className="rounded bg-amber-100 px-2 py-1 text-xs font-bold">DÉMONSTRATION — aucun paiement réel</p>
        <dl className="mt-3 space-y-2">
          <div><dt className="text-sm text-ink-soft">Référence</dt><dd className="font-bold">{r.reference}</dd></div>
          <div><dt className="text-sm text-ink-soft">Service</dt><dd className="font-bold">{r.service.name}</dd></div>
          <div><dt className="text-sm text-ink-soft">Prestataire</dt><dd className="font-bold">{provider}</dd></div>
          <div><dt className="text-sm text-ink-soft">Terminé le</dt><dd className="font-bold">{r.completedAt ? dateFr(r.completedAt) : "—"}</dd></div>
          <div><dt className="text-sm text-ink-soft">Montant</dt><dd className="font-bold">{r.estimateFcfa != null ? fcfa(r.estimateFcfa) : "Montant convenu après diagnostic"}</dd></div>
          <div><dt className="text-sm text-ink-soft">Mode de paiement</dt><dd className="font-bold">À la prestation (démo)</dd></div>
        </dl>
      </Card>
    </ClientShell>
  );
}
