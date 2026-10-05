import { notFound } from "next/navigation";
import { ProviderShell } from "@/components/ProviderShell";
import { AcceptDecline, AdvanceButton } from "@/components/MissionActions";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { getMission, getProviderContext } from "@/lib/missions";
import { canProviderAccept } from "@/lib/policies";
import { STATUS_LABELS, PRE_ACCEPTANCE } from "@/lib/status";
import { dateFr } from "@/lib/format";

export default async function MissionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("PROVIDER");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [m, ctx] = await Promise.all([getMission(user.id, id), getProviderContext(user.id)]);
  if (!m || !ctx) notFound();
  const p = m.preview;
  const open = PRE_ACCEPTANCE.includes(p.status) && m.assignmentStatus !== "DECLINED";
  const can = canProviderAccept(ctx.profile.status, ctx.profile.available);
  const why = ctx.profile.status !== "VERIFIED" ? "Compte non validé : vous ne pouvez pas accepter de mission." : !ctx.profile.available ? "Activez votre disponibilité pour accepter." : undefined;

  return (
    <ProviderShell title={p.service}>
      <div className="-mt-2 flex items-center gap-2"><Badge>{STATUS_LABELS[p.status]}</Badge><span className="text-sm text-ink-soft">Réf. {p.reference}</span></div>
      <Card className="space-y-2">
        <p>{p.description}</p>
        <p className="text-sm">🕒 {p.scheduledAt ? dateFr(p.scheduledAt) : "Dès que possible (urgent)"}</p>
        <p className="text-sm font-bold">{p.priceLabel}</p>
      </Card>

      {m.full ? (
        <Card className="space-y-1 border-emerald-500">
          <p className="font-bold">📍 Lieu d'intervention</p>
          <p>{m.full.district} — {m.full.address}</p>
          <p className="text-sm text-ink-soft">Point de repère : {m.full.landmark}</p>
          <p className="pt-2 font-bold">👤 {m.full.clientName}</p>
          <a href={`tel:${m.full.clientPhone}`} className="font-bold text-emerald-700 underline">{m.full.clientPhone}</a>
        </Card>
      ) : (
        <Card className="space-y-1">
          <p className="font-bold">📍 Zone approximative</p>
          <p>{p.district} ({p.zone})</p>
          <p className="text-sm text-ink-soft">🔒 L'adresse exacte et le téléphone du client sont révélés après acceptation.</p>
        </Card>
      )}

      {open && <AcceptDecline id={p.id} canAccept={can} reason={why} />}
      {m.full && <AdvanceButton id={p.id} status={p.status} />}
      {m.full && <Card className="opacity-70"><p className="font-bold">💬 Messagerie</p><p className="text-sm text-ink-soft">Bientôt disponible.</p></Card>}
      {p.status === "CANCELLED" && <Card className="bg-red-100">Cette mission a été annulée. Les informations du client ne sont plus accessibles.</Card>}
    </ProviderShell>
  );
}
