"use server";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { signIn, signOut } from "@/auth";
import { db } from "./db";
import { clientRegisterSchema, formErrors, loginSchema, providerRegisterSchema } from "./validation";
import { checkRateLimit } from "./rate-limit";
import { homePathForRole, primaryRole } from "./policies";

export type FormState = { errors?: Record<string, string>; ok?: boolean };

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { errors: formErrors(parsed.error) };
  try {
    await signIn("credentials", { phone: parsed.data.phone, password: parsed.data.password, redirect: false });
  } catch (e) {
    if (e instanceof AuthError) return { errors: { form: "Numéro ou mot de passe incorrect, ou trop de tentatives. Réessayez plus tard." } };
    throw e;
  }
  const user = await db.user.findUnique({ where: { phone: parsed.data.phone }, include: { roles: true } });
  const role = user && primaryRole(user.roles.map((r) => r.role));
  redirect(role ? homePathForRole(role) : "/client");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}

export async function registerClientAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = clientRegisterSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { errors: formErrors(parsed.error) };
  const { fullName, phone, password } = parsed.data;
  if (!(await checkRateLimit(`register:${phone}`, 5, 60 * 60_000))) return { errors: { form: "Trop de tentatives. Réessayez plus tard." } };
  if (await db.user.findUnique({ where: { phone } })) return { errors: { phone: "Ce numéro est déjà inscrit." } };
  await db.user.create({
    data: {
      fullName, phone,
      passwordHash: await bcrypt.hash(password, 12),
      roles: { create: { role: "CLIENT" } },
      wallet: { create: { isDemo: true, balanceFcfa: 0 } }, // démo, aucun bonus d'argent
      keurPoints: { create: { balance: 0 } },
    },
  });
  await signIn("credentials", { phone, password, redirectTo: "/client" });
  return { ok: true };
}

// Le rôle est imposé par le serveur : jamais lu depuis le formulaire. ADMIN impossible ici.
export async function registerProviderAction(_: FormState, fd: FormData): Promise<FormState> {
  const raw = { ...Object.fromEntries(fd), serviceSlugs: fd.getAll("serviceSlugs"), zones: fd.getAll("zones") };
  const parsed = providerRegisterSchema.safeParse(raw);
  if (!parsed.success) return { errors: formErrors(parsed.error) };
  const d = parsed.data;
  if (!(await checkRateLimit(`register:${d.phone}`, 5, 60 * 60_000))) return { errors: { form: "Trop de tentatives. Réessayez plus tard." } };
  if (await db.user.findUnique({ where: { phone: d.phone } })) return { errors: { phone: "Ce numéro est déjà inscrit." } };
  const services = await db.service.findMany({ where: { slug: { in: d.serviceSlugs }, isActive: true } });
  if (services.length === 0) return { errors: { serviceSlugs: "Service inconnu." } };
  await db.user.create({
    data: {
      fullName: d.fullName, phone: d.phone,
      passwordHash: await bcrypt.hash(d.password, 12),
      roles: { create: { role: "PROVIDER" } },
      wallet: { create: { isDemo: true } },
      providerProfile: {
        create: {
          jobTitle: d.jobTitle, experienceYears: d.experienceYears, zones: d.zones,
          status: "PENDING", // validation manuelle obligatoire
          services: { create: services.map((s) => ({ serviceId: s.id })) },
        },
      },
    },
  });
  await signIn("credentials", { phone: d.phone, password: d.password, redirectTo: "/prestataire" });
  return { ok: true };
}
