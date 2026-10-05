import { Shell } from "@/components/Shell";
import { Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";

export default async function ClientHome() {
  const user = await requireRole("CLIENT");
  return (
    <Shell title={`Bonjour ${user.fullName.split(" ")[0]}`}>
      <Card>Votre espace client arrive à l'étape 2 : demandes, suivi et avis.</Card>
    </Shell>
  );
}
