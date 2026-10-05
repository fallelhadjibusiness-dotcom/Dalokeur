import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as P from "@/lib/property";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const TAG = `i${Date.now()}`;
const SECRET = "Résidence Secrète, 7e étage, porte rouge";
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();
const input = { title: `Appartement test ${TAG}`, listingType: "RENT" as const, propertyType: "APARTMENT" as const, priceFcfa: 250000, bedrooms: 2, surfaceM2: 80, district: "Fann", exactAddress: SECRET, description: "Bel appartement de test avec balcon et gardien, proche de tout." };

suite("immobilier (base réelle)", () => {
  const u: Record<string, string> = {};
  let propertyId: string;

  beforeAll(async () => {
    for (const [k, role] of [["admin", "ADMIN"], ["c1", "CLIENT"], ["c2", "CLIENT"], ["prov", "PROVIDER"]] as const) {
      u[k] = (await db.user.create({ data: { phone: `test-${TAG}-${k}`, fullName: `Test ${k}`, passwordHash: "x", roles: { create: { role } } } })).id;
    }
    const r = await P.saveProperty(u.admin, null, input);
    if (!r.ok) throw new Error(JSON.stringify(r));
    propertyId = r.id;
  });
  afterAll(async () => {
    await db.propertyVisit.deleteMany({ where: { client: { phone: { contains: TAG } } } });
    await db.property.deleteMany({ where: { title: { contains: TAG } } });
    await db.adminAction.deleteMany({ where: { admin: { phone: { contains: TAG } } } });
    await db.user.deleteMany({ where: { phone: { contains: TAG } } });
    await db.$disconnect();
  });

  it("administration : droits, validation, adresse exacte requise", async () => {
    await expect(P.saveProperty(u.c1, null, input)).rejects.toThrow("FORBIDDEN");
    await expect(P.saveProperty(u.prov, null, input)).rejects.toThrow("FORBIDDEN");
    await expect(P.adminListVisits(u.c1)).rejects.toThrow("FORBIDDEN");
    const bad = await P.saveProperty(u.admin, null, { ...input, title: "x", priceFcfa: 0, exactAddress: "", district: "Paris" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors ?? {})).toEqual(expect.arrayContaining(["title", "priceFcfa", "exactAddress", "district"]));
    const p = (await db.property.findUnique({ where: { id: propertyId } }))!;
    expect(p.approxLat).not.toBeNull(); // position approximative dérivée du quartier
  });

  it("recherche : louer/acheter, type, quartier, budget ; jamais d'adresse exacte", async () => {
    const mine = (r: Awaited<ReturnType<typeof P.searchProperties>>) => r.filter((x) => x.title.includes(TAG));
    expect(mine(await P.searchProperties({})).length).toBe(1); // « louer » par défaut
    expect(mine(await P.searchProperties({ type: "SALE" })).length).toBe(0);
    expect(mine(await P.searchProperties({ type: "RENT", kind: "VILLA" })).length).toBe(0);
    expect(mine(await P.searchProperties({ type: "RENT", kind: "APARTMENT", district: "Fann" })).length).toBe(1);
    expect(mine(await P.searchProperties({ district: "Médina" })).length).toBe(0);
    expect(mine(await P.searchProperties({ min: "200000", max: "300000" })).length).toBe(1);
    expect(mine(await P.searchProperties({ max: "100000" })).length).toBe(0);
    expect(mine(await P.searchProperties({ min: "300000" })).length).toBe(0);
    const all = await P.searchProperties({});
    expect(JSON.stringify(all)).not.toContain(SECRET);
    expect(JSON.stringify(all)).not.toContain("exactAddress");
    expect(JSON.stringify(await P.getPublicProperty(propertyId))).not.toContain(SECRET);
    const sorted = await P.searchProperties({ sort: "price_asc" });
    expect(sorted.map((x) => x.priceFcfa)).toEqual([...sorted.map((x) => x.priceFcfa)].sort((a, b) => a - b));
  });

  it("demande de visite : créneau valide, une seule demande active par bien", async () => {
    expect((await P.requestVisit(u.c1, propertyId, { preferredAt: new Date(Date.now() + 30 * 60_000).toISOString() })).ok).toBe(false); // trop proche
    expect((await P.requestVisit(u.c1, propertyId, { preferredAt: new Date(Date.now() + 40 * 86_400_000).toISOString() })).ok).toBe(false); // trop loin
    expect((await P.requestVisit(u.c1, propertyId, { preferredAt: "n'importe quoi" })).ok).toBe(false);
    const r = await P.requestVisit(u.c1, propertyId, { preferredAt: tomorrow(), message: "Je suis disponible le matin" });
    expect(r.ok).toBe(true);
    expect((await P.requestVisit(u.c1, propertyId, { preferredAt: tomorrow() })).ok).toBe(false); // doublon
    expect((await P.requestVisit(u.c2, propertyId, { preferredAt: tomorrow() })).ok).toBe(true); // autre client : possible
    await P.setPropertyActive(u.admin, propertyId, false);
    expect((await P.requestVisit(u.c2, propertyId, { preferredAt: tomorrow() })).ok).toBe(false); // annonce désactivée
    expect(await P.getPublicProperty(propertyId)).toBeNull();
    await P.setPropertyActive(u.admin, propertyId, true);
  });

  it("adresse exacte : masquée tant que la visite n'est pas confirmée ; réservée au client concerné", async () => {
    const visits = await P.listClientVisits(u.c1);
    const vid = visits.find((v) => v.property.id === propertyId)!.id;
    let v = (await P.getClientVisit(u.c1, vid))!;
    expect(v.status).toBe("REQUESTED");
    expect(v.exactAddress).toBeNull();
    expect(JSON.stringify(v)).not.toContain(SECRET);
    expect(await P.getClientVisit(u.c2, vid)).toBeNull(); // autre client : aucune fuite

    expect((await P.confirmVisit(u.admin, vid, new Date(Date.now() - 1000).toISOString())).ok).toBe(false); // créneau passé
    await expect(P.confirmVisit(u.c1, vid, tomorrow())).rejects.toThrow("FORBIDDEN"); // le client ne se valide pas lui-même
    expect((await P.confirmVisit(u.admin, vid, tomorrow(), "Rendez-vous devant l'immeuble")).ok).toBe(true);
    v = (await P.getClientVisit(u.c1, vid))!;
    expect(v.status).toBe("CONFIRMED");
    expect(v.exactAddress).toBe(SECRET);
    expect(v.agencyNote).toMatch(/devant/);
    expect(await P.getClientVisit(u.c2, vid)).toBeNull();
    expect((await db.notification.count({ where: { userId: u.c1, kind: "visit.confirmed" } }))).toBe(1);
    expect((await P.confirmVisit(u.admin, vid, tomorrow())).ok).toBe(false); // déjà confirmée

    // annulation par le client : l'adresse est de nouveau masquée
    expect((await P.cancelVisit(u.c2, vid)).ok).toBe(false); // pas sa visite
    expect((await P.cancelVisit(u.c1, vid, "Empêchement")).ok).toBe(true);
    v = (await P.getClientVisit(u.c1, vid))!;
    expect(v.status).toBe("CANCELLED");
    expect(v.exactAddress).toBeNull();
    expect((await P.cancelVisit(u.c1, vid)).ok).toBe(false);
    // une nouvelle demande est possible après annulation
    expect((await P.requestVisit(u.c1, propertyId, { preferredAt: tomorrow() })).ok).toBe(true);
  });

  it("agence : terminer une visite, annuler avec motif obligatoire, journal", async () => {
    const vid = (await P.listClientVisits(u.c2)).find((v) => v.property.id === propertyId)!.id;
    expect((await P.completeVisit(u.admin, vid)).ok).toBe(false); // pas encore confirmée
    expect((await P.adminCancelVisit(u.admin, vid, "")).ok).toBe(false);
    await P.confirmVisit(u.admin, vid, tomorrow());
    expect((await P.completeVisit(u.admin, vid)).ok).toBe(true);
    expect((await P.getClientVisit(u.c2, vid))?.status).toBe("DONE");
    expect((await P.getClientVisit(u.c2, vid))?.exactAddress).toBe(SECRET); // reste accessible après la visite
    const second = (await P.listClientVisits(u.c1)).find((v) => v.status === "REQUESTED")!;
    expect((await P.adminCancelVisit(u.admin, second.id, "Bien déjà loué")).ok).toBe(true);
    expect(await db.notification.count({ where: { userId: u.c1, kind: "visit.cancelled" } })).toBe(1);
    expect(await db.adminAction.count({ where: { adminId: u.admin, action: { in: ["visit.confirm", "visit.done", "visit.cancel"] } } })).toBeGreaterThanOrEqual(4);
  });
});
