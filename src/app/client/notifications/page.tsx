import { ClientShell } from "@/components/ClientShell";
import { NotificationsList } from "@/components/NotificationsList";
import { requireRole } from "@/lib/guards";

export default async function ClientNotifications() {
  const user = await requireRole("CLIENT");
  return <ClientShell title="Notifications"><NotificationsList userId={user.id} requestHref={(id) => `/client/commandes/${id}`} /></ClientShell>;
}
