// Logique d'administration. Défense en profondeur : chaque fonction revérifie que l'acteur est un admin actif,
// et chaque modification est journalisée dans admin_actions.
import { Prisma, type DisputeStatus, type ProviderStatus, type RequestStatus, type Role } from "@prisma/client";
import { db } from "./db";
import { ZONES } from "./zones";
import { PRE_ACCEPTANCE } from "./status";
import type { Result } from "./requests";

export async function assertAdmin(adminId: string) {
  const u = await db.user.findFirst({ where: { id: adminId, isActive: true, roles: { some: { role: "ADMIN" } } }, select: { id: true } });
  if (!u) throw new Error("FORBIDDEN");
}

async function log(tx: Prisma.TransactionClient | typeof db, adminId: string, action: string, targetType: string, targetId: string | null, details?: Prisma.InputJsonValue) {
  await tx.adminAction.create({ data: { adminId, action, targetType, targetId, details } });
}

async function notify(tx: Prisma.TransactionClient, userId: string, kind: string, title: string, body: string, data?: Prisma.InputJsonValue) {
  await tx.notification.create({ data: { userId, kind, title, body, data } });
}

// ───────── Paramètres ─────────

export async function getSettings() {
  const rows = await db.setting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const commission = typeof map.commission_percent === "number" ? (map.commission_percent as number) : 10;
  const zones = Array.isArray(map.coverage_zones) ? (map.coverage_zones as string[]).filter((z) => z in ZONES) : Object.keys(ZONES);
  return { commission, zones };
}

export async function updateSettings(adminId: string, input: { commission: number; zones: string[] }): Promise<Result> {
  await assertAdmin(adminId);
  if (!Number.isFinite(input.commission) || input.commission < 0 || input.commission > 30) return { ok: false, error: "La commission doit être comprise entre 0 et 30 %.", errors: { commission: "Entre 0 et 30 %." } };
  const zones = input.zones.filter((z) => z in ZONES);
  if (zones.length === 0) return { ok: false, error: "Gardez au moins une zone de couverture.", errors: { zones: "Au moins une zone." } };
  await db.$transaction(async (tx) => {
    await tx.setting.upsert({ where: { key: "commission_percent" }, update: { value: input.commission }, create: { key: "commission_percent", value: input.commission } });
    await tx.setting.upsert({ where: { key: "coverage_zones" }, update: { value: zones }, create: { key: "coverage_zones", value: zones } });
    await log(tx, adminId, "settings.update", "settings", null, { commission: input.commission, zones });
  });
  return { ok: true };
}

// ───────── Indicateurs ─────────

export async function getKpis() {
  const { commission } = await getSettings();
  const [byStatus, activeProviders, rating, asg, completed] = await Promise.all([
    db.serviceRequest.groupBy({ by: ["status"], _count: true }),
    db.providerProfile.count({ where: { status: "VERIFIED", user: { isActive: true } } }),
    db.review.aggregate({ where: { isHidden: false }, _avg: { rating: true }, _count: true }),
    db.assignment.groupBy({ by: ["status"], _count: true }),
    db.serviceRequest.aggregate({ where: { status: "COMPLETED" }, _sum: { estimateFcfa: true } }),
  ]);
  const c = (s: RequestStatus) => byStatus.find((x) => x.status === s)?._count ?? 0;
  const total = byStatus.reduce((n, x) => n + x._count, 0);
  const a = (s: string) => asg.find((x) => x.status === s)?._count ?? 0;
  const answered = a("ACCEPTED") + a("DECLINED") + a("EXPIRED");
  const volume = completed._sum.estimateFcfa ?? 0;
  return {
    total, newRequests: c("NEW") + c("PENDING"), inProgress: c("ACCEPTED") + c("EN_ROUTE") + c("ARRIVED") + c("IN_PROGRESS") + c("ASSIGNED"),
    completed: c("COMPLETED"), cancelled: c("CANCELLED"), activeProviders,
    ratingAvg: rating._avg.rating ? Number(rating._avg.rating.toFixed(1)) : null, reviewCount: rating._count,
    acceptanceRate: answered ? Math.round((a("ACCEPTED") / answered) * 100) : null,
    volumeFcfa: volume, revenueFcfa: Math.round((volume * commission) / 100), commission,
  };
}

// ───────── Demandes ─────────

export type RequestFilters = { status?: string; service?: string; zone?: string; from?: string; to?: string; q?: string };

