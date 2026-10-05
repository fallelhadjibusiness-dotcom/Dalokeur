import { AdminShell } from "@/components/AdminShell";
import { TwoFactorSetup } from "@/components/TwoFactorSetup";
import { requireRole } from "@/lib/guards";
import { is2faRequired, twoFactorStatus } from "@/lib/admin-2fa";

export default async function SecurityPage() {
  const admin = await requireRole("ADMIN", { skip2fa: true });
  const s = await twoFactorStatus(admin.id);
  return <AdminShell title="Sécurité du compte"><TwoFactorSetup enabled={s.enabled} recoveryLeft={s.recoveryLeft} required={is2faRequired()} /></AdminShell>;
}
