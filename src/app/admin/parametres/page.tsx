import { AdminShell } from "@/components/AdminShell";
import { SettingsForm } from "@/components/AdminForms";
import { requireRole } from "@/lib/guards";
import { getSettings } from "@/lib/admin";
import { ZONES } from "@/lib/zones";

export default async function AdminSettings() {
  await requireRole("ADMIN");
  const s = await getSettings();
  return <AdminShell title="Paramètres"><SettingsForm commission={s.commission} zones={Object.keys(ZONES)} active={s.zones} /></AdminShell>;
}
