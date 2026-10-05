import { Shell } from "@/components/Shell";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";

const LABELS = { PENDING: "En attente de validation", VERIFIED: "Vérifié", REJECTED: "Refusé", SUSPENDED: "Suspendu" } as const;

export default async function ProviderHome() {
  const user = await requireRole("PROVIDER");
  const profile = await db.providerProfile.findUnique({ where: { userId: user.id } });
  const status = profile?.status ?? "PENDING";
  return (
    <Shell title={`Bonjour ${user.fullName.split(" ")[0]}`}>
      <Card>
        <p className="font-bold">Statut de votre compte</p>
        <Badge tone={status === "VERIFIED" ? "green" : status === "PENDING" ? "amber" : "red"}>{LABELS[status]}</Badge>
        {status !== "VERIFIED" && <p className="mt-2 text-sm text-ink-soft">Vous pourrez accepter des missions dès la validation de votre profil par l'administrateur.</p>}
      </Card>
    </Shell>
  );
}
