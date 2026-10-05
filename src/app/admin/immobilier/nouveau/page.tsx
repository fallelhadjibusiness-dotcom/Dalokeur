import { AdminShell } from "@/components/AdminShell";
import { EMPTY_PROPERTY, PropertyForm } from "@/components/PropertyForm";
import { requireRole } from "@/lib/guards";

export default async function NewProperty() {
  await requireRole("ADMIN");
  return <AdminShell title="Nouvelle annonce"><PropertyForm id={null} init={EMPTY_PROPERTY} /></AdminShell>;
}
