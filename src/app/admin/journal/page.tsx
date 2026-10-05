import { AdminShell } from "@/components/AdminShell";
import { Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { listAdminActions } from "@/lib/admin";
import { dateFr } from "@/lib/format";

export default async function AdminJournal() {
  const admin = await requireRole("ADMIN");
  const rows = await listAdminActions(admin.id);
  return (
    <AdminShell title="Journal des actions">
      <ul className="space-y-2">{rows.map((a) => <li key={a.id}><Card><p className="font-bold">{a.action}</p><p className="text-sm text-ink-soft">{a.admin.fullName} · {dateFr(a.createdAt)} · {a.targetType}{a.targetId ? ` ${a.targetId.slice(0, 8)}` : ""}</p></Card></li>)}</ul>
      {rows.length === 0 && <Card>Aucune action.</Card>}
    </AdminShell>
  );
}
