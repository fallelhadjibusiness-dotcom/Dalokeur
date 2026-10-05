// Logique métier des demandes côté client. Toutes les fonctions reçoivent l'identité
// du client et filtrent par propriétaire : un client ne peut jamais lire ou modifier la demande d'un autre.
import { Prisma, type RequestMode } from "@prisma/client";
import { db } from "./db";
import { canReview, cancelPolicy } from "./policies";
import { canTransition } from "./status";
import { zoneOfDistrict } from "./zones";
import { locationSchema, reviewSchema, formErrors } from "./validation";
import { z } from "zod";
import { approximatePoint, isInDakarArea } from "./geo";
import { getSettings } from "./admin";
import { notify } from "./notifications";
import { endSharingTx } from "./tracking";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; errors?: Record<string, string> };

const URGENT_WINDOW_MS = 3 * 60 * 60_000;
const MIN_LEAD_MS = 60 * 60_000;
const MAX_LEAD_MS = 30 * 24 * 60 * 60_000;

const createSchema = locationSchema.extend({
  serviceSlug: z.string().min(1, "Choisissez un service."),
  mode: z.enum(["URGENT", "SCHEDULED"], { error: "Choisissez le type de demande." }),
  description: z.string().trim().min(10, "Décrivez votre besoin en quelques mots (10 caractères minimum).").max(1000),
  scheduledAt: z.string().optional(),
  // Position facultative (GPS ou épingle déplacée). Vide = saisie manuelle.
  lat: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().finite().optional()),
  lng: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().finite().optional()),
  accuracy: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(0).max(100000).optional()),
  source: z.enum(["GPS", "PIN", "MANUAL"]).optional().catch("MANUAL"),
});

export type CreateRequestInput = z.input<typeof createSchema>;

function newReference() {
  return `DK-${Date.now().toString(36).toUpperCase().slice(-4)}${Math.floor(Math.random() * 900 + 100)}`;
}

export async function createRequest(clientId: string, input: CreateRequestInput, now = new Date()): Promise<Result<{ id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Veuillez corriger le formulaire.", errors: formErrors(parsed.error) };
  const d = parsed.data;

  const service = await db.service.findFirst({ where: { slug: d.serviceSlug, isActive: true, category: { isActive: true } } });
  if (!service) return { ok: false, error: "Service indisponible.", errors: { serviceSlug: "Service indisponible." } };

  let scheduledAt: Date | null = null;
  let expiresAt: Date;
  if (d.mode === "URGENT") {
    if (!service.allowsUrgent) return { ok: false, error: "Ce service n'est pas disponible en urgence.", errors: { mode: "Ce service n'est pas disponible en urgence." } };
    expiresAt = new Date(now.getTime() + URGENT_WINDOW_MS);
  } else {
    scheduledAt = d.scheduledAt ? new Date(d.scheduledAt) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return { ok: false, error: "Choisissez un créneau.", errors: { scheduledAt: "Choisissez une date et une heure." } };
    const lead = scheduledAt.getTime() - now.getTime();
    if (lead < MIN_LEAD_MS) return { ok: false, error: "Créneau trop proche.", errors: { scheduledAt: "Choisissez un créneau dans au moins 1 heure." } };
    if (lead > MAX_LEAD_MS) return { ok: false, error: "Créneau trop lointain.", errors: { scheduledAt: "Choisissez un créneau dans les 30 prochains jours." } };
    expiresAt = scheduledAt;
  }

  const zone = zoneOfDistrict(d.district);
  if (!zone || !(await getSettings()).zones.includes(zone)) return { ok: false, error: "Quartier hors zone.", errors: { district: "Ce quartier n'est pas encore couvert." } };

  let geo: { lat: number; lng: number; accuracyM: number | null; approxLat: number; approxLng: number } | null = null;
  if (d.lat != null || d.lng != null) {
    if (d.lat == null || d.lng == null || !isInDakarArea(d.lat, d.lng)) {
      return { ok: false, error: "Position hors zone.", errors: { location: "Cette position est hors de la zone couverte (Dakar et Pikine). Choisissez votre quartier et saisissez l'adresse." } };
    }
    geo = { lat: d.lat, lng: d.lng, accuracyM: d.accuracy ?? null, ...approximatePoint(d.lat, d.lng) };
  }

  const request = await db.$transaction(async (tx) => {
    const location = await tx.location.create({
      data: {
        ownerUserId: clientId, district: d.district, addressLine: d.addressLine, landmark: d.landmark,
        source: geo ? (d.source === "PIN" ? "PIN" : "GPS") : "MANUAL",
        ...(geo ? { lat: geo.lat, lng: geo.lng, accuracyM: geo.accuracyM, approxLat: geo.approxLat, approxLng: geo.approxLng } : {}),
      },
    });
    const created = await tx.serviceRequest.create({
      data: {
        reference: newReference(), clientId, serviceId: service.id, mode: d.mode as RequestMode,
        description: d.description, locationId: location.id, zone, scheduledAt, expiresAt,
        priceMode: service.priceMode, estimateFcfa: service.priceMode === "FIXED_ESTIMATE" ? service.basePriceFcfa : null,
        status: "NEW",
      },
    });
    await tx.requestStatusHistory.create({ data: { requestId: created.id, toStatus: "NEW", actorId: clientId, note: "Demande créée" } });
    return created;
  });
  return { ok: true, id: request.id };
}

