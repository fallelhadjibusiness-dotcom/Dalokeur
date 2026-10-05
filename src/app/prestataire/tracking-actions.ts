"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guards";
import { pushLocation, startSharing, stopSharing } from "@/lib/tracking";

type Pos = { lat: number; lng: number; accuracy?: number | null; heading?: number | null };
type Out = { ok: true } | { ok: false; error: string };

const clean = (p: Pos): Pos => ({ lat: Number(p.lat), lng: Number(p.lng), accuracy: p.accuracy == null ? null : Number(p.accuracy), heading: p.heading == null ? null : Number(p.heading) });

export async function startTripAction(requestId: string, pos: Pos, consent: boolean): Promise<Out> {
  const user = await requireRole("PROVIDER");
  const r = await startSharing(user.id, requestId, clean(pos), consent === true);
  revalidatePath("/prestataire", "layout");
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
export async function pushLocationAction(requestId: string, pos: Pos): Promise<Out> {
  const user = await requireRole("PROVIDER");
  const r = await pushLocation(user.id, requestId, clean(pos));
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
export async function stopSharingAction(requestId: string): Promise<Out> {
  const user = await requireRole("PROVIDER");
  const r = await stopSharing(user.id, requestId);
  revalidatePath("/prestataire", "layout");
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
