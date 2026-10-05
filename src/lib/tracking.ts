// Suivi en direct d'une mission. Confidentialité : consentement explicite du prestataire, visible seulement par
// le client de CETTE mission (et l'admin), uniquement pendant la mission, purge des trajets.
import type { Prisma, RequestMode } from "@prisma/client";
import { db } from "./db";
import { haversineKm, isInDakarArea } from "./geo";
import { advanceMission } from "./missions";
import { notify } from "./notifications";
import type { Result } from "./requests";

export const LIVE_STATUSES = ["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"];
export const MAX_SHARE_MS = 4 * 60 * 60_000; // partage expiré après 4 h
export const MIN_INTERVAL_MS = 5_000; // l'app envoie ~15 s ; le serveur refuse plus vite que 5 s
export const STALE_MS = 2 * 60_000; // « dernière position connue » au-delà de 2 min
export const RETENTION_MS = 24 * 60 * 60_000; // trajets supprimés 24 h après la fin de mission
const MAX_START_ACCURACY_M = 1000;
const ASSUMED_SPEED_KMH = 25;

type ServiceInfo = { trackingPolicy: string; category: { slug: string } };

// Livraison : toujours. Dépannage : seulement en urgence. Ménage, visites, prestations programmées : jamais.
export function isLiveTrackingEligible(service: ServiceInfo, mode: RequestMode): boolean {
  if (service.trackingPolicy !== "LIVE_ON_CONSENT") return false;
  return service.category.slug === "livraison-locale" || mode === "URGENT";
}

export async function endSharingTx(tx: Prisma.TransactionClient | typeof db, requestId: string) {
  await tx.liveLocationUpdate.updateMany({ where: { assignment: { requestId }, sharingActive: true }, data: { sharingActive: false, endedAt: new Date() } });
}

async function loadMission(providerUserId: string, requestId: string) {
  const request = await db.serviceRequest.findFirst({
    where: { id: requestId, assignments: { some: { status: "ACCEPTED", provider: { userId: providerUserId } } } },
    include: { service: { include: { category: { select: { slug: true } } } }, assignments: { where: { status: "ACCEPTED", provider: { userId: providerUserId } }, take: 1 } },
  });
  if (!request || !request.assignments[0]) return null;
  return { request, assignment: request.assignments[0] };
}

async function activeSession(assignmentId: string) {
  return db.liveLocationUpdate.findFirst({ where: { assignmentId, sharingActive: true, endedAt: null }, orderBy: { recordedAt: "desc" } });
}

type Pos = { lat: number; lng: number; accuracy?: number | null; heading?: number | null };

function validPosition(p: Pos): string | null {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return "Position invalide.";
  if (!isInDakarArea(p.lat, p.lng)) return "Votre position est hors de la zone de service (Dakar et Pikine).";
  return null;
}

// « Commencer le trajet » : consentement explicite requis + première position.
export async function startSharing(providerUserId: string, requestId: string, pos: Pos, consent: boolean): Promise<Result> {
  if (consent !== true) return { ok: false, error: "Vous devez accepter le partage de votre position pour commencer le trajet." };
  const m = await loadMission(providerUserId, requestId);
  if (!m) return { ok: false, error: "Mission introuvable." };
  if (!isLiveTrackingEligible(m.request.service, m.request.mode)) return { ok: false, error: "Le suivi en direct n'est pas prévu pour cette mission." };
  if (!["ACCEPTED", "EN_ROUTE"].includes(m.request.status)) return { ok: false, error: "Le trajet ne peut plus être démarré à ce stade." };
  const bad = validPosition(pos);
  if (bad) return { ok: false, error: bad };
  if (pos.accuracy != null && pos.accuracy > MAX_START_ACCURACY_M) return { ok: false, error: "Signal GPS trop imprécis. Sortez à l'air libre et réessayez." };

  const existing = await activeSession(m.assignment.id);
  const now = new Date();
  if (!existing) {
    await db.liveLocationUpdate.create({ data: { assignmentId: m.assignment.id, lat: pos.lat, lng: pos.lng, accuracyM: pos.accuracy ?? null, heading: pos.heading ?? null, recordedAt: now, consentAt: now, startedAt: now, sharingActive: true } });
    await notify(db, m.request.clientId, "tracking.started", "Prestataire en route", "Vous pouvez suivre sa position en direct jusqu'à la fin de la mission.", { requestId });
  }
  if (m.request.status === "ACCEPTED") {
    const adv = await advanceMission(providerUserId, requestId, "EN_ROUTE");
    if (!adv.ok) { await endSharingTx(db, requestId); return adv; }
  }
  return { ok: true };
}