export async function getClientRequest(clientId: string, id: string) {
  return db.serviceRequest.findFirst({
    where: { id, clientId },
    include: {
      service: true,
      location: true,
      history: { orderBy: { createdAt: "asc" } },
      review: true,
      assignments: {
        where: { status: { in: ["OFFERED", "ACCEPTED"] } },
        orderBy: { offeredAt: "desc" },
        take: 1,
        include: { provider: { include: { user: { select: { fullName: true } } } } },
      },
    },
  });
}

export async function listClientRequests(clientId: string) {
  return db.serviceRequest.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { service: { select: { name: true } }, location: { select: { district: true } } },
  });
}

async function setStatus(tx: Prisma.TransactionClient, id: string, from: Parameters<typeof canTransition>[0], to: Parameters<typeof canTransition>[1], actorId: string, note?: string, extra: Prisma.ServiceRequestUpdateInput = {}) {
  // Verrou optimiste : la mise à jour n'a lieu que si le statut n'a pas changé entre-temps.
  const res = await tx.serviceRequest.updateMany({ where: { id, status: from }, data: { status: to, ...(extra as object) } });
  if (res.count !== 1) throw new Error("STATE_CHANGED");
  await tx.requestStatusHistory.create({ data: { requestId: id, fromStatus: from, toStatus: to, actorId, note } });
}

