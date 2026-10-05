// Espace immobilier. Règle centrale : l'adresse exacte d'un bien n'est JAMAIS lue pour les annonces publiques
// (le champ n'est pas sélectionné) ; elle n'est révélée qu'au client dont la visite est confirmée (et à l'admin).
import { Prisma, type ListingType, type PropertyType, type VisitStatus } from "@prisma/client";
import { z } from "zod";
import { assertAdmin } from "./admin";
import { db } from "./db";
import { approximatePoint, DISTRICT_CENTERS } from "./geo";
import { notify } from "./notifications";
import { checkRateLimit } from "./rate-limit";
import type { Result } from "./requests";
import { ALL_DISTRICTS } from "./zones";

export const LISTING_LABELS: Record<ListingType, string> = { RENT: "À louer", SALE: "À vendre" };
export const PROPERTY_LABELS: Record<PropertyType, string> = { APARTMENT: "Appartement", VILLA: "Villa", STUDIO: "Studio", LAND: "Terrain", OFFICE: "Bureau" };
export const VISIT_LABELS: Record<VisitStatus, string> = { REQUESTED: "Demandée", CONFIRMED: "Confirmée", DONE: "Effectuée", CANCELLED: "Annulée" };

// Sélection publique : aucune adresse exacte.
const publicSelect = { id: true, title: true, listingType: true, propertyType: true, priceFcfa: true, bedrooms: true, surfaceM2: true, district: true, approxLat: true, approxLng: true, description: true, photoKeys: true, createdAt: true } satisfies Prisma.PropertySelect;
export type PublicProperty = Prisma.PropertyGetPayload<{ select: typeof publicSelect }>;

export type PropertyFilters = { type?: string; kind?: string; district?: string; min?: string; max?: string; sort?: string };

const toInt = (v?: string) => (v && /^\d{1,12}$/.test(v) ? Number(v) : undefined);

export async function searchProperties(f: PropertyFilters): Promise<PublicProperty[]> {
  const where: Prisma.PropertyWhereInput = { isActive: true };
  where.listingType = f.type === "SALE" ? "SALE" : "RENT"; // « Louer » par défaut
  if (f.kind && f.kind in PROPERTY_LABELS) where.propertyType = f.kind as PropertyType;
  if (f.district && ALL_DISTRICTS.includes(f.district)) where.district = f.district;
  const min = toInt(f.min), max = toInt(f.max);
  if (min != null || max != null) where.priceFcfa = { ...(min != null ? { gte: min } : {}), ...(max != null ? { lte: max } : {}) };
  const orderBy: Prisma.PropertyOrderByWithRelationInput = f.sort === "price_asc" ? { priceFcfa: "asc" } : f.sort === "price_desc" ? { priceFcfa: "desc" } : { createdAt: "desc" };
  return db.property.findMany({ where, orderBy, take: 60, select: publicSelect });
}

export const getPublicProperty = (id: string) => db.property.findFirst({ where: { id, isActive: true }, select: publicSelect });

// ───────── Demandes de visite (client) ─────────

const MIN_LEAD_MS = 2 * 60 * 60_000;
const MAX_LEAD_MS = 30 * 24 * 60 * 60_000;
const visitSchema = z.object({
  preferredAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Choisissez une date et une heure."),
  message: z.string().trim().max(500).optional(),
});

export async function requestVisit(clientId: string, propertyId: string, input: { preferredAt: string; message?: string }, now = new Date()): Promise<Result<{ id: string }>> {
  const parsed = visitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choisissez une date et une heure.", errors: { preferredAt: "Choisissez une date et une heure." } };
  const preferred = new Date(parsed.data.preferredAt);
  const lead = preferred.getTime() - now.getTime();
  if (lead < MIN_LEAD_MS) return { ok: false, error: "Créneau trop proche.", errors: { preferredAt: "Choisissez un créneau dans au moins 2 heures." } };
  if (lead > MAX_LEAD_MS) return { ok: false, error: "Créneau trop lointain.", errors: { preferredAt: "Choisissez un créneau dans les 30 prochains jours." } };
  const property = await db.property.findFirst({ where: { id: propertyId, isActive: true }, select: { id: true, title: true } });
  if (!property) return { ok: false, error: "Ce bien n'est plus disponible." };
  if (!(await checkRateLimit(`visit:${clientId}`, 10, 60 * 60_000))) return { ok: false, error: "Trop de demandes. Réessayez plus tard." };
  try {
    const v = await db.propertyVisit.create({ data: { propertyId, clientId, preferredAt: preferred, message: parsed.data.message || null } });
    return { ok: true, id: v.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "Vous avez déjà une demande de visite en cours pour ce bien." };
    throw e;
  }
}

