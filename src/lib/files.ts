// Téléversement et lecture contrôlée des fichiers.
// Règle de lecture (canReadFile) par finalité :
//  • REQUEST_PHOTO : client propriétaire, prestataire ayant ACCEPTÉ la mission, admin (jamais avant acceptation).
//  • PROVIDER_DOC  : administrateur uniquement (même le prestataire ne peut pas relire ses pièces).
//  • AVATAR        : tout utilisateur connecté (photo de profil destinée à être montrée).
//  • PROPERTY_PHOTO: tout utilisateur connecté si l'annonce est active ; admin toujours.
import { randomUUID } from "node:crypto";
import type { Prisma, Role } from "@prisma/client";
import { db } from "./db";
import { checkRateLimit } from "./rate-limit";
import type { Result } from "./requests";
import { getStorage, KEY_RE } from "./storage";
import { MAX_UPLOAD_BYTES, sniff, stripMetadata } from "./uploads";
import { notify } from "./notifications";
import { assertAdmin } from "./admin";

export type Purpose = "REQUEST_PHOTO" | "PROVIDER_DOC" | "AVATAR" | "PROPERTY_PHOTO";
export type Actor = { id: string; role: Role };

export const DOC_KINDS = ["CNI", "Justificatif de métier", "Casier judiciaire", "Autre"] as const;
const MAX_REQUEST_PHOTOS = 3, MAX_PROVIDER_DOCS = 6, MAX_PROPERTY_PHOTOS = 8;
const ROLES_FOR: Record<Purpose, Role[]> = { REQUEST_PHOTO: ["CLIENT"], PROVIDER_DOC: ["PROVIDER"], AVATAR: ["CLIENT", "PROVIDER", "ADMIN"], PROPERTY_PHOTO: ["ADMIN"] };
const KINDS_FOR: Record<Purpose, ("jpeg" | "png" | "pdf")[]> = { REQUEST_PHOTO: ["jpeg", "png"], AVATAR: ["jpeg", "png"], PROPERTY_PHOTO: ["jpeg", "png"], PROVIDER_DOC: ["jpeg", "png", "pdf"] };

// Contrôle, nettoie et enregistre le fichier. Ne le rattache à rien (sauf documents et photos d'annonce, rattachés par l'appelant).
export async function storeUpload(actor: Actor, purpose: Purpose, bytes: Buffer): Promise<Result<{ key: string; contentType: string }>> {
  if (!ROLES_FOR[purpose].includes(actor.role)) return { ok: false, error: "Action non autorisée." };
  if (bytes.length === 0) return { ok: false, error: "Fichier vide." };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: "Fichier trop lourd (4 Mo maximum)." };
  const type = sniff(bytes);
  if (!type || !KINDS_FOR[purpose].includes(type.kind)) return { ok: false, error: purpose === "PROVIDER_DOC" ? "Format accepté : photo JPEG/PNG ou PDF." : "Format accepté : photo JPEG ou PNG." };
  if (!(await checkRateLimit(`upload:${actor.id}`, 40, 60 * 60_000))) return { ok: false, error: "Trop de fichiers envoyés. Réessayez plus tard." };
  let clean: Buffer;
  try { clean = stripMetadata(bytes, type.kind); } catch { return { ok: false, error: "Fichier corrompu ou illisible." }; }
  const key = `u/${actor.id}/${randomUUID()}.${type.ext}`;
  await getStorage().put(key, clean, type.mime);
  await db.uploadedFile.create({ data: { key, ownerId: actor.id, purpose, contentType: type.mime, sizeBytes: clean.length } });
  return { ok: true, key, contentType: type.mime };
}

// ── Rattachements ──

export async function claimRequestPhotos(tx: Prisma.TransactionClient, clientId: string, keys: string[]) {
  if (keys.length === 0) return;
  if (keys.length > MAX_REQUEST_PHOTOS || new Set(keys).size !== keys.length) throw new Error("PHOTOS_INVALID");
  const res = await tx.uploadedFile.updateMany({ where: { key: { in: keys }, ownerId: clientId, purpose: "REQUEST_PHOTO", attachedAt: null }, data: { attachedAt: new Date() } });
  if (res.count !== keys.length) throw new Error("PHOTOS_INVALID");
}

export async function addProviderDocument(actor: Actor, kind: string, bytes: Buffer): Promise<Result> {
  if (!DOC_KINDS.includes(kind as (typeof DOC_KINDS)[number])) return { ok: false, error: "Type de document inconnu." };
  const profile = actor.role === "PROVIDER" ? await db.providerProfile.findUnique({ where: { userId: actor.id }, select: { id: true, _count: { select: { documents: true } } } }) : null;
  if (!profile) return { ok: false, error: "Action non autorisée." };
  if (profile._count.documents >= MAX_PROVIDER_DOCS) return { ok: false, error: `Maximum ${MAX_PROVIDER_DOCS} documents.` };
  const r = await storeUpload(actor, "PROVIDER_DOC", bytes);
  if (!r.ok) return r;
  await db.$transaction([
    db.uploadedFile.update({ where: { key: r.key }, data: { attachedAt: new Date() } }),
    db.providerDocument.create({ data: { providerId: profile.id, kind, fileKey: r.key } }),
  ]);
  return { ok: true };
}

