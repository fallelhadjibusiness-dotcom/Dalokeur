// Logique métier prestataire. Toutes les fonctions partent de l'identité du prestataire (userId)
// et appliquent : vérification admin, zone + métier, et masquage des données privées avant acceptation.
import { Prisma, type RequestStatus } from "@prisma/client";
import { db } from "./db";
import { toProviderFull, toProviderPreview, type ProviderRequestFull, type ProviderRequestPreview } from "./dto";
import { canProviderAccept, canSeePrivateDetails, isRequestVisibleToProvider } from "./policies";
import { canTransition, PRE_ACCEPTANCE } from "./status";
import type { Result } from "./requests";
import { notify } from "./notifications";
import { STATUS_LABELS } from "./status";

export type MissionTab = "new" | "upcoming" | "ongoing" | "done" | "cancelled";
export type Mission = { preview: ProviderRequestPreview; full: ProviderRequestFull | null; assignmentStatus: string | null };

const include = {
  service: { select: { name: true } },
  location: true,
  client: { select: { fullName: true, phone: true } },
} satisfies Prisma.ServiceRequestInclude;

export async function getProviderContext(userId: string) {
  const profile = await db.providerProfile.findUnique({ where: { userId }, include: { services: true, user: { select: { fullName: true, phone: true } } } });
  if (!profile) return null;
  return { profile, serviceIds: profile.services.map((s) => s.serviceId) };
}

type Row = Prisma.ServiceRequestGetPayload<{ include: typeof include }>;

// Un seul point de sortie vers le prestataire : full uniquement si la politique l'autorise.
function toMission(userId: string, row: Row, assignment: { status: string } | null): Mission {
  const allowed = canSeePrivateDetails({ id: userId, role: "PROVIDER" }, { clientId: row.clientId }, assignment ? { providerUserId: userId, status: assignment.status as "ACCEPTED" } : null);
  return { preview: toProviderPreview(row), full: allowed ? toProviderFull(row) : null, assignmentStatus: assignment?.status ?? null };
}

export async function listMissions(userId: string, tab: MissionTab, now = new Date()): Promise<Mission[]> {
  const ctx = await getProviderContext(userId);
  if (!ctx) return [];
  const { profile, serviceIds } = ctx;

  if (tab === "new") {
    if (profile.status !== "VERIFIED") return [];
    const rows = await db.serviceRequest.findMany({
      where: {
        status: { in: PRE_ACCEPTANCE },
        zone: { in: profile.zones }, serviceId: { in: serviceIds },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        // ni refusée par moi, ni réservée à un autre prestataire
        assignments: { none: { OR: [{ providerId: profile.id, status: { in: ["DECLINED", "CANCELLED"] } }, { providerId: { not: profile.id }, status: { in: ["OFFERED", "ACCEPTED"] } }] } },
      },
      include: { ...include, assignments: { where: { providerId: profile.id } } },
      orderBy: [{ mode: "asc" }, { createdAt: "desc" }], take: 50,
    });
    return rows.filter((r) => isRequestVisibleToProvider({ status: profile.status, zones: profile.zones, serviceIds }, { zone: r.zone, serviceId: r.serviceId, status: r.status })).map((r) => toMission(userId, r, r.assignments[0] ?? null));
  }

  const statusFilter: Record<Exclude<MissionTab, "new">, { req: RequestStatus[]; asg: ("ACCEPTED" | "CANCELLED")[] }> = {
    upcoming: { req: ["ACCEPTED"], asg: ["ACCEPTED"] },
    ongoing: { req: ["EN_ROUTE", "ARRIVED", "IN_PROGRESS"], asg: ["ACCEPTED"] },
    done: { req: ["COMPLETED"], asg: ["ACCEPTED"] },
    cancelled: { req: ["CANCELLED"], asg: ["CANCELLED"] },
  };
  const f = statusFilter[tab];
  const rows = await db.serviceRequest.findMany({
    where: { status: { in: f.req }, assignments: { some: { providerId: profile.id, status: { in: f.asg } } } },
    include: { ...include, assignments: { where: { providerId: profile.id } } },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }], take: 50,
  });
  return rows.map((r) => toMission(userId, r, r.assignments[0] ?? null));
}

