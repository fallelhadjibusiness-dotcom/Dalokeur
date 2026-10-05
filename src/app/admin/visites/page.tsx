import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { ActionButton, NoteAction } from "@/components/AdminControls";
import { ConfirmVisitForm } from "@/components/VisitAdminForms";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { adminListVisits, VISIT_LABELS } from "@/lib/property";
import { cancelVisitAdminAction, completeVisitAction } from "../actions";
import { dateFr } from "@/lib/format";

const TABS = [["", "Toutes"], ["REQUESTED", "Demandées"], ["CONFIRMED", "Confirmées"], ["DONE", "Effectuées"], ["CANCELLED", "Annulées"]];

export default async function AdminVisits({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await requireRole("ADMIN");
  const { status } = await searchParams;
  const visits = await adminListVisits(admin.id, status);
  return (
    <AdminShell title="Visites">
      <nav className="flex gap-2 overflow-x-auto">{TABS.map(([s, l]) => <Link key={s} href={`/admin/visites${s ? `?status=${s}` : ""}`} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${(status ?? "") === s ? "bg-emerald-600 text-white" : "bg-white text-emerald-800"}`}>{l}</Link>)}</nav>
      {visits.length === 0 && <Card>Aucune visite.</Card>}
      <ul className="space-y-3">{visits.map((v) => (
        <li key={v.id}><Card className="space-y-2">
          <div className="flex items-start justify-between gap-2"><p className="font-extrabold">{v.property.title}</p><Badge tone={v.status === "CANCELLED" ? "red" : v.status === "REQUESTED" ? "amber" : "green"}>{VISIT_LABELS[v.status]}</Badge></div>
          <p className="text-sm">👤 {v.client.fullName} — {v.client.phone}</p>
          <p className="text-sm text-ink-soft">{v.status === "REQUESTED" ? `Créneau souhaité : ${v.preferredAt ? dateFr(v.preferredAt) : "—"}` : v.scheduledAt ? `Créneau : ${dateFr(v.scheduledAt)}` : ""}</p>
          {v.message && <p className="text-sm">« {v.message} »</p>}
          {v.cancelReason && <p className="text-sm text-red-700">Motif : {v.cancelReason}</p>}
          {v.status === "REQUESTED" && <ConfirmVisitForm id={v.id} />}
          {v.status === "CONFIRMED" && <ActionButton variant="primary" label="Marquer comme effectuée" action={completeVisitAction.bind(null, v.id)} />}
          {(v.status === "REQUESTED" || v.status === "CONFIRMED") && <NoteAction label="Annuler la visite" variant="danger" name="reason" placeholder="Motif (obligatoire)" action={cancelVisitAdminAction.bind(null, v.id)} />}
        </Card></li>
      ))}</ul>
    </AdminShell>
  );
}
