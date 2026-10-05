// Messagerie liée à une mission. Accès : client propriétaire, prestataire ayant ACCEPTÉ, admin (lecture seule).
import type { Role } from "@prisma/client";
import { db } from "./db";
import { canUseChat } from "./policies";
import { notify } from "./notifications";
import { checkRateLimit } from "./rate-limit";
import type { Result } from "./requests";

export type Actor = { id: string; role: Role };
export type ChatMessage = { id: string; mine: boolean; body: string; createdAt: string; read: boolean };

const MAX_LEN = 1000;
const SEND_WINDOW_MS = 48 * 60 * 60_000; // après la fin de la mission, discussion encore ouverte 48 h

async function loadAccess(actor: Actor, requestId: string) {
  const request = await db.serviceRequest.findUnique({
    where: { id: requestId },
    include: { assignments: { where: { status: "ACCEPTED" }, take: 1, include: { provider: { select: { userId: true } } } } },
  });
  if (!request) return null;
  const a = request.assignments[0];
  const assignment = a ? { providerUserId: a.provider.userId, status: a.status } : null;
  if (!assignment) return null; // pas de prestataire accepté : pas de conversation
  if (!canUseChat(actor, { clientId: request.clientId }, assignment)) return null;
  return { request, providerUserId: a.provider.userId };
}

function canSend(actor: Actor, status: string, completedAt: Date | null, now = new Date()) {
  if (actor.role === "ADMIN") return false; // lecture seule
  if (status === "CANCELLED") return false;
  if (status === "COMPLETED") return !!completedAt && now.getTime() - completedAt.getTime() < SEND_WINDOW_MS;
  return true;
}

export async function listMessages(actor: Actor, requestId: string, after?: string) {
  const ctx = await loadAccess(actor, requestId);
  if (!ctx) return null;
  const afterDate = after && !Number.isNaN(Date.parse(after)) ? new Date(after) : undefined;
  const rows = await db.message.findMany({
    where: { requestId, ...(afterDate ? { createdAt: { gte: afterDate } } : {}) },
    orderBy: { createdAt: "asc" }, take: 200,
  });
  // Lecture : les messages de l'autre partie sont marqués lus (sauf pour l'admin, simple observateur).
  if (actor.role !== "ADMIN") await db.message.updateMany({ where: { requestId, senderId: { not: actor.id }, readAt: null }, data: { readAt: new Date() } });
  return {
    canSend: canSend(actor, ctx.request.status, ctx.request.completedAt),
    messages: rows.map<ChatMessage>((m) => ({ id: m.id, mine: m.senderId === actor.id, body: m.body, createdAt: m.createdAt.toISOString(), read: !!m.readAt })),
  };
}

export async function sendMessage(actor: Actor, requestId: string, body: string): Promise<Result<{ message: ChatMessage }>> {
  const ctx = await loadAccess(actor, requestId);
  if (!ctx) return { ok: false, error: "Conversation indisponible." };
  if (!canSend(actor, ctx.request.status, ctx.request.completedAt)) return { ok: false, error: "Cette conversation est fermée." };
  const text = body.trim();
  if (!text) return { ok: false, error: "Écrivez un message." };
  if (text.length > MAX_LEN) return { ok: false, error: `Message trop long (${MAX_LEN} caractères maximum).` };
  if (!checkRateLimit(`chat:${actor.id}`, 20, 60_000)) return { ok: false, error: "Trop de messages. Patientez un instant." };

  const recipient = actor.role === "CLIENT" ? ctx.providerUserId : ctx.request.clientId;
  const m = await db.$transaction(async (tx) => {
    const created = await tx.message.create({ data: { requestId, senderId: actor.id, body: text } });
    await notify(tx, recipient, "message.new", "Nouveau message", `${ctx.request.reference} : ${text.slice(0, 80)}`, { requestId });
    return created;
  });
  return { ok: true, message: { id: m.id, mine: true, body: m.body, createdAt: m.createdAt.toISOString(), read: false } };
}

// Conversations d'un utilisateur (liste des messages non lus par mission).
export async function listConversations(actor: Actor) {
  const where = actor.role === "PROVIDER"
    ? { assignments: { some: { status: "ACCEPTED" as const, provider: { userId: actor.id } } } }
    : { clientId: actor.id, assignments: { some: { status: "ACCEPTED" as const } } };
  const requests = await db.serviceRequest.findMany({
    where, orderBy: { updatedAt: "desc" }, take: 50,
    include: { service: { select: { name: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1 }, _count: { select: { messages: { where: { readAt: null, senderId: { not: actor.id } } } } } },
  });
  return requests.map((r) => ({ id: r.id, reference: r.reference, service: r.service.name, status: r.status, last: r.messages[0]?.body ?? null, lastAt: r.messages[0]?.createdAt ?? null, unread: r._count.messages }));
}
