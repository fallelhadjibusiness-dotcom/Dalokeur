import { notFound } from "next/navigation";
import { ClientShell } from "@/components/ClientShell";
import { CancelVisitForm } from "@/components/VisitForms";
import { priceText } from "@/components/PropertyCard";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { getClientVisit, VISIT_LABELS } from "@/lib/property";
import { dateFr } from "@/lib/format";

const STEPS = ["REQUESTED", "CONFIRMED", "DONE"] as const;

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("CLIENT");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const v = await getClientVisit(user.id, id); // 404 aussi pour la visite d'un autre client
  if (!v) notFound();
  const current = STEPS.indexOf(v.status as (typeof STEPS)[number]);
  return (
    <ClientShell title="Ma visite">
      <Card className="space-y-1"><p className="font-extrabold">{v.property.title}</p><p>{priceText(v.property)}</p><p className="text-sm text-ink-soft">📍 {v.property.district}</p></Card>
      {v.status === "CANCELLED" ? <p className="rounded-xl2 bg-red-100 p-3 font-bold text-red-700">Visite annulée{v.cancelReason ? ` : ${v.cancelReason}` : ""}</p> : (
        <ol aria-label="Suivi de la visite" className="space-y-1">{STEPS.map((s, i) => (
          <li key={s} aria-current={i === current ? "step" : undefined} className={`rounded-xl2 px-3 py-2 ${i === current ? "bg-emerald-600 font-extrabold text-white" : i < current ? "text-emerald-700" : "text-ink-soft"}`}>{i < current ? "✔" : i === current ? "●" : "○"} {VISIT_LABELS[s]}</li>
        ))}</ol>
      )}
      {v.status === "REQUESTED" && <Card>Notre agence examine votre demande{v.preferredAt ? ` (créneau souhaité : ${dateFr(v.preferredAt)})` : ""}. Vous serez notifié dès la confirmation.</Card>}
      {(v.status === "CONFIRMED" || v.status === "DONE") && (
        <Card className="space-y-1 border-emerald-500">
          <div className="flex items-center justify-between"><p className="font-bold">📍 Lieu de la visite</p><Badge>{VISIT_LABELS[v.status]}</Badge></div>
          {v.scheduledAt && <p>🕒 {dateFr(v.scheduledAt)}</p>}
          <p className="font-bold" data-testid="exact-address">{v.exactAddress}</p>
          {v.agencyNote && <p className="text-sm text-ink-soft">Note de l'agence : {v.agencyNote}</p>}
        </Card>
      )}
      {v.status === "REQUESTED" && <p className="rounded-xl2 bg-cream-100 p-3 text-sm">🔒 L'adresse exacte sera affichée ici après la confirmation de la visite.</p>}
      {(v.status === "REQUESTED" || v.status === "CONFIRMED") && <CancelVisitForm id={v.id} />}
    </ClientShell>
  );
}
