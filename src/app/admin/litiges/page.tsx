import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { ActionButton, NoteAction } from "@/components/AdminControls";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { listDisputes } from "@/lib/admin";
import { disputeAction, takeDisputeAction } from "../actions";
import { dateFr } from "@/lib/format";

const LABELS = { OPEN: "Ouvert", IN_REVIEW: "En examen", RESOLVED: "Résolu", REJECTED: "Rejeté" } as const;

export default async function AdminDisputes() {
  const admin = await requireRole("ADMIN");
  const rows = await listDisputes(admin.id);
  return (
    <AdminShell title="Litiges et signalements">
      {rows.length === 0 && <Card>Aucun litige.</Card>}
      <ul className="space-y-3">{rows.map((d) => (
        <li key={d.id}><Card className="space-y-2">
          <div className="flex items-center justify-between"><p className="font-bold">{d.opener.fullName}</p><Badge tone={d.status === "OPEN" ? "red" : d.status === "IN_REVIEW" ? "amber" : "gray"}>{LABELS[d.status]}</Badge></div>
          <p>{d.reason}</p>
          <p className="text-sm text-ink-soft"><Link className="underline" href={`/admin/demandes/${d.request.id}`}>{d.request.reference}</Link> · {dateFr(d.createdAt)}</p>
          {d.resolution && <p className="rounded-xl2 bg-cream-100 p-2 text-sm">Décision : {d.resolution}</p>}
          {(d.status === "OPEN" || d.status === "IN_REVIEW") && (
            <div className="space-y-2">
              {d.status === "OPEN" && <ActionButton label="Prendre en charge" action={takeDisputeAction.bind(null, d.id)} />}
              <NoteAction name="resolution" label="Résoudre" variant="primary" placeholder="Décision prise (obligatoire)" action={disputeAction.bind(null, d.id, "RESOLVED")} />
              <NoteAction name="resolution" label="Rejeter" variant="danger" placeholder="Motif du rejet (obligatoire)" action={disputeAction.bind(null, d.id, "REJECTED")} />
            </div>
          )}
        </Card></li>
      ))}</ul>
    </AdminShell>
  );
}