export async function cancelClientRequest(clientId: string, id: string, reason?: string): Promise<Result> {
  const request = await db.serviceRequest.findFirst({ where: { id, clientId } });
  if (!request) return { ok: false, error: "Demande introuvable." };
  const decision = cancelPolicy(request.status);
  if (!decision.allowed) return { ok: false, error: decision.message };
  const cleanReason = reason?.trim();
  if (decision.reasonRequired && !cleanReason) return { ok: false, error: "Indiquez le motif de l'annulation.", errors: { reason: "Le motif est obligatoire après acceptation." } };
  if (!canTransition(request.status, "CANCELLED")) return { ok: false, error: "Annulation impossible." };

  try {
    await db.$transaction(async (tx) => {
      await setStatus(tx, id, request.status, "CANCELLED", clientId, cleanReason || "Annulée par le client", {
        cancelledBy: clientId, cancelReason: cleanReason || null,
      });
      const active = await tx.assignment.findMany({ where: { requestId: id, status: { in: ["OFFERED", "ACCEPTED"] } }, include: { provider: { select: { userId: true } } } });
      await tx.assignment.updateMany({ where: { requestId: id, status: { in: ["OFFERED", "ACCEPTED"] } }, data: { status: "CANCELLED", respondedAt: new Date() } });
      await endSharingTx(tx, id);
      for (const a of active) await notify(tx, a.provider.userId, "mission.cancelled", "Mission annulée", `Le client a annulé la mission ${request.reference}.`, { requestId: id });
      // Remboursement des points Keur utilisés
      if (request.keurPointsUsed > 0) {
        await tx.keurPoints.update({ where: { userId: clientId }, data: { balance: { increment: request.keurPointsUsed } } });
        await tx.keurPointTransaction.create({ data: { userId: clientId, delta: request.keurPointsUsed, reason: "Remboursement : mission annulée", requestId: id } });
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STATE_CHANGED") return { ok: false, error: "Le statut de la demande vient de changer. Actualisez la page." };
    throw e;
  }
  return { ok: true };
}

// Le client confirme que le service est terminé (depuis « en cours » ou « arrivé »).
export async function confirmCompletion(clientId: string, id: string): Promise<Result> {
  const request = await db.serviceRequest.findFirst({ where: { id, clientId } });
  if (!request) return { ok: false, error: "Demande introuvable." };
  if (request.status !== "IN_PROGRESS") return { ok: false, error: "Le service n'est pas en cours." };
  try {
    await db.$transaction(async (tx) => {
      await setStatus(tx, id, "IN_PROGRESS", "COMPLETED", clientId, "Fin du service confirmée par le client", { completedAt: new Date() });
      await endSharingTx(tx, id);
      const accepted = await tx.assignment.findFirst({ where: { requestId: id, status: "ACCEPTED" } });
      if (accepted) {
        const p = await tx.providerProfile.update({ where: { id: accepted.providerId }, data: { missionsDone: { increment: 1 } } });
        await notify(tx, p.userId, "mission.completed", "Mission terminée", `Le client a confirmé la fin de la mission ${request.reference}.`, { requestId: id });
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STATE_CHANGED") return { ok: false, error: "Le statut vient de changer. Actualisez la page." };
    throw e;
  }
  return { ok: true };
}

export async function submitReview(clientId: string, id: string, input: { rating: unknown; comment?: string }): Promise<Result> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Avis invalide.", errors: formErrors(parsed.error) };
  const request = await db.serviceRequest.findFirst({
    where: { id, clientId },
    include: { review: true, assignments: { where: { status: "ACCEPTED" }, take: 1 } },
  });
  if (!request) return { ok: false, error: "Demande introuvable." };
  const decision = canReview({ id: clientId, role: "CLIENT" }, request, !!request.review);
  if (!decision.allowed) return { ok: false, error: decision.message ?? "Avis impossible." };
  const assignment = request.assignments[0];
  if (!assignment) return { ok: false, error: "Aucun prestataire à noter." };

  try {
    await db.$transaction(async (tx) => {
      await tx.review.create({ data: { requestId: id, clientId, providerId: assignment.providerId, rating: parsed.data.rating, comment: parsed.data.comment || null } });
      const agg = await tx.review.aggregate({ where: { providerId: assignment.providerId, isHidden: false }, _avg: { rating: true } });
      const p = await tx.providerProfile.update({ where: { id: assignment.providerId }, data: { ratingAvg: Number((agg._avg.rating ?? 0).toFixed(1)) } });
      await notify(tx, p.userId, "review.new", "Nouvel avis", `Vous avez reçu une note de ${parsed.data.rating}/5.`, { requestId: id });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "Vous avez déjà donné votre avis." };
    throw e;
  }
  return { ok: true };
}

export async function reportProblem(clientId: string, id: string, reason: string): Promise<Result> {
  const text = reason.trim();
  if (text.length < 5) return { ok: false, error: "Décrivez le problème.", errors: { reason: "Décrivez le problème (5 caractères minimum)." } };
  const request = await db.serviceRequest.findFirst({ where: { id, clientId } });
  if (!request) return { ok: false, error: "Demande introuvable." };
  await db.dispute.create({ data: { requestId: id, openedBy: clientId, reason: text.slice(0, 1000) } });
  return { ok: true };
}

export async function getWallet(clientId: string) {
  const [wallet, keur] = await Promise.all([
    db.wallet.findUnique({ where: { userId: clientId }, include: { transactions: { orderBy: { createdAt: "desc" }, take: 20 } } }),
    db.keurPoints.findUnique({ where: { userId: clientId } }),
  ]);
  const keurTx = await db.keurPointTransaction.findMany({ where: { userId: clientId }, orderBy: { createdAt: "desc" }, take: 20 });
  return { wallet, keur, keurTx };
}