export async function getMission(userId: string, requestId: string): Promise<Mission | null> {
  const ctx = await getProviderContext(userId);
  if (!ctx) return null;
  const { profile, serviceIds } = ctx;
  const row = await db.serviceRequest.findUnique({ where: { id: requestId }, include: { ...include, assignments: { where: { providerId: profile.id } } } });
  if (!row) return null;
  const mine = row.assignments[0] ?? null;
  const visible = mine || isRequestVisibleToProvider({ status: profile.status, zones: profile.zones, serviceIds }, { zone: row.zone, serviceId: row.serviceId, status: row.status });
  return visible ? toMission(userId, row, mine) : null;
}

export async function acceptMission(userId: string, requestId: string): Promise<Result> {
  const ctx = await getProviderContext(userId);
  if (!ctx) return { ok: false, error: "Profil prestataire introuvable." };
  const { profile, serviceIds } = ctx;
  if (!canProviderAccept(profile.status, profile.available)) {
    return { ok: false, error: profile.status !== "VERIFIED" ? "Votre compte doit être validé par l'administrateur avant d'accepter une mission." : "Activez votre disponibilité pour accepter une mission." };
  }
  const request = await db.serviceRequest.findUnique({ where: { id: requestId }, include: { assignments: true } });
  if (!request || !isRequestVisibleToProvider({ status: profile.status, zones: profile.zones, serviceIds }, { zone: request.zone, serviceId: request.serviceId, status: request.status })) {
    return { ok: false, error: "Cette mission n'est plus disponible." };
  }
  if (request.expiresAt && request.expiresAt < new Date()) return { ok: false, error: "Cette demande a expiré." };
  if (request.assignments.some((a) => a.providerId !== profile.id && (a.status === "OFFERED" || a.status === "ACCEPTED"))) return { ok: false, error: "Cette mission est réservée à un autre prestataire." };
  if (request.assignments.some((a) => a.providerId === profile.id && (a.status === "DECLINED" || a.status === "CANCELLED"))) return { ok: false, error: "Vous avez refusé cette mission." };

  try {
    await db.$transaction(async (tx) => {
      // Conditionnel : si deux prestataires acceptent en même temps, un seul passe.
      const res = await tx.serviceRequest.updateMany({ where: { id: requestId, status: request.status }, data: { status: "ACCEPTED" } });
      if (res.count !== 1) throw new Error("TAKEN");
      await tx.assignment.upsert({
        where: { requestId_providerId: { requestId, providerId: profile.id } },
        update: { status: "ACCEPTED", respondedAt: new Date() },
        create: { requestId, providerId: profile.id, status: "ACCEPTED", respondedAt: new Date() },
      });
      await tx.requestStatusHistory.create({ data: { requestId, fromStatus: request.status, toStatus: "ACCEPTED", actorId: userId, note: "Mission acceptée" } });
      await notify(tx, request.clientId, "request.accepted", "Demande acceptée", `Un prestataire vérifié a accepté votre demande ${request.reference}.`, { requestId });
    });
  } catch (e) {
    if ((e instanceof Error && e.message === "TAKEN") || (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) return { ok: false, error: "Cette mission vient d'être prise par un autre prestataire." };
    throw e;
  }
  return { ok: true };
}

export async function declineMission(userId: string, requestId: string, reason?: string): Promise<Result> {
  const ctx = await getProviderContext(userId);
  if (!ctx) return { ok: false, error: "Profil prestataire introuvable." };
  const { profile, serviceIds } = ctx;
  const request = await db.serviceRequest.findUnique({ where: { id: requestId }, include: { assignments: { where: { providerId: profile.id } } } });
  const mine = request?.assignments[0];
  if (!request || !(mine || isRequestVisibleToProvider({ status: profile.status, zones: profile.zones, serviceIds }, { zone: request.zone, serviceId: request.serviceId, status: request.status }))) return { ok: false, error: "Mission introuvable." };
  if (mine && mine.status !== "OFFERED") return { ok: false, error: "Vous ne pouvez plus refuser cette mission." };
  if (!PRE_ACCEPTANCE.includes(request.status)) return { ok: false, error: "Vous ne pouvez plus refuser cette mission." };

  await db.$transaction(async (tx) => {
    await tx.assignment.upsert({
      where: { requestId_providerId: { requestId, providerId: profile.id } },
      update: { status: "DECLINED", respondedAt: new Date(), declineReason: reason?.trim() || null },
      create: { requestId, providerId: profile.id, status: "DECLINED", respondedAt: new Date(), declineReason: reason?.trim() || null },
    });
    // Une mission affectée puis refusée retourne dans la file d'attente.
    if (request.status === "ASSIGNED") {
      await tx.serviceRequest.updateMany({ where: { id: requestId, status: "ASSIGNED" }, data: { status: "PENDING" } });
      await tx.requestStatusHistory.create({ data: { requestId, fromStatus: "ASSIGNED", toStatus: "PENDING", actorId: userId, note: "Refusée par le prestataire" } });
    }
  });
  return { ok: true };
}

const PROVIDER_TARGETS: RequestStatus[] = ["EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"];

export async function advanceMission(userId: string, requestId: string, to: RequestStatus): Promise<Result> {
  if (!PROVIDER_TARGETS.includes(to)) return { ok: false, error: "Statut non autorisé." };
  const ctx = await getProviderContext(userId);
  if (!ctx) return { ok: false, error: "Profil prestataire introuvable." };
  const { profile } = ctx;
  if (profile.status !== "VERIFIED") return { ok: false, error: "Compte non vérifié." };
  const request = await db.serviceRequest.findFirst({ where: { id: requestId, assignments: { some: { providerId: profile.id, status: "ACCEPTED" } } } });
  if (!request) return { ok: false, error: "Mission introuvable." };
  if (!canTransition(request.status, to)) return { ok: false, error: "Cette action n'est pas possible à ce stade de la mission." };
  try {
    await db.$transaction(async (tx) => {
      const res = await tx.serviceRequest.updateMany({ where: { id: requestId, status: request.status }, data: { status: to, ...(to === "COMPLETED" ? { completedAt: new Date() } : {}) } });
      if (res.count !== 1) throw new Error("STATE_CHANGED");
      await tx.requestStatusHistory.create({ data: { requestId, fromStatus: request.status, toStatus: to, actorId: userId } });
      await notify(tx, request.clientId, "request.status", "Votre demande avance", `${request.reference} : ${STATUS_LABELS[to]}.`, { requestId });
      if (to === "COMPLETED") await tx.providerProfile.update({ where: { id: profile.id }, data: { missionsDone: { increment: 1 } } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STATE_CHANGED") return { ok: false, error: "Le statut vient de changer. Actualisez la page." };
    throw e;
  }
  return { ok: true };
}

export async function setAvailability(userId: string, available: boolean): Promise<Result> {
  const res = await db.providerProfile.updateMany({ where: { userId }, data: { available } });
  return res.count === 1 ? { ok: true } : { ok: false, error: "Profil introuvable." };
}

export async function getDashboard(userId: string, now = new Date()) {
  const ctx = await getProviderContext(userId);
  if (!ctx) return null;
  const { profile } = ctx;
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
  const mine = { assignments: { some: { providerId: profile.id, status: "ACCEPTED" as const } } };
  const [newCount, today, ongoing, done, earnings] = await Promise.all([
    listMissions(userId, "new", now).then((m) => m.length),
    db.serviceRequest.count({ where: { ...mine, status: { in: ["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"] }, scheduledAt: { gte: startOfDay, lt: endOfDay } } }),
    db.serviceRequest.count({ where: { ...mine, status: { in: ["EN_ROUTE", "ARRIVED", "IN_PROGRESS"] } } }),
    db.serviceRequest.count({ where: { ...mine, status: "COMPLETED" } }),
    getEarnings(userId),
  ]);
  return { profile, newCount, today, ongoing, done, earnings: earnings?.totalNet ?? 0 };
}

// Gains de démonstration : prix estimé − commission. Les devis « après diagnostic » ne comptent pas.
export async function getEarnings(userId: string) {
  const ctx = await getProviderContext(userId);
  if (!ctx) return null;
  const setting = await db.setting.findUnique({ where: { key: "commission_percent" } });
  const commission = typeof setting?.value === "number" ? setting.value : 10;
  const rows = await db.serviceRequest.findMany({
    where: { status: "COMPLETED", assignments: { some: { providerId: ctx.profile.id, status: "ACCEPTED" } } },
    include: { service: { select: { name: true } } }, orderBy: { completedAt: "desc" }, take: 50,
  });
  const lines = rows.map((r) => {
    const gross = r.estimateFcfa ?? 0;
    const net = Math.round(gross * (1 - commission / 100));
    return { id: r.id, reference: r.reference, service: r.service.name, completedAt: r.completedAt, gross, net, quote: r.estimateFcfa == null };
  });
  return { commission, lines, totalNet: lines.reduce((s, l) => s + l.net, 0) };
}

export async function getProviderReviews(userId: string) {
  const ctx = await getProviderContext(userId);
  if (!ctx) return [];
  return db.review.findMany({ where: { providerId: ctx.profile.id, isHidden: false }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, rating: true, comment: true, createdAt: true } });
}
