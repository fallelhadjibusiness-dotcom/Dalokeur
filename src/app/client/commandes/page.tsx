import Link from "next/link";
import { ClientShell } from "@/components/ClientShell";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { listClientRequests } from "@/lib/requests";
import { STATUS_LABELS } from "@/lib/status";
import { dateFr } from "@/lib/format";

export default async function OrdersPage() {
  const user = await requireRole("CLIENT");
  const requests = await listClientRequests(user.id);
  return (
    <ClientShell title="Mes commandes">
      {requests.length === 0 ? <Card>Vous n'avez pas encore de commande.</Card> : (
        <ul className="space-y-2">
          {requests.map((r) => (
            <li key={r.id}><Link href={`/client/commandes/${r.id}`}><Card className="flex items-center justify-between gap-2">
              <div><p className="font-extrabold">{r.service.name}</p><p className="text-sm text-ink-soft">{r.location.district} · {dateFr(r.createdAt)}</p><p className="text-xs text-ink-soft">{r.reference}</p></div>
              <Badge tone={r.status === "CANCELLED" ? "red" : r.status === "COMPLETED" ? "gray" : "green"}>{STATUS_LABELS[r.status]}</Badge>
            </Card></Link></li>
          ))}
        </ul>
      )}
    </ClientShell>
  );
}
