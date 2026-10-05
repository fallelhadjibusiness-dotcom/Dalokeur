import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "./db";
import { homePathForRole } from "./policies";

export async function requireRole(role: Role) {
  const session = await auth();
  if (!session?.user) redirect("/connexion");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { roles: true },
  });
  if (!user || !user.isActive || !user.roles.some((r) => r.role === role)) {
    redirect(session.user.role ? homePathForRole(session.user.role) : "/connexion");
  }
  return user;
}
