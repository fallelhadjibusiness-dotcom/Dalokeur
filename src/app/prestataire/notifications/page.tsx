import { ProviderShell } from "@/components/ProviderShell";
import { NotificationsList } from "@/components/NotificationsList";
import { requireRole } from "@/lib/guards";

export default async function ProviderNotifications() {
  const user = await requireRole("PROVIDER");
  return <ProviderShell title="Notifications"><NotificationsList userId={user.id} requestHref={(id) => `/prestataire/missions/${id}`} /></ProviderShell>;
}