export async function listClientVisits(clientId: string) {
  return db.propertyVisit.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, status: true, preferredAt: true, scheduledAt: true, createdAt: true, property: { select: { id: true, title: true, district: true, propertyType: true } } } });
}

// L'adresse exacte n'est lue qu'une fois la visite confirmée (ou effectuée) ET appartenant au client.
export async function getClientVisit(clientId: string, visitId: string) {
  const v = await db.propertyVisit.findFirst({
    where: { id: visitId, clientId },
    select: { id: true, status: true, preferredAt: true, scheduledAt: true, message: true, agencyNote: true, cancelReason: true, createdAt: true, property: { select: { ...publicSelect } } },
  });
  if (!v) return null;
  let exactAddress: string | null = null;
  if (v.status === "CONFIRMED" || v.status === "DONE") {
    exactAddress = (await db.property.findUnique({ where: { id: v.property.id }, select: { exactAddress: true } }))?.exactAddress ?? null;
  }
  return { ...v, exactAddress };
}

export async function cancelVisit(clientId: string, visitId: string, reason?: string): Promise<Result> {
  const v = await db.propertyVisit.findFirst({ where: { id: visitId, clientId } });
  if (!v) return { ok: false, error: "Visite introuvable." };
  if (v.status !== "REQUESTED" && v.status !== "CONFIRMED") return { ok: false, error: "Cette visite ne peut plus être annulée." };
  const res = await db.propertyVisit.updateMany({ where: { id: visitId, status: v.status }, data: { status: "CANCELLED", cancelReason: reason?.trim() || "Annulée par le client" } });
  return res.count === 1 ? { ok: true } : { ok: false, error: "Le statut vient de changer. Actualisez la page." };
}

// ───────── Administration / agence ─────────

const propertySchema = z.object({
  title: z.string().trim().min(5, "Titre trop court.").max(120),
  listingType: z.enum(["RENT", "SALE"]),
  propertyType: z.enum(["APARTMENT", "VILLA", "STUDIO", "LAND", "OFFICE"]),
  priceFcfa: z.coerce.number().int("Prix entier requis.").min(1, "Indiquez un prix.").max(10_000_000_000),
  bedrooms: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().int().min(0).max(30).optional()),
  surfaceM2: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().int().min(1).max(100000).optional()),
  district: z.string().refine((d) => ALL_DISTRICTS.includes(d), "Quartier inconnu."),
  exactAddress: z.string().trim().min(5, "Adresse exacte requise (jamais publiée)."),
  description: z.string().trim().min(20, "Description trop courte (20 caractères minimum).").max(2000),
  isActive: z.boolean().optional(),
});
export type PropertyInput = z.input<typeof propertySchema>;

export async function saveProperty(adminId: string, id: string | null, input: PropertyInput): Promise<Result<{ id: string }>> {
  await assertAdmin(adminId);
  const parsed = propertySchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0] ?? "form")] ||= i.message;
    return { ok: false, error: "Veuillez corriger le formulaire.", errors };
  }
  const d = parsed.data;
  const c = DISTRICT_CENTERS[d.district];
  const approx = c ? approximatePoint(c.lat, c.lng) : { approxLat: null, approxLng: null };
  const data = { title: d.title, listingType: d.listingType, propertyType: d.propertyType, priceFcfa: d.priceFcfa, bedrooms: d.bedrooms ?? null, surfaceM2: d.surfaceM2 ?? null, district: d.district, exactAddress: d.exactAddress, description: d.description, ...approx, ...(d.isActive !== undefined ? { isActive: d.isActive } : {}) };
  const saved = await db.$transaction(async (tx) => {
    const p = id ? await tx.property.update({ where: { id }, data }) : await tx.property.create({ data });
    await tx.adminAction.create({ data: { adminId, action: id ? "property.update" : "property.create", targetType: "property", targetId: p.id } });
    return p;
  });
  return { ok: true, id: saved.id };
}

