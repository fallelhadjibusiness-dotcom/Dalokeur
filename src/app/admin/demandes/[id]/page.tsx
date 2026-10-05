import { notFound } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { ActionButton } from "@/components/AdminControls";
import { Chat } from "@/components/Chat";
import { listMessages } from "@/lib/chat";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { getRequestDetail } from "@/lib/admin";
import { assignAction } from "../../actions";
import { PRE_ACCEPTANCE, STATUS_LABELS } from "@/lib/status";
import { dateFr } from "@/lib/format";
import { priceLabel } from "@/lib/dto";

export default async function AdminRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole("ADMIN");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await getRequestDetail(admin.id, id);
  if (!d) notFound();
  const { request: r, candidates } = d;
  const chat = await listMessages({ id: admin.id, role: "ADMIN" }, r.id);
  const assignable = PRE_ACCEPTANCE.includes(r.status);
  const current = r.assignments.find((a) => a.status === "OFFERED" || a.status === "ACCEPTED");
  return (
    <AdminShell title={`${r.service.name} — ${r.reference}`}>
      <div className="flex items-center gap-2"><Badge>{STATUS_LABELS[r.status]}</Badge><span className="text-sm text-ink-soft">{r.mode === "URGENT" ? "Urgente" : r.scheduledAt ? dateFr(r.scheduledAt) : ""}</span></div>
      <Card className="space-y-1">
        <p>{r.description}</p>
        <p className="text-sm font-bold">{priceLabel(r.priceMode, r.estimateFcfa)}</p>
        <p className="text-sm">👤 {r.client.fullName} — {r.client.phone}</p>
        <p className="text-sm">📍 {r.location.district} — {r.location.addressLine} ({r.location.landmark})</p>
        {r.cancelReason && <p className="text-sm text-red-700">Motif d'annulation : {r.cancelReason}</p>}
      </Card>
      {current && <Card>👷 {current.provider.user.fullName} — {current.status === "ACCEPTED" ? "a accepté" : "en attente de réponse"}</Card>}
      {assignable && (
        <section><h2 className="mb-2 text-lg font-extrabold">Affecter un prestataire</h2>
          {candidates.length === 0 ? <Card>Aucun prestataire vérifié pour cette zone et ce service.</Card> : (
            <ul className="space-y-2">{candidates.map((c) => (
              <li key={c.id}><Card className="flex items-center justify-between gap-2">
                <div><p className="font-bold">{c.user.fullName}</p><p className="text-sm text-ink-soft">⭐ {Number(c.ratingAvg).toFixed(1)} · {c.missionsDone} missions · {c.available ? "disponible" : "indisponible"}</p></div>
                <ActionButton variant="primary" label={current?.providerId === c.id ? "Réaffecter" : "Affecter"} action={assignAction.bind(null, r.id, c.id)} />
              </Card></li>
            ))}</ul>
          )}
        </section>
      )}
      {chat && <Chat requestId={r.id} initial={chat.messages} canSend={false} />}
      <details className="text-sm"><summary className="cursor-pointer font-bold">Historique</summary>
        <ul className="mt-2 space-y-1">{r.history.map((h) => <li key={h.id}>{dateFr(h.createdAt)} — {STATUS_LABELS[h.toStatus]}{h.note ? ` (${h.note})` : ""}</li>)}</ul></details>
    </AdminShell>
  );
}
