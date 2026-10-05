import Link from "next/link";
import { ProviderShell } from "@/components/ProviderShell";
import { MissionCard } from "@/components/MissionCard";
import { Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { getProviderContext, listMissions, type MissionTab } from "@/lib/missions";

const TABS: [MissionTab, string][] = [["new", "Nouvelles demandes"], ["upcoming", "À venir"], ["ongoing", "En cours"], ["done", "Terminées"], ["cancelled", "Annulées"]];

export default async function MissionsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireRole("PROVIDER");
  const raw = (await searchParams).tab;
  const tab = (TABS.find(([t]) => t === raw)?.[0] ?? "new") as MissionTab;
  const [missions, ctx] = await Promise.all([listMissions(user.id, tab), getProviderContext(user.id)]);
  return (
    <ProviderShell title="Missions">
      <nav aria-label="Onglets" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TABS.map(([t, label]) => (
          <Link key={t} href={`/prestataire/missions?tab=${t}`} aria-current={t === tab ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${t === tab ? "bg-emerald-600 text-white" : "bg-white text-emerald-800"}`}>{label}</Link>
        ))}
      </nav>
      {tab === "new" && ctx?.profile.status !== "VERIFIED" && <Card className="bg-amber-100">Votre compte doit être validé pour recevoir des demandes.</Card>}
      {missions.length === 0 ? <Card>Aucune mission dans cet onglet.</Card> : <ul className="space-y-2">{missions.map((m) => <li key={m.preview.id}><MissionCard m={m} /></li>)}</ul>}
    </ProviderShell>
  );
}
