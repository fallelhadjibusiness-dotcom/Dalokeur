"use server";
import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/guards";
import { sendMessage, type ChatMessage } from "@/lib/chat";
import { markAllRead } from "@/lib/notifications";

export async function sendMessageAction(requestId: string, body: string): Promise<{ ok: true; message: ChatMessage } | { ok: false; error: string }> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "Session expirée. Reconnectez-vous." };
  const r = await sendMessage(actor, requestId, body);
  return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.error };
}

export async function markNotificationsReadAction() {
  const actor = await getActor();
  if (!actor) return;
  await markAllRead(actor.id);
  revalidatePath("/", "layout");
}
