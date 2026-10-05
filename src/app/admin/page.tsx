import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { getKpis } from "@/lib/admin";
import { fcfa } from "@/lib/format";

export default async function AdminHome() {
  await requireRole("ADMIN");
  const [k, pending, disputes] = await Promise.all([getKpis(), db.providerProfile.count({ where: { status: "PENDING" } }), db.dispute.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } })]);
  const tiles: [string, string | number][] = [
    ["Demandes totales", k.total], ["Nouvelles demandes", k.newRequests], ["Interventions en cours", k.inProgress], ["Missions terminées", k.completed],
    ["Annulations", k.cancelled], ["Prestataires actifs", k.activeProviders], ["Note moyenne", k.ratingAvg ? `⭐ ${k.ratingAvg} (${k.reviewCount})` : "—"],
    ["Taux d'acceptation", k.acceptanceRate == null ? "—" : `${k.acceptanceRate} %`], ["Volume estimé", fcfa(k.volumeFcfa)], [`Chiffre d'affaires estimé (${k.commission} %)`, fcfa(k.revenueFcfa)],
  ];
  return (
    <AdminShell title="Tableau de bord">
      {(pending > 0 || disputes > 0) && (
        <Card className="space-y-1 border-amber-400 bg-amber-100">
          {pending > 0 && <p><Link href="/admin/prestataires?status=PENDING" className="font-bold underline">{pending} prestataire(s)</Link> en attente de validation</p>}
          {disputes > 0 && <p><Link href="/admin/litiges" className="font-bold underline">{disputes} litige(s)</Link> à traiter</p>}
        </Card>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(([label, value]) => <li key={label}><Card className="h-full"><p className="text-sm text-ink-soft">{label}</p><p className="mt-1 text-xl font-extrabold text-emerald-800">{value}</p></Card></li>)}
      </ul>
      <p className="text-xs text-ink-soft">Montants estimés à partir des prix indicatifs des missions terminées. Les devis « après diagnostic » ne sont pas comptés. Aucun paiement réel.</p>
    </AdminShell>
  );
}
