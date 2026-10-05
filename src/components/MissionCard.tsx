import Link from "next/link";
import { Badge, Card } from "./ui";
import type { Mission } from "@/lib/missions";
import { STATUS_LABELS } from "@/lib/status";
import { dateFr } from "@/lib/format";

export function MissionCard({ m }: { m: Mission }) {
  const p = m.preview;
  return (
    <Link href={`/prestataire/missions/${p.id}`}>
      <Card className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-extrabold">{p.service}</p>
          <Badge tone={p.status === "CANCELLED" ? "red" : p.mode === "URGENT" ? "amber" : "green"}>{p.mode === "URGENT" && p.status === "NEW" ? "Urgent" : STATUS_LABELS[p.status]}</Badge>
        </div>
        <p className="text-sm text-ink-soft">📍 {p.district} ({p.zone}){m.full ? ` — ${m.full.address}` : ""}</p>
        <p className="text-sm text-ink-soft">🕒 {p.scheduledAt ? dateFr(p.scheduledAt) : "Dès que possible"}</p>
        <p className="line-clamp-2">{p.description}</p>
        <p className="text-sm font-bold">{p.priceLabel}</p>
      </Card>
    </Link>
  );
}
