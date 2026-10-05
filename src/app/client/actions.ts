"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guards";
import { cancelClientRequest, confirmCompletion, createRequest, reportProblem, submitReview, type Result } from "@/lib/requests";
import type { FormState } from "@/lib/session-actions";

const toState = (r: Result): FormState => (r.ok ? { ok: true } : { errors: { ...(r.errors ?? {}), form: r.error } });
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function createRequestAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireRole("CLIENT");
  const r = await createRequest(user.id, {
    serviceSlug: str(fd, "serviceSlug"), mode: str(fd, "mode") as "URGENT" | "SCHEDULED",
    description: str(fd, "description"), district: str(fd, "district"), addressLine: str(fd, "addressLine"),
    landmark: str(fd, "landmark"), scheduledAt: str(fd, "scheduledAt") || undefined,
    lat: str(fd, "lat"), lng: str(fd, "lng"), accuracy: str(fd, "accuracy"), source: str(fd, "source") as "GPS" | "PIN" | "MANUAL",
  });
  if (!r.ok) return toState(r);
  redirect(`/client/commandes/${r.id}`);
}

async function act(id: string, fn: (uid: string) => Promise<Result>): Promise<FormState> {
  const user = await requireRole("CLIENT");
  const r = await fn(user.id);
  revalidatePath(`/client/commandes/${id}`);
  revalidatePath("/client/commandes");
  return toState(r);
}

export async function cancelAction(id: string, _: FormState, fd: FormData) {
  return act(id, (u) => cancelClientRequest(u, id, str(fd, "reason")));
}
export async function completeAction(id: string) {
  return act(id, (u) => confirmCompletion(u, id));
}
export async function reviewAction(id: string, _: FormState, fd: FormData) {
  return act(id, (u) => submitReview(u, id, { rating: str(fd, "rating"), comment: str(fd, "comment") }));
}
export async function reportAction(id: string, _: FormState, fd: FormData) {
  return act(id, (u) => reportProblem(u, id, str(fd, "reason")));
}
