import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { ActionButton, NoteAction } from "@/components/AdminControls";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { listProviders } from "@/lib/admin";
import { providerStatusAction, verifyProviderAction } from "../actions";

const TABS = [["", "Tous"], ["PENDING", "En attente"], ["VERIFIED", "Vérifiés"], ["REJECTED", "Refusés"], ["SUSPENDED", "Suspendus"]];
const LABELS = { PENDING: "En attente", VERIFIED: "Vérifié", REJECTED: "Refusé", SUSPENDED: "Suspendu" } as const;

export default async function AdminProviders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const admin = await requireRole("ADMIN");
  const f = await searchParams;
  const rows = await listProviders(admin.id, f);
  return (
    <AdminShell title="Prestataires">
      <nav className="flex gap-2 overflow-x-auto">{TABS.map(([s, l]) => <Link key={s} href={`/admin/prestataires${s ? `?status=${s}` : ""}`} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${(f.status ?? "") === s ? "bg-emerald-600 text-white" : "bg-white text-emerald-800"}`}>{l}</Link>)}</nav>
      <form role="search"><input name="q" defaultValue={f.q} placeholder="Nom ou téléphone" aria-label="Recherche" className="min-h-11 w-full rounded-xl2 border-2 border-emerald-100 bg-white px-3" />{f.status && <input type="hidden" name="status" value={f.status} />}</form>
      <ul className="space-y-3">
        {rows.map((p) => (
          <li key={p.id}><Card className="space-y-2">
            <div className="flex items-start justify-between"><div><p className="font-extrabold">{p.user.fullName}</p><p className="text-sm text-ink-soft">{p.jobTitle} · {p.experienceYears} an(s) · {p.user.phone}</p></div>
              <Badge tone={p.status === "VERIFIED" ? "green" : p.status === "PENDING" ? "amber" : "red"}>{LABELS[p.status]}</Badge></div>
            <p className="text-sm">Zones : {p.zones.join(", ")} · Services : {p.services.map((s) => s.service.name).join(", ")}</p>
            <p className="text-sm text-ink-soft">Documents envoyés : {p._count.documents} · ⭐ {Number(p.ratingAvg).toFixed(1)} · {p.missionsDone} missions</p>
            <div className="flex flex-wrap gap-2">
              {p.status !== "VERIFIED" && <ActionButton variant="primary" label="Valider" action={verifyProviderAction.bind(null, p.id)} />}
            </div>
            {p.status !== "REJECTED" && p.status !== "VERIFIED" && <NoteAction label="Refuser" variant="danger" placeholder="Motif du refus (obligatoire)" action={providerStatusAction.bind(null, p.id, "REJECTED")} />}
            {p.status === "VERIFIED" && <NoteAction label="Suspendre" variant="danger" placeholder="Motif de la suspension (obligatoire)" action={providerStatusAction.bind(null, p.id, "SUSPENDED")} />}
          </Card></li>
        ))}
        {rows.length === 0 && <Card>Aucun prestataire.</Card>}
      </ul>
    </AdminShell>
  );
}
