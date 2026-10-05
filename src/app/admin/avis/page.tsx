import { AdminShell } from "@/components/AdminShell";
import { ActionButton } from "@/components/AdminControls";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { listReviews } from "@/lib/admin";
import { reviewHiddenAction } from "../actions";
import { dateFr } from "@/lib/format";

export default async function AdminReviews() {
  const admin = await requireRole("ADMIN");
  const reviews = await listReviews(admin.id);
  return (
    <AdminShell title="Avis">
      {reviews.length === 0 && <Card>Aucun avis.</Card>}
      <ul className="space-y-2">{reviews.map((r) => (
        <li key={r.id}><Card className="space-y-1">
          <div className="flex items-center justify-between"><p className="font-bold">{"⭐".repeat(r.rating)} <span className="text-sm font-normal text-ink-soft">{r.request.reference}</span></p>{r.isHidden && <Badge tone="red">Masqué</Badge>}</div>
          <p className="text-sm text-ink-soft">{r.client.fullName} → {r.provider.user.fullName} · {dateFr(r.createdAt)}</p>
          {r.comment && <p>{r.comment}</p>}
          <ActionButton label={r.isHidden ? "Réafficher" : "Masquer"} action={reviewHiddenAction.bind(null, r.id, !r.isHidden)} />
        </Card></li>
      ))}</ul>
    </AdminShell>
  );
}
