import Link from "next/link";
import { ProviderShell } from "@/components/ProviderShell";
import { AvailabilityToggle } from "@/components/MissionActions";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { getDashboard } from "@/lib/missions";
import { fcfa } from "@/lib/format";

const LABELS = { PENDING: "En attente de validation", VERIFIED: "Vérifié", REJECTED: "Refusé", SUSPENDED: "Suspendu" } as const;

export default async function ProviderHome() {
  const user = await requireRole("PROVIDER");
  const d = await getDashboard(user.id);
  if (!d) return <ProviderShell title="Profil introuvable"><Card>Contactez l'assistance.</Card></ProviderShell>;
  const { profile } = d;
  const verified = profile.status === "VERIFIED";
  const stats: [string, string | number, string][] = [
    ["Missions du jour", d.today, "/prestataire/agenda"], ["Nouvelles demandes", d.newCount, "/prestataire/missions?tab=new"],
    ["En cours", d.ongoing, "/prestataire/missions?tab=ongoing"], ["Terminées", d.done, "/prestataire/missions?tab=done"],
    ["Gains estimés", fcfa(d.earnings), "/prestataire/gains"], ["Note moyenne", d.profile.missionsDone ? `⭐ ${Number(profile.ratingAvg).toFixed(1)}` : "—", "/prestataire/profil"],
  ];
  return (
    <ProviderShell title={`Bonjour ${user.fullName.split(" ")[0]}`}>
      <Card className={verified ? "" : "border-amber-400 bg-amber-100"}>
        <div className="flex items-center justify-between"><p className="font-bold">Statut du compte</p><Badge tone={verified ? "green" : profile.status === "PENDING" ? "amber" : "red"}>{LABELS[profile.status]}</Badge></div>
        {!verified && <p className="mt-2 text-sm">{profile.status === "PENDING" ? "Notre équipe examine votre profil. Vous pourrez accepter des missions dès sa validation." : "Votre compte ne permet pas d'accepter de missions. Contactez l'assistance."}</p>}
      </Card>
      <AvailabilityToggle available={profile.available} />
      <ul className="grid grid-cols-2 gap-3">
        {stats.map(([label, value, href]) => (
          <li key={label}><Link href={href}><Card className="h-full"><p className="text-sm text-ink-soft">{label}</p><p className="mt-1 text-2xl font-extrabold text-emerald-800">{value}</p></Card></Link></li>
        ))}
      </ul>
      <p className="text-xs text-ink-soft">Gains en mode démonstration, après commission.</p>
    </ProviderShell>
  );
}