export async function setAvatar(actor: Actor, bytes: Buffer): Promise<Result> {
  const r = await storeUpload(actor, "AVATAR", bytes);
  if (!r.ok) return r;
  const prev = (await db.user.findUnique({ where: { id: actor.id }, select: { avatarUrl: true } }))?.avatarUrl;
  await db.$transaction([
    db.uploadedFile.update({ where: { key: r.key }, data: { attachedAt: new Date() } }),
    db.user.update({ where: { id: actor.id }, data: { avatarUrl: r.key } }),
  ]);
  if (prev && KEY_RE.test(prev)) { await db.uploadedFile.deleteMany({ where: { key: prev } }); await getStorage().delete(prev); }
  return { ok: true };
}

export async function addPropertyPhoto(adminId: string, propertyId: string, bytes: Buffer): Promise<Result> {
  await assertAdmin(adminId);
  const p = await db.property.findUnique({ where: { id: propertyId }, select: { photoKeys: true } });
  if (!p) return { ok: false, error: "Annonce introuvable." };
  if (p.photoKeys.length >= MAX_PROPERTY_PHOTOS) return { ok: false, error: `Maximum ${MAX_PROPERTY_PHOTOS} photos.` };
  const r = await storeUpload({ id: adminId, role: "ADMIN" }, "PROPERTY_PHOTO", bytes);
  if (!r.ok) return r;
  await db.$transaction([
    db.uploadedFile.update({ where: { key: r.key }, data: { attachedAt: new Date() } }),
    db.property.update({ where: { id: propertyId }, data: { photoKeys: { push: r.key } } }),
    db.adminAction.create({ data: { adminId, action: "property.photo.add", targetType: "property", targetId: propertyId } }),
  ]);
  return { ok: true };
}

export async function removePropertyPhoto(adminId: string, propertyId: string, key: string): Promise<Result> {
  await assertAdmin(adminId);
  const p = await db.property.findUnique({ where: { id: propertyId }, select: { photoKeys: true } });
  if (!p || !p.photoKeys.includes(key)) return { ok: false, error: "Photo introuvable." };
  await db.$transaction([
    db.property.update({ where: { id: propertyId }, data: { photoKeys: p.photoKeys.filter((k) => k !== key) } }),
    db.uploadedFile.deleteMany({ where: { key } }),
    db.adminAction.create({ data: { adminId, action: "property.photo.remove", targetType: "property", targetId: propertyId } }),
  ]);
  await getStorage().delete(key);
  return { ok: true };
}

// ── Lecture ──

export async function canReadFile(actor: Actor, key: string): Promise<{ allowed: boolean; contentType?: string }> {
  if (!KEY_RE.test(key)) return { allowed: false };
  const f = await db.uploadedFile.findUnique({ where: { key } });
  if (!f) return { allowed: false };
  const ok = (allowed: boolean) => ({ allowed, contentType: allowed ? f.contentType : undefined });
  switch (f.purpose as Purpose) {
    case "PROVIDER_DOC": return ok(actor.role === "ADMIN");
    case "AVATAR": return ok(true);
    case "PROPERTY_PHOTO": {
      if (actor.role === "ADMIN") return ok(true);
      return ok(!!(await db.property.findFirst({ where: { isActive: true, photoKeys: { has: key } }, select: { id: true } })));
    }
    case "REQUEST_PHOTO": {
      if (actor.role === "ADMIN") return ok(true);
      if (actor.role === "CLIENT") return ok(f.ownerId === actor.id); // propriétaire du fichier (= client de la demande)
      if (actor.role === "PROVIDER") {
        return ok(!!(await db.serviceRequest.findFirst({ where: { photoKeys: { has: key }, assignments: { some: { status: "ACCEPTED", provider: { userId: actor.id } } } }, select: { id: true } })));
      }
      return ok(false);
    }
  }
  return ok(false);
}

export async function readFile(actor: Actor, key: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const a = await canReadFile(actor, key);
  if (!a.allowed) return null;
  const bytes = await getStorage().get(key);
  return bytes ? { bytes, contentType: a.contentType! } : null;
}

// ── Administration des documents de vérification ──

export async function listProviderDocuments(adminId: string, providerId: string) {
  await assertAdmin(adminId);
  return db.providerDocument.findMany({ where: { providerId }, orderBy: { createdAt: "desc" } });
}

export async function reviewDocument(adminId: string, docId: string, status: "APPROVED" | "REJECTED"): Promise<Result> {
  await assertAdmin(adminId);
  const d = await db.providerDocument.findUnique({ where: { id: docId }, include: { provider: { select: { userId: true } } } });
  if (!d) return { ok: false, error: "Document introuvable." };
  await db.$transaction(async (tx) => {
    await tx.providerDocument.update({ where: { id: docId }, data: { status, reviewedBy: adminId, reviewedAt: new Date() } });
    await notify(tx, d.provider.userId, "document.reviewed", "Document de vérification", status === "APPROVED" ? `Votre document « ${d.kind} » a été accepté.` : `Votre document « ${d.kind} » a été refusé. Envoyez-en un nouveau.`);
    await tx.adminAction.create({ data: { adminId, action: `document.${status.toLowerCase()}`, targetType: "provider_document", targetId: docId } });
  });
  return { ok: true };
}

// Tâche planifiée : fichiers téléversés mais jamais rattachés (> 24 h).
export async function purgeOrphanUploads(now = new Date()) {
  const old = await db.uploadedFile.findMany({ where: { attachedAt: null, createdAt: { lt: new Date(now.getTime() - 24 * 3600_000) } }, take: 500, select: { key: true } });
  for (const f of old) await getStorage().delete(f.key).catch(() => undefined);
  await db.uploadedFile.deleteMany({ where: { key: { in: old.map((f) => f.key) } } });
  return { orphansDeleted: old.length };
}