export async function listRequests(adminId: string, f: RequestFilters) {
  await assertAdmin(adminId);
  const where: Prisma.ServiceRequestWhereInput = {};
  if (f.status) where.status = f.status as RequestStatus;
  if (f.service) where.service = { slug: f.service };
  if (f.zone) where.zone = f.zone;
  if (f.q) where.OR = [{ reference: { contains: f.q.trim(), mode: "insensitive" } }, { client: { fullName: { contains: f.q.trim(), mode: "insensitive" } } }, { location: { district: { contains: f.q.trim(), mode: "insensitive" } } }];
  const createdAt: Prisma.DateTimeFilter = {};
  if (f.from && !Number.isNaN(Date.parse(f.from))) createdAt.gte = new Date(f.from);
  if (f.to && !Number.isNaN(Date.parse(f.to))) createdAt.lt = new Date(new Date(f.to).getTime() + 86_400_000);
  if (createdAt.gte || createdAt.lt) where.createdAt = createdAt;
  return db.serviceRequest.findMany({
    where, orderBy: { createdAt: "desc" }, take: 100,
    include: { service: { select: { name: true } }, client: { select: { fullName: true } }, location: { select: { district: true } },
      assignments: { where: { status: { in: ["OFFERED", "ACCEPTED"] } }, include: { provider: { include: { user: { select: { fullName: true } } } } }, take: 1 } },
  });
}

export async function getRequestDetail(adminId: string, id: string) {
  await assertAdmin(adminId);
  const request = await db.serviceRequest.findUnique({
    where: { id },
    include: { service: true, client: { select: { fullName: true, phone: true } }, location: true, history: { orderBy: { createdAt: "asc" } },
      assignments: { include: { provider: { include: { user: { select: { fullName: true } } } } }, orderBy: { offeredAt: "desc" } } },
  });
  if (!request) return null;
  const candidates = await db.providerProfile.findMany({
    where: { status: "VERIFIED", user: { isActive: true }, zones: { has: request.zone }, services: { some: { serviceId: request.serviceId } } },
    include: { user: { select: { fullName: true } } }, orderBy: [{ available: "desc" }, { ratingAvg: "desc" }],
  });
  return { request, candidates };
}

