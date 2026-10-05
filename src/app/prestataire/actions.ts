"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { RequestStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { acceptMission, advanceMission, declineMission, setAvailability } from "@/lib/missions";
import type { Result } from "@/lib/requests";
import type { FormState } from "@/lib/session-actions";
import { formErrors } from "@/lib/validation";
import { ZONES } from "@/lib/zones";

const toState = (r: Result): FormState => (r.ok ? { ok: true } : { errors: { ...(r.errors ?? {}), form: r.error } });

async function run(fn: (uid: string) => Promise<Result>): Promise<FormState> {
  const user = await requireRole("PROVIDER"); // revérifié en base à chaque action
  const r = await fn(user.id);
  revalidatePath("/prestataire", "layout");
  return toState(r);
}

export async function acceptAction(id: string) { return run((u) => acceptMission(u, id)); }
export async function declineAction(id: string, _: FormState, fd: FormData) { return run((u) => declineMission(u, id, String(fd.get("reason") ?? ""))); }
export async function advanceAction(id: string, to: RequestStatus) { return run((u) => advanceMission(u, id, to)); }
export async function availabilityAction(available: boolean) { return run((u) => setAvailability(u, available)); }

const profileSchema = z.object({
  jobTitle: z.string().trim().min(2, "Indiquez votre métier.").max(60),
  bio: z.string().trim().max(500).optional(),
  experienceYears: z.coerce.number().int().min(0).max(60),
  zones: z.array(z.string().refine((z) => Object.keys(ZONES).includes(z))).min(1, "Choisissez au moins une zone."),
});

export async function updateProfileAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireRole("PROVIDER");
  const parsed = profileSchema.safeParse({ jobTitle: fd.get("jobTitle"), bio: fd.get("bio") || undefined, experienceYears: fd.get("experienceYears"), zones: fd.getAll("zones") });
  if (!parsed.success) return { errors: formErrors(parsed.error) };
  // Le statut de vérification n'est jamais modifiable ici : seule l'administration le change.
  await db.providerProfile.update({ where: { userId: user.id }, data: parsed.data });
  revalidatePath("/prestataire", "layout");
  return { ok: true };
}
