import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelClientRequest, confirmCompletion, createRequest, submitReview } from "@/lib/requests";
import { acceptMission, advanceMission, declineMission, getDashboard, getEarnings, getMission, listMissions, setAvailability } from "@/lib/missions";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const TAG = `p${Date.now()}`;
const base = { serviceSlug: "plomberie", mode: "URGENT" as const, description: "Fuite sous l'évier de la cuisine", district: "Médina", addressLine: "Rue 11 x 6 villa 12", landmark: "porte bleue", };
const PRIVATE = ["Rue 11 x 6 villa 12", "porte bleue", "+221700000099"];

suite("espace prestataire (base réelle)", () => {
  let client: string, other: string;
  const prov: Record<string, { user: string; profile: string }> = {};

  async function mkProvider(key: string, opts: { status?: "VERIFIED" | "PENDING" | "SUSPENDED"; zones?: string[]; services?: string[]; available?: boolean }) {
    const u = await db.user.create({ data: { phone: `test-${TAG}-${key}`, fullName: `Test ${key}`, passwordHash: "x", roles: { create: { role: "PROVIDER" } } } });
    const svc = await db.service.findMany({ where: { slug: { in: opts.services ?? ["plomberie"] } } });
    const p = await db.providerProfile.create({ data: { userId: u.id, jobTitle: "Plombier", zones: opts.zones ?? ["Dakar"], status: opts.status ?? "VERIFIED", available: opts.available ?? true, services: { create: svc.map((s) => ({ serviceId: s.id })) } } });
    prov[key] = { user: u.id, profile: p.id };
  }

  beforeAll(async () => {
    client = (await db.user.create({ data: { phone: "+221700000099", fullName: `Test client ${TAG}`, passwordHash: "x", roles: { create: { role: "CLIENT" } } } }).catch(async () => db.user.findUniqueOrThrow({ where: { phone: "+221700000099" } }))).id;
    other = (await db.user.create({ data: { phone: `test-${TAG}-c2`, fullName: "Test c2", passwordHash: "x", roles: { create: { role: "CLIENT" } } } })).id;
    await mkProvider("ok", {});
    await mkProvider("ok2", {});
    await mkProvider("pending", { status: "PENDING" });
    await mkProvider("suspended", { status: "SUSPENDED" });
    await mkProvider("pikine", { zones: ["Pikine"] });
    await mkProvider("menage", { services: ["menage-lessive"] });
    await mkProvider("off", { available: false });
  });

  afterAll(async () => {
    const users = await db.user.findMany({ where: { OR: [{ phone: { contains: TAG } }, { phone: "+221700000099" }] }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await db.review.deleteMany({ where: { clientId: { in: ids } } });
    await db.serviceRequest.deleteMany({ where: { clientId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  const mk = async (over = {}) => { const r = await createRequest(client, { ...base, ...over }); if (!r.ok) throw new Error(JSON.stringify(r)); return r.id; };
  const ids = async (key: string, tab: Parameters<typeof listMissions>[1]) => (await listMissions(prov[key].user, tab)).map((m) => m.preview.id);

  it("visibilité : zone, métier, statut de vérification", async () => {
    const id = await mk();
    expect(await ids("ok", "new")).toContain(id);
    expect(await ids("ok2", "new")).toContain(id);
    for (const k of ["pikine", "menage", "pending", "suspended"]) expect(await ids(k, "new")).not.toContain(id);
    for (const k of ["pikine", "menage", "pending"]) expect(await getMission(prov[k].user, id)).toBeNull();
  });

  it("l'aperçu ne contient aucune donnée privée", async () => {
    const id = await mk();
    const m = (await listMissions(prov.ok.user, "new")).find((x) => x.preview.id === id)!;
    expect(m.full).toBeNull();
    const json = JSON.stringify(m);
    for (const secret of PRIVATE) expect(json).not.toContain(secret);
    expect(JSON.stringify(await getMission(prov.ok.user, id))).not.toContain("porte bleue");
  });

  it("non vérifié / suspendu / indisponible / hors zone : ne peut pas accepter", async () => {
    const id = await mk();
    for (const k of ["pending", "suspended", "off", "pikine", "menage"]) expect((await acceptMission(prov[k].user, id)).ok).toBe(false);
    expect((await db.serviceRequest.findUnique({ where: { id } }))?.status).toBe("NEW");
  });

  it("acceptation : révèle les infos, un seul gagnant, disparaît des autres", async () => {
    const id = await mk();
    const [a, b] = await Promise.all([acceptMission(prov.ok.user, id), acceptMission(prov.ok2.user, id)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const winner = a.ok ? "ok" : "ok2", loser = a.ok ? "ok2" : "ok";
    const full = (await getMission(prov[winner].user, id))!.full!;
    expect(full.address).toBe("Rue 11 x 6 villa 12");
    expect(full.clientPhone).toBe("+221700000099");
    expect(await ids(loser, "new")).not.toContain(id);
    expect(await getMission(prov[loser].user, id)).toBeNull();
    expect((await db.assignment.count({ where: { requestId: id, status: "ACCEPTED" } }))).toBe(1);
    expect(await ids(winner, "upcoming")).toContain(id);
  });

  it("refus : la mission disparaît pour moi, reste pour les autres", async () => {
    const id = await mk();
    expect((await declineMission(prov.ok.user, id, "Trop loin")).ok).toBe(true);
    expect(await ids("ok", "new")).not.toContain(id);
    expect((await acceptMission(prov.ok.user, id)).ok).toBe(false);
    expect(await ids("ok2", "new")).toContain(id);
  });

  it("mission affectée par l'admin : visible et acceptable seulement par le destinataire", async () => {
    const id = await mk();
    await db.assignment.create({ data: { requestId: id, providerId: prov.ok.profile, status: "OFFERED" } });
    await db.serviceRequest.update({ where: { id }, data: { status: "ASSIGNED" } });
    expect(await ids("ok", "new")).toContain(id);
    expect(await ids("ok2", "new")).not.toContain(id);
    expect((await acceptMission(prov.ok2.user, id)).ok).toBe(false);
    expect((await declineMission(prov.ok.user, id)).ok).toBe(true);
    expect((await db.serviceRequest.findUnique({ where: { id } }))?.status).toBe("PENDING");
    expect(await ids("ok2", "new")).toContain(id); // retourne dans la file
  });

  it("statuts dans l'ordre, par le seul prestataire assigné ; fin → avis du client", async () => {
    const id = await mk();
    expect((await advanceMission(prov.ok.user, id, "EN_ROUTE")).ok).toBe(false); // pas acceptée
    await acceptMission(prov.ok.user, id);
    expect((await advanceMission(prov.ok2.user, id, "EN_ROUTE")).ok).toBe(false); // autre prestataire
    expect((await advanceMission(prov.ok.user, id, "COMPLETED")).ok).toBe(false); // saut de statut
    expect((await advanceMission(prov.ok.user, id, "CANCELLED")).ok).toBe(false); // non autorisé
    for (const s of ["EN_ROUTE", "ARRIVED", "IN_PROGRESS"] as const) expect((await advanceMission(prov.ok.user, id, s)).ok).toBe(true);
    expect(await ids("ok", "ongoing")).toContain(id);
    const before = (await db.providerProfile.findUnique({ where: { id: prov.ok.profile } }))!.missionsDone;
    expect((await advanceMission(prov.ok.user, id, "COMPLETED")).ok).toBe(true);
    expect((await confirmCompletion(client, id)).ok).toBe(false); // déjà terminée, pas de double comptage
    expect((await db.providerProfile.findUnique({ where: { id: prov.ok.profile } }))!.missionsDone).toBe(before + 1);
    expect(await ids("ok", "done")).toContain(id);
    expect((await submitReview(client, id, { rating: 5 })).ok).toBe(true);
    expect((await db.requestStatusHistory.count({ where: { requestId: id } }))).toBe(6);
  });

  it("annulation client : onglet « Annulées », infos privées de nouveau masquées", async () => {
    const id = await mk();
    await acceptMission(prov.ok.user, id);
    expect((await cancelClientRequest(client, id, "Plus besoin")).ok).toBe(true);
    const m = (await listMissions(prov.ok.user, "cancelled")).find((x) => x.preview.id === id)!;
    expect(m).toBeTruthy();
    expect(m.full).toBeNull();
    expect(JSON.stringify(m)).not.toContain("porte bleue");
    expect(await ids("ok", "upcoming")).not.toContain(id);
    expect((await advanceMission(prov.ok.user, id, "EN_ROUTE")).ok).toBe(false);
  });

  it("disponibilité, gains démo (commission) et tableau de bord", async () => {
    expect((await setAvailability(prov.off.user, true)).ok).toBe(true);
    const id = await mk({ serviceSlug: "plomberie" });
    await db.serviceRequest.update({ where: { id }, data: { priceMode: "FIXED_ESTIMATE", estimateFcfa: 10000 } });
    await acceptMission(prov.ok2.user, id);
    for (const s of ["EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"] as const) await advanceMission(prov.ok2.user, id, s);
    const e = (await getEarnings(prov.ok2.user))!;
    expect(e.commission).toBe(10);
    expect(e.totalNet).toBe(9000);
    const d = (await getDashboard(prov.ok2.user))!;
    expect(d.done).toBeGreaterThanOrEqual(1);
    expect(d.earnings).toBe(9000);
  });
});