// Affectation manuelle : le prestataire doit être vérifié, de la bonne zone et du bon métier.
export async function assignProvider(adminId: string, requestId: string, providerId: string): Promise<Result> {
  await assertAdmin(adminId);
  const [request, provider] = await Promise.all([
    db.serviceRequest.findUnique({ where: { id: requestId }, include: { service: { select: { name: true } } } }),
    db.providerProfile.findUnique({ where: { id: providerId }, include: { services: true } }),
  ]);
  if (!request || !provider) return { ok: false, error: "Demande ou prestataire introuvable." };
  if (!PRE_ACCEPTANCE.includes(request.status)) return { ok: false, error: "Cette demande n'est plus affectable (déjà acceptée, terminée ou annulée)." };
  if (provider.status !== "VERIFIED") return { ok: false, error: "Seul un prestataire vérifié peut recevoir une mission." };
  if (!provider.zones.includes(request.zone) || !provider.services.some((s) => s.serviceId === request.serviceId)) return { ok: false, error: "Ce prestataire ne couvre pas cette zone ou ce service." };

  try {
    await db.$transaction(async (tx) => {
      const res = await tx.serviceRequest.updateMany({ where: { id: requestId, status: request.status }, data: { status: "ASSIGNED" } });
      if (res.count !== 1) throw new Error("STATE_CHANGED");
      await tx.assignment.updateMany({ where: { requestId, status: "OFFERED", providerId: { not: providerId } }, data: { status: "CANCELLED", respondedAt: new Date() } });
      await tx.assignment.upsert({
        where: { requestId_providerId: { requestId, providerId } },
        update: { status: "OFFERED", assignedBy: adminId, offeredAt: new Date(), respondedAt: null, declineReason: null },
        create: { requestId, providerId, status: "OFFERED", assignedBy: adminId },
      });
      await tx.requestStatusHistory.create({ data: { requestId, fromStatus: request.status, toStatus: "ASSIGNED", actorId: adminId, note: "Affectation manuelle par l'administration" } });
      await notify(tx, provider.userId, "mission.assigned", "Nouvelle mission", `Une mission de ${request.service.name} vous a été affectée.`, { requestId });
      await notify(tx, request.clientId, "request.assigned", "Prestataire affecté", "Un prestataire vérifié a été affecté à votre demande.", { requestId });
      await log(tx, adminId, "request.assign", "service_request", requestId, { providerId });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STATE_CHANGED") return { ok: false, error: "Le statut de la demande vient de changer. Actualisez la page." };
    throw e;
  }
  return { ok: true };
}

// ───────── Prestataires ─────────

export async function listProviders(adminId: string, f: { status?: string; q?: string }) {
  await assertAdmin(adminId);
  return db.providerProfile.findMany({
    where: { ...(f.status ? { status: f.status as ProviderStatus } : {}), ...(f.q ? { user: { OR: [{ fullName: { contains: f.q, mode: "insensitive" as const } }, { phone: { contains: f.q } }] } } : {}) },
    include: { user: { select: { fullName: true, phone: true, isActive: true } }, services: { include: { service: { select: { name: true } } } }, _count: { select: { documents: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100,
  });
}

export async function setProviderStatus(adminId: string, providerId: string, status: ProviderStatus, note?: string): Promise<Result> {
  await assertAdmin(adminId);
  if (!["VERIFIED", "REJECTED", "SUSPENDED"].includes(status)) return { ok: false, error: "Statut invalide." };
  const provider = await db.providerProfile.findUnique({ where: { id: providerId } });
  if (!provider) return { ok: false, error: "Prestataire introuvable." };
  if ((status === "REJECTED" || status === "SUSPENDED") && !note?.trim()) return { ok: false, error: "Indiquez un motif.", errors: { note: "Le motif est obligatoire." } };

  await db.$transaction(async (tx) => {
    await tx.providerProfile.update({ where: { id: providerId }, data: { status, verifiedAt: status === "VERIFIED" ? new Date() : provider.verifiedAt, verifiedById: status === "VERIFIED" ? adminId : provider.verifiedById } });
    if (status !== "VERIFIED") {
      // Les missions pas encore commencées retournent dans la file d'attente.
      const open = await tx.assignment.findMany({ where: { providerId, status: { in: ["OFFERED", "ACCEPTED"] }, request: { status: { in: ["ASSIGNED", "ACCEPTED"] } } }, include: { request: true } });
      for (const a of open) {
        await tx.assignment.update({ where: { id: a.id }, data: { status: "CANCELLED", respondedAt: new Date() } });
        await tx.serviceRequest.update({ where: { id: a.requestId }, data: { status: "PENDING" } });
        await tx.requestStatusHistory.create({ data: { requestId: a.requestId, fromStatus: a.request.status, toStatus: "PENDING", actorId: adminId, note: "Prestataire retiré : mission remise en attente" } });
        await notify(tx, a.request.clientId, "request.reassign", "Nouvelle recherche de prestataire", "Votre prestataire n'est plus disponible : nous en cherchons un autre.", { requestId: a.requestId });
      }
    }
    const labels = { VERIFIED: "Votre compte est validé : vous pouvez accepter des missions.", REJECTED: "Votre candidature n'a pas été retenue.", SUSPENDED: "Votre compte est suspendu." } as const;
    await notify(tx, provider.userId, "provider.status", "Statut de votre compte", labels[status as "VERIFIED"]);
    await log(tx, adminId, `provider.${status.toLowerCase()}`, "provider_profile", providerId, { note: note?.trim() ?? null });
  });
  return { ok: true };
}

// ───────── Comptes ─────────

export async function listUsers(adminId: string, f: { role?: string; q?: string }) {
  await assertAdmin(adminId);
  return db.user.findMany({
    where: { ...(f.role ? { roles: { some: { role: f.role as Role } } } : {}), ...(f.q ? { OR: [{ fullName: { contains: f.q, mode: "insensitive" as const } }, { phone: { contains: f.q } }] } : {}) },
    include: { roles: true }, orderBy: { createdAt: "desc" }, take: 100,
  });
}

export async function setUserActive(adminId: string, userId: string, active: boolean): Promise<Result> {
  await assertAdmin(adminId);
  if (userId === adminId) return { ok: false, error: "Vous ne pouvez pas désactiver votre propre compte." };
  const user = await db.user.findUnique({ where: { id: userId }, include: { roles: true } });
  if (!user) return { ok: false, error: "Compte introuvable." };
  if (user.roles.some((r) => r.role === "ADMIN")) return { ok: false, error: "Un compte administrateur ne peut pas être modifié ici." };
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { isActive: active } });
    await log(tx, adminId, active ? "user.activate" : "user.deactivate", "user", userId);
  });
  return { ok: true };
}

// ───────── Avis et litiges ─────────

export async function listReviews(adminId: string) {
  await assertAdmin(adminId);
  return db.review.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { client: { select: { fullName: true } }, provider: { include: { user: { select: { fullName: true } } } }, request: { select: { reference: true } } } });
}

