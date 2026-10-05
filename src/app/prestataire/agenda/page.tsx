import { ProviderShell } from "@/components/ProviderShell";
import { MissionCard } from "@/components/MissionCard";
import { Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { listMissions } from "@/lib/missions";

const dayFr = (d: Date) => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Dakar" }).format(d);

export default async function AgendaPage() {
  const user = await requireRole("PROVIDER");
  const missions = [...(await listMissions(user.id, "ongoing")), ...(await listMissions(user.id, "upcoming"))];
  const groups = new Map<string, typeof missions>();
  for (const m of missions) {
    const key = m.preview.scheduledAt ? dayFr(m.preview.scheduledAt) : "Urgences à traiter";
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return (
    <ProviderShell title="Agenda">
      {groups.size === 0 ? <Card>Aucune mission planifiée.</Card> : [...groups].map(([day, list]) => (
        <section key={day}><h2 className="mb-2 font-extrabold capitalize">{day}</h2><ul className="space-y-2">{list.map((m) => <li key={m.preview.id}><MissionCard m={m} /></li>)}</ul></section>
      ))}
    </ProviderShell>
  );
}
