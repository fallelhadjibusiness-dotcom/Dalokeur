import Link from "next/link";
import { Card } from "@/components/ui";
import { listNotifications } from "@/lib/notifications";
import { dateFr } from "@/lib/format";
import { markNotificationsReadAction } from "@/app/messages/actions";

export async function NotificationsList({ userId, requestHref }: { userId: string; requestHref: (id: string) => string }) {
  const items = await listNotifications(userId);
  const hasUnread = items.some((n) => !n.readAt);
  return (
    <div className="space-y-3">
      {hasUnread && <form action={markNotificationsReadAction}><button className="min-h-10 rounded-xl2 border-2 border-emerald-600 px-4 text-sm font-bold text-emerald-700">Tout marquer comme lu</button></form>}
      {items.length === 0 && <Card>Aucune notification.</Card>}
      <ul className="space-y-2">
        {items.map((n) => {
          const requestId = (n.data as { requestId?: string } | null)?.requestId;
          const inner = (
            <Card className={n.readAt ? "" : "border-amber-400 bg-amber-100"}>
              <p className="font-bold">{n.title}</p><p className="text-sm">{n.body}</p><p className="mt-1 text-xs text-ink-soft">{dateFr(n.createdAt)}</p>
            </Card>
          );
          return <li key={n.id}>{requestId ? <Link href={requestHref(requestId)}>{inner}</Link> : inner}</li>;
        })}
      </ul>
    </div>
  );
}
