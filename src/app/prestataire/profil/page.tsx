import { ProviderShell } from "@/components/ProviderShell";
import { ProfileMedia } from "@/components/ProfileMedia";
import { ProfileForm } from "@/components/ProfileForm";
import { AvailabilityToggle } from "@/components/MissionActions";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { getProviderReviews } from "@/lib/missions";
import { ZONES } from "@/lib/zones";
import { dateFr } from "@/lib/format";

const LABELS = { PENDING: "En attente", VERIFIED: "Vérifié", REJECTED: "Refusé", SUSPENDED: "Suspendu" } as const;

export default async function ProfilePage() {
  const user = await requireRole("PROVIDER");
  const profile = await db.providerProfile.findUnique({ where: { userId: user.id }, include: { documents: { select: { id: true, kind: true, status: true }, orderBy: { createdAt: "desc" } } } });
  if (!profile) return <ProviderShell title="Profil"><Card>Profil introuvable.</Card></ProviderShell>;
  const reviews = await getProviderReviews(user.id);
  return (
    <ProviderShell title="Mon profil">
      <Card className="space-y-1">
        <p className="text-lg font-extrabold">{user.fullName}</p>
        <p>📞 {user.phone}</p>
        <div className="flex items-center gap-2"><Badge tone={profile.status === "VERIFIED" ? "green" : profile.status === "PENDING" ? "amber" : "red"}>{LABELS[profile.status]}</Badge><span className="text-sm">⭐ {Number(profile.ratingAvg).toFixed(1)} · {profile.missionsDone} missions</span></div>
      </Card>
      <ProfileMedia avatarKey={user.avatarUrl} docs={profile.documents} />
      <AvailabilityToggle available={profile.available} />
      <ProfileForm zones={Object.keys(ZONES)} selected={profile.zones} jobTitle={profile.jobTitle} bio={profile.bio ?? ""} experienceYears={profile.experienceYears} />
      <section><h2 className="mb-2 text-lg font-extrabold">Avis reçus</h2>
        {reviews.length === 0 ? <Card>Pas encore d'avis.</Card> : <ul className="space-y-2">{reviews.map((r) => <li key={r.id}><Card>{"⭐".repeat(r.rating)} <span className="text-sm text-ink-soft">{dateFr(r.createdAt)}</span>{r.comment && <p className="mt-1">{r.comment}</p>}</Card></li>)}</ul>}
      </section>
    </ProviderShell>
  );
}
