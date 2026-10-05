import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { ActionButton } from "@/components/AdminControls";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { listUsers } from "@/lib/admin";
import { userActiveAction } from "../actions";
import { dateFr } from "@/lib/format";

const TABS = [["", "Tous"], ["CLIENT", "Clients"], ["PROVIDER", "Prestataires"], ["ADMIN", "Admins"]];
const ROLE = { CLIENT: "Client", PROVIDER: "Prestataire", ADMIN: "Admin" } as const;

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ role?: string; q?: string }> }) {
  const admin = await requireRole("ADMIN");
  const f = await searchParams;
  const users = await listUsers(admin.id, f);
  return (
    <AdminShell title="Comptes">
      <nav className="flex gap-2 overflow-x-auto">{TABS.map(([r, l]) => <Link key={r} href={`/admin/utilisateurs${r ? `?role=${r}` : ""}`} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${(f.role ?? "") === r ? "bg-emerald-600 text-white" : "bg-white text-emerald-800"}`}>{l}</Link>)}</nav>
      <form role="search"><input name="q" defaultValue={f.q} placeholder="Nom ou téléphone" aria-label="Recherche" className="min-h-11 w-full rounded-xl2 border-2 border-emerald-100 bg-white px-3" />{f.role && <input type="hidden" name="role" value={f.role} />}</form>
      <ul className="space-y-2">
        {users.map((u) => {
          const isAdmin = u.roles.some((r) => r.role === "ADMIN");
          return (
            <li key={u.id}><Card className="flex items-center justify-between gap-2">
              <div><p className="font-bold">{u.fullName}</p><p className="text-sm text-ink-soft">{u.phone} · inscrit le {dateFr(u.createdAt)}</p>
                <div className="mt-1 flex gap-1">{u.roles.map((r) => <Badge key={r.role} tone="gray">{ROLE[r.role]}</Badge>)}{!u.isActive && <Badge tone="red">Désactivé</Badge>}</div></div>
              {!isAdmin && u.id !== admin.id && <ActionButton variant={u.isActive ? "danger" : "primary"} label={u.isActive ? "Désactiver" : "Réactiver"} confirm={u.isActive ? `Désactiver le compte de ${u.fullName} ?` : undefined} action={userActiveAction.bind(null, u.id, !u.isActive)} />}
            </Card></li>
          );
        })}
      </ul>
    </AdminShell>
  );
}
