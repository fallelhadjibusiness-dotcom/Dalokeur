"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guards";
import { cancelVisit, requestVisit } from "@/lib/property";
import type { FormState } from "@/lib/session-actions";

export async function requestVisitAction(propertyId: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireRole("CLIENT");
  const r = await requestVisit(user.id, propertyId, { preferredAt: String(fd.get("preferredAt") ?? ""), message: String(fd.get("message") ?? "") });
  if (!r.ok) return { errors: { ...(r.errors ?? {}), form: r.error } };
  redirect(`/client/immobilier/visites/${r.id}`);
}

export async function cancelVisitAction(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireRole("CLIENT");
  const r = await cancelVisit(user.id, id, String(fd.get("reason") ?? ""));
  revalidatePath("/client/immobilier", "layout");
  return r.ok ? { ok: true } : { errors: { form: r.error } };
}
