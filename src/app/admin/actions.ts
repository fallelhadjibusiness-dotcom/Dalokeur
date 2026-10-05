"use server";
import { revalidatePath } from "next/cache";
import type { DisputeStatus, ProviderStatus } from "@prisma/client";
import { requireRole } from "@/lib/guards";
import * as admin from "@/lib/admin";
import type { Result } from "@/lib/requests";
import type { FormState } from "@/lib/session-actions";

const toState = (r: Result): FormState => (r.ok ? { ok: true } : { errors: { ...(r.errors ?? {}), form: r.error } });
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

// Chaque action revérifie le rôle ADMIN en base (requireRole) puis dans la couche métier (assertAdmin).
async function run(fn: (adminId: string) => Promise<Result>): Promise<FormState> {
  const user = await requireRole("ADMIN");
  const r = await fn(user.id);
  revalidatePath("/admin", "layout");
  return toState(r);
}

export async function assignAction(requestId: string, providerId: string) { return run((a) => admin.assignProvider(a, requestId, providerId)); }
export async function providerStatusAction(providerId: string, status: ProviderStatus, _: FormState, fd: FormData) { return run((a) => admin.setProviderStatus(a, providerId, status, str(fd, "note"))); }
export async function verifyProviderAction(providerId: string) { return run((a) => admin.setProviderStatus(a, providerId, "VERIFIED")); }
export async function userActiveAction(userId: string, active: boolean) { return run((a) => admin.setUserActive(a, userId, active)); }
export async function reviewHiddenAction(reviewId: string, hidden: boolean) { return run((a) => admin.setReviewHidden(a, reviewId, hidden)); }
export async function disputeAction(id: string, status: DisputeStatus, _: FormState, fd: FormData) { return run((a) => admin.updateDispute(a, id, status, str(fd, "resolution"))); }
export async function takeDisputeAction(id: string) { return run((a) => admin.updateDispute(a, id, "IN_REVIEW")); }
export async function categoryActiveAction(id: string, active: boolean) { return run((a) => admin.setCategoryActive(a, id, active)); }

export async function serviceAction(id: string, _: FormState, fd: FormData) {
  return run((a) => admin.updateService(a, id, {
    name: str(fd, "name"), priceMode: str(fd, "priceMode") === "QUOTE_AFTER_DIAGNOSIS" ? "QUOTE_AFTER_DIAGNOSIS" : "FIXED_ESTIMATE",
    basePriceFcfa: str(fd, "basePriceFcfa") ? Number(str(fd, "basePriceFcfa")) : null,
    transportFeeFcfa: str(fd, "transportFeeFcfa") ? Number(str(fd, "transportFeeFcfa")) : null,
    allowsUrgent: fd.get("allowsUrgent") === "on", isActive: fd.get("isActive") === "on",
  }));
}

export async function settingsAction(_: FormState, fd: FormData) {
  return run((a) => admin.updateSettings(a, { commission: Number(str(fd, "commission")), zones: fd.getAll("zones").map(String), keur: { pointValueFcfa: Number(str(fd, "pointValueFcfa")), perMission: Number(str(fd, "perMission")), perReview: Number(str(fd, "perReview")) } }));
}
