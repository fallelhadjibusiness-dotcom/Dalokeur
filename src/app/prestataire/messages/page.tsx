import Link from "next/link";
import { ProviderShell } from "@/components/ProviderShell";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { listConversations } from "@/lib/chat";
import { STATUS_LABELS } from "@/lib/status";
import { dateFr } from "@/lib/format";

export default async function MessagesPage() {
  const user = await requireRole("PROVIDER");
  const convs = await listConversations({ id: user.id, role: "PROVIDER" });
  return (
    <ProviderShell title="Messages">
      {convs.length === 0 ? <Card>Vos conversations apparaissent ici dès que vous acceptez une mission.</Card> : (
        <ul className="space-y-2">{convs.map((c) => (
          <li key={c.id}><Link href={`/prestataire/missions/${c.id}`}><Card className="space-y-1">
            <div className="flex items-center justify-between"><p className="font-extrabold">{c.service} · {c.reference}</p>{c.unread > 0 && <Badge tone="amber">{c.unread} nouveau(x)</Badge>}</div>
            <p className="line-clamp-1 text-sm">{c.last ?? "Aucun message"}</p>
            <p className="text-xs text-ink-soft">{STATUS_LABELS[c.status]}{c.lastAt ? ` · ${dateFr(c.lastAt)}` : ""}</p>
          </Card></Link></li>
        ))}</ul>
      )}
    </ProviderShell>
  );
}
