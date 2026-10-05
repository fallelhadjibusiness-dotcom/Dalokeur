import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "./db";
import { homePathForRole } from "./policies";

export async function requireRole(role: Role, opts: { skip2fa?: boolean } = {}) {
  const session = await auth();
  if (!session?.user) redirect("/connexion");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { roles: true },
  });
  if (!user || !user.isActive || !user.roles.some((r) => r.role === role)) {
    redirect(session.user.role ? homePathForRole(session.user.role) : "/connexion");
  }
  // Plateforme avec 2FA obligatoire : un admin sans 2FA est dirigé vers la page d'activation.
  if (role === "ADMIN" && !opts.skip2fa && process.env.REQUIRE_ADMIN_2FA === "true" && !user.totpEnabledAt) redirect("/admin/securite");
  return user;
}

// Variante sans redirection pour les routes API : renvoie null si non autorisé. Rôle revérifié en base.
export async function getActor(): Promise<{ id: string; role: Role } | null> {
  const session = await auth();
  if (!session?.user) return null;
  const user = await db.user.findUnique({ where: { id: session.user.id }, include: { roles: true } });
  if (!user || !user.isActive || !user.roles.some((r) => r.role === session.user.role)) return null;
  return { id: user.id, role: session.user.role };
}
