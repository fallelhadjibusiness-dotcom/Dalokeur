import Link from "next/link";
import { ClientShell } from "@/components/ClientShell";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { listClientVisits, PROPERTY_LABELS, VISIT_LABELS } from "@/lib/property";
import { dateFr } from "@/lib/format";

export default async function VisitsPage() {
  const user = await requireRole("CLIENT");
  const visits = await listClientVisits(user.id);
  return (
    <ClientShell title="Mes demandes de visite">
      {visits.length === 0 ? <Card>Aucune demande de visite. <Link href="/client/immobilier" className="font-bold underline">Voir les annonces</Link></Card> : (
        <ul className="space-y-2">{visits.map((v) => (
          <li key={v.id}><Link href={`/client/immobilier/visites/${v.id}`}><Card className="flex items-center justify-between gap-2">
            <div><p className="font-extrabold">{v.property.title}</p><p className="text-sm text-ink-soft">{PROPERTY_LABELS[v.property.propertyType]} · {v.property.district} · {v.scheduledAt ? dateFr(v.scheduledAt) : v.preferredAt ? `souhaitée ${dateFr(v.preferredAt)}` : ""}</p></div>
            <Badge tone={v.status === "CANCELLED" ? "red" : v.status === "REQUESTED" ? "amber" : "green"}>{VISIT_LABELS[v.status]}</Badge>
          </Card></Link></li>
        ))}</ul>
      )}
    </ClientShell>
  );
}
