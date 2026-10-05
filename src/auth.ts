import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { db } from "./lib/db";
import { loginSchema } from "./lib/validation";
import { checkRateLimit } from "./lib/rate-limit";
import type { Role } from "@prisma/client";

const ROLE_PRIORITY: Role[] = ["ADMIN", "PROVIDER", "CLIENT"];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { phone: {}, password: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { phone, password } = parsed.data;
        if (!checkRateLimit(`login:${phone}`, 5, 15 * 60_000)) return null;
        const user = await db.user.findUnique({ where: { phone }, include: { roles: true } });
        if (!user || !user.isActive) return null;
        if (!(await bcrypt.compare(password, user.passwordHash))) return null;
        const role = ROLE_PRIORITY.find((r) => user.roles.some((x) => x.role === r));
        if (!role) return null;
        await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        return { id: user.id, name: user.fullName, role };
      },
    }),
  ],
});