export async function setReviewHidden(adminId: string, reviewId: string, hidden: boolean): Promise<Result> {
  await assertAdmin(adminId);
  const review = await db.review.findUnique({ where: { id: reviewId } });
  if (!review) return { ok: false, error: "Avis introuvable." };
  await db.$transaction(async (tx) => {
    await tx.review.update({ where: { id: reviewId }, data: { isHidden: hidden } });
    const agg = await tx.review.aggregate({ where: { providerId: review.providerId, isHidden: false }, _avg: { rating: true } });
    await tx.providerProfile.update({ where: { id: review.providerId }, data: { ratingAvg: Number((agg._avg.rating ?? 0).toFixed(1)) } });
    await log(tx, adminId, hidden ? "review.hide" : "review.show", "review", reviewId);
  });
  return { ok: true };
}

export async function listDisputes(adminId: string, status?: string) {
  await assertAdmin(adminId);
  return db.dispute.findMany({ where: status ? { status: status as DisputeStatus } : {}, orderBy: { createdAt: "desc" }, take: 100, include: { opener: { select: { fullName: true } }, request: { select: { reference: true, id: true } } } });
}

export async function updateDispute(adminId: string, disputeId: string, status: DisputeStatus, resolution?: string): Promise<Result> {
  await assertAdmin(adminId);
  if (!["IN_REVIEW", "RESOLVED", "REJECTED"].includes(status)) return { ok: false, error: "Statut invalide." };
  if ((status === "RESOLVED" || status === "REJECTED") && !resolution?.trim()) return { ok: false, error: "Indiquez la décision prise.", errors: { resolution: "La décision est obligatoire." } };
  const d = await db.dispute.findUnique({ where: { id: disputeId } });
  if (!d) return { ok: false, error: "Litige introuvable." };
  await db.$transaction(async (tx) => {
    await tx.dispute.update({ where: { id: disputeId }, data: { status, resolution: resolution?.trim() || d.resolution, resolvedBy: status === "IN_REVIEW" ? null : adminId } });
    await notify(tx, d.openedBy, "dispute.update", "Votre signalement", status === "IN_REVIEW" ? "Votre signalement est en cours d'examen." : "Votre signalement a été traité.", { disputeId });
    await log(tx, adminId, `dispute.${status.toLowerCase()}`, "dispute", disputeId);
  });
  return { ok: true };
}

// ───────── Services et catégories ─────────

export async function listCatalog(adminId: string) {
  await assertAdmin(adminId);
  return db.serviceCategory.findMany({ orderBy: { sortOrder: "asc" }, include: { services: { orderBy: { name: "asc" } } } });
}

export async function setCategoryActive(adminId: string, categoryId: string, active: boolean): Promise<Result> {
  await assertAdmin(adminId);
  const res = await db.$transaction(async (tx) => {
    const r = await tx.serviceCategory.updateMany({ where: { id: categoryId }, data: { isActive: active } });
    if (r.count) await log(tx, adminId, active ? "category.activate" : "category.deactivate", "service_category", categoryId);
    return r.count;
  });
  return res ? { ok: true } : { ok: false, error: "Catégorie introuvable." };
}

export type ServiceInput = { name: string; basePriceFcfa: number | null; priceMode: "FIXED_ESTIMATE" | "QUOTE_AFTER_DIAGNOSIS"; allowsUrgent: boolean; isActive: boolean };

export async function updateService(adminId: string, serviceId: string, input: ServiceInput): Promise<Result> {
  await assertAdmin(adminId);
  if (input.name.trim().length < 2) return { ok: false, error: "Nom invalide.", errors: { name: "Nom trop court." } };
  if (input.priceMode === "FIXED_ESTIMATE" && (input.basePriceFcfa == null || input.basePriceFcfa <= 0 || !Number.isInteger(input.basePriceFcfa))) return { ok: false, error: "Indiquez un prix en FCFA.", errors: { basePriceFcfa: "Prix entier positif requis." } };
  const res = await db.$transaction(async (tx) => {
    const r = await tx.service.updateMany({ where: { id: serviceId }, data: { name: input.name.trim(), priceMode: input.priceMode, basePriceFcfa: input.priceMode === "FIXED_ESTIMATE" ? input.basePriceFcfa : null, allowsUrgent: input.allowsUrgent, isActive: input.isActive } });
    if (r.count) await log(tx, adminId, "service.update", "service", serviceId, { ...input });
    return r.count;
  });
  return res ? { ok: true } : { ok: false, error: "Service introuvable." };
}

export async function listAdminActions(adminId: string) {
  await assertAdmin(adminId);
  return db.adminAction.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { admin: { select: { fullName: true } } } });
}
