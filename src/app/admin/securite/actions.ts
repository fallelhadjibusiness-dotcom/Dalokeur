"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guards";
import { beginSetup, confirmSetup, disableTwoFactor } from "@/lib/admin-2fa";
import QRCode from "qrcode";

export type SetupState = { secret?: string; qr?: string; recoveryCodes?: string[]; error?: string; done?: boolean };

// skip2fa : cette page doit rester accessible pour activer la 2FA obligatoire.
export async function beginSetupAction(): Promise<SetupState> {
  const user = await requireRole("ADMIN", { skip2fa: true });
  const r = await beginSetup(user.id);
  if (!r.ok) return { error: r.error };
  return { secret: r.secret, qr: await QRCode.toDataURL(r.uri, { margin: 1, width: 220 }) };
}

export async function confirmSetupAction(_: SetupState, fd: FormData): Promise<SetupState> {
  const user = await requireRole("ADMIN", { skip2fa: true });
  const r = await confirmSetup(user.id, String(fd.get("code") ?? ""));
  revalidatePath("/admin/securite");
  return r.ok ? { done: true, recoveryCodes: r.recoveryCodes } : { error: r.error };
}

export async function disableAction(_: SetupState, fd: FormData): Promise<SetupState> {
  const user = await requireRole("ADMIN", { skip2fa: true });
  const r = await disableTwoFactor(user.id, String(fd.get("code") ?? ""));
  revalidatePath("/admin/securite");
  return r.ok ? { done: true } : { error: r.error };
}