export async function setPropertyActive(adminId: string, id: string, active: boolean): Promise<Result> {
  await assertAdmin(adminId);
  const r = await db.property.updateMany({ where: { id }, data: { isActive: active } });
  if (!r.count) return { ok: false, error: "Annonce introuvable." };
  await db.adminAction.create({ data: { adminId, action: active ? "property.activate" : "property.deactivate", targetType: "property", targetId: id } });
  return { ok: true };
}

export async function adminListProperties(adminId: string) {
  await assertAdmin(adminId);
  return db.property.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { _count: { select: { visits: true } } } });
}
export async function adminGetProperty(adminId: string, id: string) {
  await assertAdmin(adminId);
  return db.property.findUnique({ where: { id } });
}

export async function adminListVisits(adminId: string, status?: string) {
  await assertAdmin(adminId);
  return db.propertyVisit.findMany({
    where: status ? { status: status as VisitStatus } : {}, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100,
    include: { property: { select: { id: true, title: true, district: true, exactAddress: true } }, client: { select: { fullName: true, phone: true } } },
  });
}

export async function confirmVisit(adminId: string, visitId: string, scheduledAt: string, note?: string, now = new Date()): Promise<Result> {
  await assertAdmin(adminId);
  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime()) || when.getTime() < now.getTime()) return { ok: false, error: "Choisissez un créneau à venir.", errors: { scheduledAt: "Choisissez un créneau à venir." } };
  const v = await db.propertyVisit.findUnique({ where: { id: visitId }, include: { property: { select: { title: true } } } });
  if (!v) return { ok: false, error: "Visite introuvable." };
  if (v.status !== "REQUESTED") return { ok: false, error: "Seule une demande en attente peut être confirmée." };
  await db.$transaction(async (tx) => {
    await tx.propertyVisit.update({ where: { id: visitId }, data: { status: "CONFIRMED", scheduledAt: when, agencyNote: note?.trim() || null } });
    await notify(tx, v.clientId, "visit.confirmed", "Visite confirmée", `Votre visite de « ${v.property.title} » est confirmée. L'adresse exacte est maintenant disponible.`, { visitId });
    await tx.adminAction.create({ data: { adminId, action: "visit.confirm", targetType: "property_visit", targetId: visitId } });
  });
  return { ok: true };
}

export async function completeVisit(adminId: string, visitId: string): Promise<Result> {
  await assertAdmin(adminId);
  const r = await db.propertyVisit.updateMany({ where: { id: visitId, status: "CONFIRMED" }, data: { status: "DONE" } });
  if (!r.count) return { ok: false, error: "Seule une visite confirmée peut être marquée comme effectuée." };
  await db.adminAction.create({ data: { adminId, action: "visit.done", targetType: "property_visit", targetId: visitId } });
  return { ok: true };
}

export async function adminCancelVisit(adminId: string, visitId: string, reason: string): Promise<Result> {
  await assertAdmin(adminId);
  if (!reason.trim()) return { ok: false, error: "Indiquez le motif.", errors: { reason: "Le motif est obligatoire." } };
  const v = await db.propertyVisit.findUnique({ where: { id: visitId } });
  if (!v || (v.status !== "REQUESTED" && v.status !== "CONFIRMED")) return { ok: false, error: "Cette visite ne peut plus être annulée." };
  await db.$transaction(async (tx) => {
    await tx.propertyVisit.update({ where: { id: visitId }, data: { status: "CANCELLED", cancelReason: reason.trim() } });
    await notify(tx, v.clientId, "visit.cancelled", "Visite annulée", `Votre demande de visite a été annulée : ${reason.trim()}`, { visitId });
    await tx.adminAction.create({ data: { adminId, action: "visit.cancel", targetType: "property_visit", targetId: visitId } });
  });
  return { ok: true };
}
