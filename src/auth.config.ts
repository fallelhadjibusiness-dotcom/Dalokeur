import type { NextAuthConfig } from "next-auth";
import { homePathForRole, requiredRoleForPath } from "@/lib/policies";

export const authConfig = {
  pages: { signIn: "/connexion" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid;
      session.user.role = token.role;
      return session;
    },
    // Contrôle d'accès par chemin (1re barrière ; chaque action serveur revérifie en base).
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const needed = requiredRoleForPath(pathname);
      if (!needed) return true;
      const role = auth?.user?.role;
      if (!role) return false; // redirige vers /connexion
      if (role !== needed) return Response.redirect(new URL(homePathForRole(role), request.nextUrl));
      return true;
    },
  },
} satisfies NextAuthConfig;
