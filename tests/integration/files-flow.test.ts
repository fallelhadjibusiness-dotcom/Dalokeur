import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { createRequest } from "@/lib/requests";
import { acceptMission } from "@/lib/missions";
import { cancelClientRequest } from "@/lib/requests";
import { addPropertyPhoto, addProviderDocument, canReadFile, listProviderDocuments, purgeOrphanUploads, readFile, removePropertyPhoto, reviewDocument, setAvatar, storeUpload } from "@/lib/files";
import { saveProperty } from "@/lib/property";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const TAG = `l${Date.now()}`;
const base = { serviceSlug: "plomberie", mode: "URGENT" as const, description: "Fuite sous l'évier de la cuisine", district: "Médina", addressLine: "Rue 11", landmark: "porte bleue" };

const seg = (m: number, p: Buffer) => Buffer.concat([Buffer.from([0xff, m, (p.length + 2) >> 8, (p.length + 2) & 255]), p]);
const jpeg = (extra = "") => Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")), seg(0xe1, Buffer.from(`Exif\0\0GPSLatitude=14.69${extra}`)), seg(0xda, Buffer.from([1, 1, 0, 0, 63, 0])), Buffer.from([1, 2, 3]), Buffer.from([0xff, 0xd9])]);
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

suite("fichiers (base réelle)", () => {
  const u: Record<string, string> = {};
  const A = (k: string, role: "CLIENT" | "PROVIDER" | "ADMIN") => ({ id: u[k], role });
  let providerProfile: string;

  beforeAll(async () => {
    const svc = await db.service.findUniqueOrThrow({ where: { slug: "plomberie" } });
    for (const [k, role] of [["c1", "CLIENT"], ["c2", "CLIENT"], ["p1", "PROVIDER"], ["p2", "PROVIDER"], ["admin", "ADMIN"]] as const) {
      u[k] = (await db.user.create({ data: { phone: `test-${TAG}-${k}`, fullName: `Test ${k}`, passwordHash: "x", roles: { create: { role } } } })).id;
    }
    for (const k of ["p1", "p2"]) {
      const p = await db.providerProfile.create({ data: { userId: u[k], jobTitle: "Plombier", zones: ["Dakar"], status: "VERIFIED", services: { create: { serviceId: svc.id } } } });
      if (k === "p1") providerProfile = p.id;
    }
  });
  afterAll(async () => {
    const ids = Object.values(u);
    await db.serviceRequest.deleteMany({ where: { clientId: { in: ids } } });
    await db.property.deleteMany({ where: { title: { contains: TAG } } });
    await db.adminAction.deleteMany({ where: { adminId: { in: ids } } });
    await db.rateLimit.deleteMany({ where: { key: { startsWith: "upload:" } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    rmSync(path.resolve(".uploads-test"), { recursive: true, force: true });
    await db.$disconnect();
  });

  it("téléversement : rôle, type réel, taille, métadonnées GPS supprimées du fichier stocké", async () => {
    expect((await storeUpload(A("p1", "PROVIDER"), "REQUEST_PHOTO", jpeg())).ok).toBe(false); // un prestataire n'ajoute pas de photo de demande
    expect((await storeUpload(A("c1", "CLIENT"), "PROVIDER_DOC", pdf)).ok).toBe(false);
    expect((await storeUpload(A("c1", "CLIENT"), "REQUEST_PHOTO", Buffer.from("<?php system($_GET['c']); ?>"))).ok).toBe(false); // faux « .jpg »
    expect((await storeUpload(A("c1", "CLIENT"), "REQUEST_PHOTO", pdf)).ok).toBe(false); // PDF non accepté pour une photo
    expect((await storeUpload(A("c1", "CLIENT"), "REQUEST_PHOTO", Buffer.alloc(5 * 1024 * 1024, 1))).ok).toBe(false);
    const r = await storeUpload(A("c1", "CLIENT"), "REQUEST_PHOTO", jpeg());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const stored = await readFile(A("c1", "CLIENT"), r.key);
    expect(stored?.bytes.includes("GPSLatitude")).toBe(false);
    expect(stored?.bytes.includes("JFIF")).toBe(true);
    expect(stored?.contentType).toBe("image/jpeg");
    expect(r.key).toMatch(new RegExp(`^u/${u.c1}/`));
  });

  it("photos de demande : rattachement strict (propriétaire, finalité, une seule fois, 3 max)", async () => {
    const k1 = (await storeUpload(A("c1", "CLIENT"), "REQUEST_PHOTO", jpeg("1"))) as { ok: true; key: string };
    const other = (await storeUpload(A("c2", "CLIENT"), "REQUEST_PHOTO", jpeg("2"))) as { ok: true; key: string };
    expect((await createRequest(u.c1, { ...base, photoKeys: [other.key] })).ok).toBe(false); // photo d'un autre client
    expect((await createRequest(u.c1, { ...base, photoKeys: ["u/123e4567-e89b-12d3-a456-426614174000/123e4567-e89b-12d3-a456-426614174001.jpg"] })).ok).toBe(false); // inconnue
    const avatar = (await storeUpload(A("c1", "CLIENT"), "AVATAR", jpeg("a"))) as { ok: true; key: string };
    expect((await createRequest(u.c1, { ...base, photoKeys: [avatar.key] })).ok).toBe(false); // mauvaise finalité
    expect((await createRequest(u.c1, { ...base, photoKeys: [k1.key, k1.key] })).ok).toBe(false); // doublon
    const r = await createRequest(u.c1, { ...base, photoKeys: [k1.key] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await db.serviceRequest.findUniqueOrThrow({ where: { id: r.id } })).photoKeys).toEqual([k1.key]);
    expect((await createRequest(u.c1, { ...base, photoKeys: [k1.key] })).ok).toBe(false); // déjà rattachée
    expect(await db.serviceRequest.count({ where: { clientId: u.c1, photoKeys: { has: other.key } } })).toBe(0); // rien n'a fuité
  });

  it("lecture d'une photo de demande : client, prestataire APRÈS acceptation, admin ; personne d'autre", async () => {
    const k = (await storeUpload(A("c1", "CLIENT"), "REQUEST_PHOTO", jpeg("r"))) as { ok: true; key: string };
    const r = await createRequest(u.c1, { ...base, photoKeys: [k.key] }); if (!r.ok) throw new Error("req");
    const can = async (who: string, role: "CLIENT" | "PROVIDER" | "ADMIN") => (await canReadFile(A(who, role), k.key)).allowed;
    expect(await can("c1", "CLIENT")).toBe(true);
    expect(await can("c2", "CLIENT")).toBe(false);
    expect(await can("p1", "PROVIDER")).toBe(false); // avant acceptation : jamais
    expect(await can("admin", "ADMIN")).toBe(true);
    await acceptMission(u.p1, r.id);
    expect(await can("p1", "PROVIDER")).toBe(true);
    expect(await can("p2", "PROVIDER")).toBe(false);
    await cancelClientRequest(u.c1, r.id, "Plus besoin");
    expect(await can("p1", "PROVIDER")).toBe(false); // assignation annulée : accès retiré
    expect(await readFile(A("c2", "CLIENT"), k.key)).toBeNull();
  });

  it("documents de vérification : lisibles par l'administrateur seulement", async () => {
    expect((await addProviderDocument(A("p1", "PROVIDER"), "Mot de passe", pdf)).ok).toBe(false); // type inconnu
    expect((await addProviderDocument(A("c1", "CLIENT"), "CNI", pdf)).ok).toBe(false); // pas un prestataire
    expect((await addProviderDocument(A("p1", "PROVIDER"), "CNI", pdf)).ok).toBe(true);
    expect((await addProviderDocument(A("p1", "PROVIDER"), "Casier judiciaire", jpeg("d"))).ok).toBe(true);
    await expect(listProviderDocuments(u.p1, providerProfile)).rejects.toThrow("FORBIDDEN");
    const docs = await listProviderDocuments(u.admin, providerProfile);
    expect(docs).toHaveLength(2);
    for (const d of docs) {
      expect((await canReadFile(A("admin", "ADMIN"), d.fileKey)).allowed).toBe(true);
      expect((await canReadFile(A("p1", "PROVIDER"), d.fileKey)).allowed).toBe(false); // même le propriétaire
      expect((await canReadFile(A("p2", "PROVIDER"), d.fileKey)).allowed).toBe(false);
      expect((await canReadFile(A("c1", "CLIENT"), d.fileKey)).allowed).toBe(false);
    }
    await expect(reviewDocument(u.c1, docs[0].id, "APPROVED")).rejects.toThrow("FORBIDDEN");
    expect((await reviewDocument(u.admin, docs[0].id, "APPROVED")).ok).toBe(true);
    expect((await db.providerDocument.findUniqueOrThrow({ where: { id: docs[0].id } })).status).toBe("APPROVED");
    expect(await db.notification.count({ where: { userId: u.p1, kind: "document.reviewed" } })).toBe(1);
  });

  it("photo de profil : lisible par les utilisateurs connectés ; l'ancienne est supprimée au remplacement", async () => {
    expect((await setAvatar(A("p1", "PROVIDER"), jpeg("v1"))).ok).toBe(true);
    const first = (await db.user.findUniqueOrThrow({ where: { id: u.p1 } })).avatarUrl!;
    expect((await canReadFile(A("c2", "CLIENT"), first)).allowed).toBe(true);
    expect((await setAvatar(A("p1", "PROVIDER"), jpeg("v2"))).ok).toBe(true);
    expect(await db.uploadedFile.count({ where: { key: first } })).toBe(0);
    expect(existsSync(path.resolve(".uploads-test", first))).toBe(false);
  });

  it("photos d'annonce : admin seulement ; visibles si l'annonce est active", async () => {
    const saved = await saveProperty(u.admin, null, { title: `Annonce photo ${TAG}`, listingType: "RENT", propertyType: "STUDIO", priceFcfa: 100000, district: "Fann", exactAddress: "Adresse secrète 12", description: "Studio de test avec photos, calme et lumineux." });
    if (!saved.ok) throw new Error("property");
    await expect(addPropertyPhoto(u.c1, saved.id, jpeg("p"))).rejects.toThrow("FORBIDDEN");
    expect((await addPropertyPhoto(u.admin, saved.id, jpeg("p1"))).ok).toBe(true);
    const key = (await db.property.findUniqueOrThrow({ where: { id: saved.id } })).photoKeys[0];
    expect((await canReadFile(A("c2", "CLIENT"), key)).allowed).toBe(true);
    await db.property.update({ where: { id: saved.id }, data: { isActive: false } });
    expect((await canReadFile(A("c2", "CLIENT"), key)).allowed).toBe(false);
    expect((await canReadFile(A("admin", "ADMIN"), key)).allowed).toBe(true);
    expect((await removePropertyPhoto(u.admin, saved.id, key)).ok).toBe(true);
    expect((await db.property.findUniqueOrThrow({ where: { id: saved.id } })).photoKeys).toEqual([]);
    expect((await canReadFile(A("admin", "ADMIN"), key)).allowed).toBe(false);
  });

  it("clés invalides refusées ; purge des fichiers jamais rattachés", async () => {
    for (const bad of ["../../etc/passwd", "u/x/y.jpg", ""]) expect((await canReadFile(A("admin", "ADMIN"), bad)).allowed).toBe(false);
    const orphan = (await storeUpload(A("c2", "CLIENT"), "REQUEST_PHOTO", jpeg("o"))) as { ok: true; key: string };
    const keep = (await storeUpload(A("c2", "CLIENT"), "REQUEST_PHOTO", jpeg("k"))) as { ok: true; key: string };
    await db.uploadedFile.updateMany({ where: { key: { in: [orphan.key, keep.key] } }, data: { createdAt: new Date(Date.now() - 25 * 3600_000) } });
    await db.uploadedFile.update({ where: { key: keep.key }, data: { attachedAt: new Date() } });
    const res = await purgeOrphanUploads();
    expect(res.orphansDeleted).toBeGreaterThanOrEqual(1);
    expect(await db.uploadedFile.count({ where: { key: orphan.key } })).toBe(0);
    expect(existsSync(path.resolve(".uploads-test", orphan.key))).toBe(false);
    expect(await db.uploadedFile.count({ where: { key: keep.key } })).toBe(1);
  });
});