export async function pushLocation(providerUserId: string, requestId: string, pos: Pos, now = new Date()): Promise<Result<{ active: boolean }>> {
  const m = await loadMission(providerUserId, requestId);
  if (!m) return { ok: false, error: "Mission introuvable." };
  if (!LIVE_STATUSES.includes(m.request.status)) { await endSharingTx(db, requestId); return { ok: false, error: "La mission est terminée : le partage est arrêté." }; }
  const session = await activeSession(m.assignment.id);
  if (!session) return { ok: false, error: "Le partage de position n'est pas actif." };
  if (now.getTime() - session.startedAt.getTime() > MAX_SHARE_MS) { await endSharingTx(db, requestId); return { ok: false, error: "Le partage a expiré. Redémarrez-le si nécessaire." }; }
  const bad = validPosition(pos);
  if (bad) return { ok: false, error: bad };
  if (now.getTime() - session.recordedAt.getTime() < MIN_INTERVAL_MS) return { ok: true, active: true }; // trop rapproché : ignoré
  await db.liveLocationUpdate.create({ data: { assignmentId: m.assignment.id, lat: pos.lat, lng: pos.lng, accuracyM: pos.accuracy ?? null, heading: pos.heading ?? null, recordedAt: now, consentAt: session.consentAt, startedAt: session.startedAt, sharingActive: true } });
  return { ok: true, active: true };
}

export async function stopSharing(providerUserId: string, requestId: string): Promise<Result> {
  const m = await loadMission(providerUserId, requestId);
  if (!m) return { ok: false, error: "Mission introuvable." };
  await endSharingTx(db, requestId);
  return { ok: true };
}

export async function getProviderTracking(providerUserId: string, requestId: string) {
  const m = await loadMission(providerUserId, requestId);
  if (!m) return null;
  const eligible = isLiveTrackingEligible(m.request.service, m.request.mode);
  const session = eligible && LIVE_STATUSES.includes(m.request.status) ? await activeSession(m.assignment.id) : null;
  const expired = !!session && Date.now() - session.startedAt.getTime() > MAX_SHARE_MS;
  if (expired) await endSharingTx(db, requestId);
  return { eligible, active: !!session && !expired, canStart: eligible && ["ACCEPTED", "EN_ROUTE"].includes(m.request.status) };
}

export type LiveState =
  | { state: "unavailable" | "not_started" | "stopped" }
  | { state: "active"; position: { lat: number; lng: number; accuracy: number | null; recordedAt: string }; ageSeconds: number; stale: boolean; etaMinutes: number | null; destination: { lat: number; lng: number } | null };

// Lecture réservée au client propriétaire et à l'admin. Aucune position n'est renvoyée hors partage actif.
export async function getLiveLocation(actor: { id: string; role: "CLIENT" | "PROVIDER" | "ADMIN" }, requestId: string, now = new Date()): Promise<LiveState | null> {
  if (actor.role === "PROVIDER") return null; // le prestataire n'a pas besoin de relire sa position
  const request = await db.serviceRequest.findFirst({
    where: { id: requestId, ...(actor.role === "CLIENT" ? { clientId: actor.id } : {}) },
    include: { location: true, service: { include: { category: { select: { slug: true } } } }, assignments: { where: { status: "ACCEPTED" }, take: 1 } },
  });
  if (!request) return null;
  const assignment = request.assignments[0];
  if (!assignment || !isLiveTrackingEligible(request.service, request.mode)) return { state: "unavailable" };
  if (!LIVE_STATUSES.includes(request.status)) return { state: "stopped" };
  const session = await activeSession(assignment.id);
  if (!session) {
    const any = await db.liveLocationUpdate.findFirst({ where: { assignmentId: assignment.id } });
    return { state: any ? "stopped" : "not_started" };
  }
  if (now.getTime() - session.startedAt.getTime() > MAX_SHARE_MS) { await endSharingTx(db, requestId); return { state: "stopped" }; }
  const dest = request.location.lat != null && request.location.lng != null ? { lat: request.location.lat, lng: request.location.lng } : null;
  const ageSeconds = Math.max(0, Math.round((now.getTime() - session.recordedAt.getTime()) / 1000));
  const km = dest ? haversineKm(session, dest) : null;
  return {
    state: "active", ageSeconds, stale: now.getTime() - session.recordedAt.getTime() > STALE_MS, destination: dest,
    position: { lat: session.lat, lng: session.lng, accuracy: session.accuracyM, recordedAt: session.recordedAt.toISOString() },
    etaMinutes: km == null || !["ACCEPTED", "EN_ROUTE"].includes(request.status) ? null : Math.max(1, Math.ceil((km / ASSUMED_SPEED_KMH) * 60)),
  };
}

// Tâche planifiée : conservation minimale des données de trajet.
export async function purgeTrackingData(now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_MS);
  const expiredStart = new Date(now.getTime() - MAX_SHARE_MS);
  // 1. partages restés actifs trop longtemps ou sur une mission clôturée
  await db.liveLocationUpdate.updateMany({ where: { sharingActive: true, OR: [{ startedAt: { lt: expiredStart } }, { assignment: { request: { status: { in: ["COMPLETED", "CANCELLED"] } } } }] }, data: { sharingActive: false, endedAt: now } });
  // 2. suppression des trajets de missions clôturées depuis plus de 24 h, et de tout trajet de plus de 7 jours
  const old = await db.liveLocationUpdate.deleteMany({
    where: { sharingActive: false, OR: [{ recordedAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60_000) } }, { assignment: { request: { status: { in: ["COMPLETED", "CANCELLED"] }, OR: [{ completedAt: { lt: cutoff } }, { completedAt: null, updatedAt: { lt: cutoff } }] } } }] },
  });
  return { deleted: old.count };
}
