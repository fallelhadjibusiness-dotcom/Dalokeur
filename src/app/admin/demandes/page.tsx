import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { listRequests, type RequestFilters } from "@/lib/admin";
import { STATUS_LABELS } from "@/lib/status";
import { ZONES } from "@/lib/zones";
import { dateFr } from "@/lib/format";

export default async function AdminRequests({ searchParams }: { searchParams: Promise<RequestFilters> }) {
  const admin = await requireRole("ADMIN");
  const f = await searchParams;
  const [rows, services] = await Promise.all([listRequests(admin.id, f), db.service.findMany({ orderBy: { name: "asc" } })]);
  const sel = "min-h-11 w-full rounded-xl2 border-2 border-emerald-100 bg-white px-3 text-sm";
  return (
    <AdminShell title="Demandes">
      <form className="grid grid-cols-2 gap-2" role="search">
        <input name="q" defaultValue={f.q} placeholder="Réf., client, quartier" aria-label="Recherche" className={`${sel} col-span-2`} />
        <select name="status" defaultValue={f.status ?? ""} aria-label="Statut" className={sel}><option value="">Tous statuts</option>{Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select name="service" defaultValue={f.service ?? ""} aria-label="Service" className={sel}><option value="">Tous services</option>{services.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}</select>
        <select name="zone" defaultValue={f.zone ?? ""} aria-label="Zone" className={sel}><option value="">Toutes zones</option>{Object.keys(ZONES).map((z) => <option key={z}>{z}</option>)}</select>
        <span />
        <input type="date" name="from" defaultValue={f.from} aria-label="Du" className={sel} />
        <input type="date" name="to" defaultValue={f.to} aria-label="Au" className={sel} />
        <button className="col-span-2 min-h-11 rounded-xl2 bg-emerald-600 font-bold text-white">Filtrer</button>
      </form>
      <p className="text-sm text-ink-soft">{rows.length} demande(s)</p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id}><Link href={`/admin/demandes/${r.id}`}><Card className="space-y-1">
            <div className="flex items-start justify-between gap-2"><p className="font-extrabold">{r.service.name}</p><Badge tone={r.status === "CANCELLED" ? "red" : r.status === "COMPLETED" ? "gray" : "green"}>{STATUS_LABELS[r.status]}</Badge></div>
            <p className="text-sm text-ink-soft">{r.reference} · {r.client.fullName} · {r.location.district} ({r.zone}) · {dateFr(r.createdAt)}</p>
            {r.assignments[0] && <p className="text-sm">👷 {r.assignments[0].provider.user.fullName}{r.assignments[0].status === "OFFERED" ? " (en attente de réponse)" : ""}</p>}
          </Card></Link></li>
        ))}
      </ul>
    </AdminShell>
  );
}
