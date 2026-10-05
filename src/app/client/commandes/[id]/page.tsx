import { notFound } from "next/navigation";
import Link from "next/link";
import { ClientShell } from "@/components/ClientShell";
import { CancelForm, CompleteButton, ReportForm, ReviewForm } from "@/components/RequestActions";
import { Chat } from "@/components/Chat";
import { DynamicMap } from "@/components/DynamicMap";
import { LiveTrackingPanel } from "@/components/LiveTrackingPanel";
import { getLiveLocation } from "@/lib/tracking";
import { listMessages } from "@/lib/chat";
import { StatusTimeline } from "@/components/StatusTimeline";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { getClientRequest } from "@/lib/requests";
import { cancelPolicy } from "@/lib/policies";
import { PriceBreakdown } from "@/components/PriceBreakdown";
import { dateFr } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/status";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("CLIENT");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const r = await getClientRequest(user.id, id);
  if (!r) notFound(); // y compris la demande d'un autre client : même réponse qu'une demande inexistante
  const assignment = r.assignments[0];
  const provider = assignment?.provider;
  const cancel = cancelPolicy(r.status);
  const live = await getLiveLocation({ id: user.id, role: "CLIENT" }, r.id);
  const chat = await listMessages({ id: user.id, role: "CLIENT" }, r.id);

  return (
    <ClientShell title={r.service.name}>
      <p className="-mt-2 text-sm text-ink-soft">Réf. {r.reference} · {r.mode === "URGENT" ? "Urgente" : r.scheduledAt ? `Créneau : ${dateFr(r.scheduledAt)}` : "Programmée"}</p>
      <StatusTimeline status={r.status} />

      {provider ? (
        <Card>
          <p className="text-sm font-bold text-ink-soft">Votre prestataire</p>
          <p className="text-lg font-extrabold">{provider.user.fullName}</p>
          <p>{provider.jobTitle}</p>
          <p className="mt-1 text-sm">⭐ {Number(provider.ratingAvg).toFixed(1)} · {provider.missionsDone} missions réalisées</p>
          <div className="mt-2"><Badge tone={provider.status === "VERIFIED" ? "green" : "amber"}>{provider.status === "VERIFIED" ? "Prestataire vérifié" : "Vérification en cours"}</Badge></div>
        </Card>
      ) : r.status !== "CANCELLED" && r.status !== "COMPLETED" ? (
        <Card>Nous recherchons un prestataire vérifié dans votre zone. Vous serez informé dès qu'il est affecté.</Card>
      ) : null}

      <Card>
        <p className="font-bold">Votre demande</p>
        <p className="mt-1">{r.description}</p>
        <p className="mt-2 text-sm text-ink-soft">📍 {r.location.district} — {r.location.addressLine} ({r.location.landmark})</p>
        <div className="mt-2 border-t border-emerald-100 pt-2"><PriceBreakdown priceMode={r.priceMode} estimateFcfa={r.estimateFcfa} transportFeeFcfa={r.transportFeeFcfa} keurPointsUsed={r.keurPointsUsed} keurDiscountFcfa={r.keurDiscountFcfa} /></div>
      </Card>

      {live && live.state !== "unavailable" && <LiveTrackingPanel requestId={r.id} initial={live} />}
      {r.location.lat != null && r.location.lng != null && r.status !== "CANCELLED" && (
        <section aria-label="Votre adresse sur la carte" className="space-y-1">
          <DynamicMap center={{ lat: r.location.lat, lng: r.location.lng }} zoom={16} height={180} ariaLabel="Carte : votre adresse" markers={[{ id: "home", lat: r.location.lat, lng: r.location.lng, color: "#d99a1f" }]} />
        </section>
      )}
      {chat ? <Chat requestId={r.id} initial={chat.messages} canSend={chat.canSend} /> : r.status !== "CANCELLED" && <Card className="text-sm text-ink-soft">💬 La messagerie s'ouvre dès qu'un prestataire accepte votre demande.</Card>}

      {r.status === "IN_PROGRESS" && <CompleteButton id={r.id} />}
      {r.status === "COMPLETED" && (r.review
        ? <Card><p className="font-bold">Votre avis : {"⭐".repeat(r.review.rating)}</p>{r.review.comment && <p className="mt-1 text-sm">{r.review.comment}</p>}</Card>
        : <ReviewForm id={r.id} />)}
      {r.status === "COMPLETED" && <Link href={`/client/commandes/${r.id}/recu`} className="block rounded-xl2 border-2 border-emerald-600 p-3 text-center font-bold text-emerald-700">🧾 Voir le reçu (démonstration)</Link>}
      {cancel.allowed && <CancelForm id={r.id} reasonRequired={cancel.reasonRequired} />}
      <ReportForm id={r.id} />

      <details className="text-sm"><summary className="cursor-pointer font-bold">Historique</summary>
        <ul className="mt-2 space-y-1">{r.history.map((h) => <li key={h.id}>{dateFr(h.createdAt)} — {STATUS_LABELS[h.toStatus]}{h.note ? ` (${h.note})` : ""}</li>)}</ul>
      </details>
    </ClientShell>
  );
}
