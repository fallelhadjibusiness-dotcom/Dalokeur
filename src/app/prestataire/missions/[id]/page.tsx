import { notFound } from "next/navigation";
import { ProviderShell } from "@/components/ProviderShell";
import { AcceptDecline, AdvanceButton } from "@/components/MissionActions";
import { Chat } from "@/components/Chat";
import { DynamicMap } from "@/components/DynamicMap";
import { ProviderTripPanel } from "@/components/ProviderTripPanel";
import { getProviderTracking } from "@/lib/tracking";
import { listMessages } from "@/lib/chat";
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
  const tracking = m.full ? await getProviderTracking(user.id, p.id) : null;
  const chat = m.full ? await listMessages({ id: user.id, role: "PROVIDER" }, p.id) : null;
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
          {m.full.coords.lat != null && m.full.coords.lng != null && (
            <div className="space-y-2 pt-2">
              <DynamicMap center={{ lat: m.full.coords.lat, lng: m.full.coords.lng }} zoom={16} height={200} ariaLabel="Carte : lieu d'intervention" markers={[{ id: "dest", lat: m.full.coords.lat, lng: m.full.coords.lng, color: "#d99a1f" }]} />
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${m.full.coords.lat},${m.full.coords.lng}`} target="_blank" rel="noopener noreferrer" className="inline-block font-bold text-emerald-700 underline">🧭 Ouvrir l'itinéraire</a>
            </div>
          )}
        </Card>
      ) : (
        <Card className="space-y-1">
          <p className="font-bold">📍 Zone approximative</p>
          <p>{p.district} ({p.zone})</p>
          {p.approx.lat != null && p.approx.lng != null && <DynamicMap center={{ lat: p.approx.lat, lng: p.approx.lng }} zoom={14} height={180} ariaLabel="Carte : zone approximative" approx={{ lat: p.approx.lat, lng: p.approx.lng, radiusM: 500 }} />}
          <p className="text-sm text-ink-soft">🔒 L'adresse exacte et le téléphone du client sont révélés après acceptation.</p>
        </Card>
      )}

      {open && <AcceptDecline id={p.id} canAccept={can} reason={why} />}
      {tracking?.eligible && <ProviderTripPanel requestId={p.id} canStart={tracking.canStart} active={tracking.active} status={p.status} />}
      {m.full && <AdvanceButton id={p.id} status={p.status} />}
      {m.full && chat && <Chat requestId={p.id} initial={chat.messages} canSend={chat.canSend} />}
      {p.status === "CANCELLED" && <Card className="bg-red-100">Cette mission a été annulée. Les informations du client ne sont plus accessibles.</Card>}
    </ProviderShell>
  );
}
