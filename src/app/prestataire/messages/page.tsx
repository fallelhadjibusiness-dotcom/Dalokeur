import { ProviderShell } from "@/components/ProviderShell";
import { Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";

export default async function MessagesPage() {
  await requireRole("PROVIDER");
  return <ProviderShell title="Messages"><Card>La messagerie par mission arrive bientôt. Vous pourrez discuter avec le client dès l'acceptation d'une mission.</Card></ProviderShell>;
}
