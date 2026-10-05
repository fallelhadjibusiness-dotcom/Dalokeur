import { Shell } from "@/components/Shell";
import { Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";

export default async function AdminHome() {
  await requireRole("ADMIN");
  return (
    <Shell title="Administration">
      <Card>Tableau de bord administrateur : étape 4.</Card>
    </Shell>
  );
}
