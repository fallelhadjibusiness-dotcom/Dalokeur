import { AdminShell } from "@/components/AdminShell";
import { ActionButton } from "@/components/AdminControls";
import { ServiceForm } from "@/components/AdminForms";
import { Badge, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { listCatalog } from "@/lib/admin";
import { categoryActiveAction } from "../actions";

export default async function AdminServices() {
  const admin = await requireRole("ADMIN");
  const cats = await listCatalog(admin.id);
  return (
    <AdminShell title="Services et catégories">
      {cats.map((c) => (
        <section key={c.id} className="space-y-2">
          <Card className="flex items-center justify-between gap-2">
            <div><p className="font-extrabold">{c.icon} {c.name}</p><div className="mt-1 flex gap-1">{c.isLaunch ? <Badge>Lancement</Badge> : <Badge tone="gray">Prévu, non promu</Badge>}{!c.isActive && <Badge tone="red">Désactivée</Badge>}</div></div>
            <ActionButton label={c.isActive ? "Désactiver" : "Activer"} action={categoryActiveAction.bind(null, c.id, !c.isActive)} />
          </Card>
          {c.services.map((s) => <ServiceForm key={s.id} s={s} />)}
        </section>
      ))}
    </AdminShell>
  );
}
