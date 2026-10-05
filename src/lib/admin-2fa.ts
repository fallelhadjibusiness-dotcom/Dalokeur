// Double authentification des administrateurs : activation, vérification à la connexion, désactivation.
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { checkRateLimit } from "./rate-limit";
import { decryptSecret, encryptSecret, generateRecoveryCodes, generateSecret, otpauthUri, stepOf, verifyTotp } from "./totp";
import { assertAdmin } from "./admin";
import type { Result } from "./requests";

export async function twoFactorStatus(adminId: string) {
  const u = await db.user.findUnique({ where: { id: adminId }, select: { totpEnabledAt: true, totpSecretEnc: true, totpRecovery: true } });
  return { enabled: !!u?.totpEnabledAt, pending: !!u?.totpSecretEnc && !u?.totpEnabledAt, recoveryLeft: Array.isArray(u?.totpRecovery) ? u.totpRecovery.length : 0 };
}

export const is2faRequired = () => process.env.REQUIRE_ADMIN_2FA === "true";

// Étape 1 : génère un secret (pas encore actif) à scanner dans l'application d'authentification.
export async function beginSetup(adminId: string): Promise<Result<{ secret: string; uri: string }>> {
  await assertAdmin(adminId);
  const u = await db.user.findUniqueOrThrow({ where: { id: adminId } });
  if (u.totpEnabledAt) return { ok: false, error: "La double authentification est déjà active." };
  const secret = generateSecret();
  await db.user.update({ where: { id: adminId }, data: { totpSecretEnc: encryptSecret(secret), totpLastStep: null } });
  return { ok: true, secret, uri: otpauthUri(secret, u.phone) };
}

// Étape 2 : l'admin prouve qu'il a bien configuré l'application ; on active et on remet les codes de secours (une seule fois).
export async function confirmSetup(adminId: string, code: string, now = Date.now()): Promise<Result<{ recoveryCodes: string[] }>> {
  await assertAdmin(adminId);
  if (!(await checkRateLimit(`totp-setup:${adminId}`, 10, 10 * 60_000))) return { ok: false, error: "Trop de tentatives. Réessayez plus tard." };
  const u = await db.user.findUniqueOrThrow({ where: { id: adminId } });
  if (u.totpEnabledAt || !u.totpSecretEnc) return { ok: false, error: "Aucune activation en cours." };
  const step = verifyTotp(decryptSecret(u.totpSecretEnc), code, null, now);
  if (step == null) return { ok: false, error: "Code incorrect. Vérifiez l'heure de votre téléphone et réessayez." };
  const codes = generateRecoveryCodes();
  const hashes = await Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
  await db.$transaction([
    db.user.update({ where: { id: adminId }, data: { totpEnabledAt: new Date(), totpLastStep: step, totpRecovery: hashes } }),
    db.adminAction.create({ data: { adminId, action: "admin.2fa.enable", targetType: "user", targetId: adminId } }),
  ]);
  return { ok: true, recoveryCodes: codes };
}

// Vérification du second facteur à la connexion : code TOTP (anti-rejeu) ou code de secours (usage unique).
export async function verifySecondFactor(userId: string, input: string, now = Date.now()): Promise<boolean> {
  const code = input.trim();
  if (!code) return false;
  if (!(await checkRateLimit(`totp:${userId}`, 8, 10 * 60_000))) return false;
  const u = await db.user.findUnique({ where: { id: userId }, select: { totpSecretEnc: true, totpEnabledAt: true, totpLastStep: true, totpRecovery: true } });
  if (!u?.totpEnabledAt || !u.totpSecretEnc) return false;
  const step = verifyTotp(decryptSecret(u.totpSecretEnc), code, u.totpLastStep, now);
  if (step != null) {
    // Mise à jour conditionnelle : deux connexions simultanées avec le même code → une seule passe.
    const r = await db.user.updateMany({ where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step } });
    return r.count === 1;
  }
  const hashes = Array.isArray(u.totpRecovery) ? (u.totpRecovery as string[]) : [];
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(code.toLowerCase(), hashes[i])) {
      const left = hashes.filter((_, j) => j !== i);
      const r = await db.user.updateMany({ where: { id: userId, totpRecovery: { equals: hashes } }, data: { totpRecovery: left } }); // usage unique
      return r.count === 1;
    }
  }
  return false;
}

export async function disableTwoFactor(adminId: string, code: string, now = Date.now()): Promise<Result> {
  await assertAdmin(adminId);
  if (is2faRequired()) return { ok: false, error: "La double authentification est obligatoire sur cette plateforme." };
  const u = await db.user.findUniqueOrThrow({ where: { id: adminId } });
  if (!u.totpEnabledAt) return { ok: false, error: "La double authentification n'est pas active." };
  if (!(await checkRateLimit(`totp-disable:${adminId}`, 5, 10 * 60_000))) return { ok: false, error: "Trop de tentatives. Réessayez plus tard." };
  if (verifyTotp(decryptSecret(u.totpSecretEnc!), code, u.totpLastStep, now) == null) return { ok: false, error: "Code incorrect." };
  await db.$transaction([
    db.user.update({ where: { id: adminId }, data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null, totpRecovery: Prisma.DbNull } }),
    db.adminAction.create({ data: { adminId, action: "admin.2fa.disable", targetType: "user", targetId: adminId } }),
  ]);
  return { ok: true };
}
export { stepOf };
