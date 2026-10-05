import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { db } from "./lib/db";
import { loginSchema } from "./lib/validation";
import { checkRateLimit } from "./lib/rate-limit";
import { primaryRole } from "./lib/policies";
import { verifySecondFactor } from "./lib/admin-2fa";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { phone: {}, password: {}, totp: {} },
      async authorize(raw, request) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { phone, password } = parsed.data;
        // Par numéro (anti-devinette) puis par IP (seuil large : les réseaux mobiles partagent des IP)
        if (!(await checkRateLimit(`login:${phone}`, 10, 15 * 60_000))) return null;
        const ip = request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
        if (ip && !(await checkRateLimit(`login-ip:${ip}`, 100, 15 * 60_000))) return null;
        const user = await db.user.findUnique({ where: { phone }, include: { roles: true } });
        if (!user || !user.isActive) return null;
        if (!(await bcrypt.compare(password, user.passwordHash))) return null;
        const role = primaryRole(user.roles.map((x) => x.role));
        if (!role) return null;
        // Administrateur avec double authentification : code TOTP (ou code de secours) obligatoire.
        if (role === "ADMIN" && user.totpEnabledAt && !(await verifySecondFactor(user.id, String((raw as { totp?: string }).totp ?? "")))) return null;
        await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        return { id: user.id, name: user.fullName, role };
      },
    }),
  ],
});
