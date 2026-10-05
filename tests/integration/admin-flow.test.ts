import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelClientRequest, createRequest, submitReview } from "@/lib/requests";
import { acceptMission, advanceMission, listMissions } from "@/lib/missions";
import * as admin from "@/lib/admin";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const TAG = `a${Date.now()}`;
const base = { serviceSlug: "plomberie", mode: "URGENT" as const, description: "Fuite sous l'évier de la cuisine", district: "Médina", addressLine: "Rue 11", landmark: "porte bleue" };

suite("administration (base réelle)", () => {
  let adminId: string, client: string, provUser: string, provId: string, pikineProv: string;
  let savedSettings: { commission: number; zones: string[] };

  const mkUser = (key: string, role: "ADMIN" | "CLIENT" | "PROVIDER") => db.user.create({ data: { phone: `test-${TAG}-${key}`, fullName: `Test ${key}`, passwordHash: "x", roles: { create: { role } } } });

  beforeAll(async () => {
    savedSettings = await admin.getSettings();
    adminId = (await mkUser("admin", "ADMIN")).id;
    client = (await mkUser("client", "CLIENT")).id;
    const svc = await db.service.findUniqueOrThrow({ where: { slug: "plomberie" } });
    provUser = (await mkUser("prov", "PROVIDER")).id;
    provId = (await db.providerProfile.create({ data: { userId: provUser, jobTitle: "Plombier", zones: ["Dakar"], status: "PENDING", services: { create: { serviceId: svc.id } } } })).id;
    const pu = (await mkUser("pik", "PROVIDER")).id;
    pikineProv = (await db.providerProfile.create({ data: { userId: pu, jobTitle: "Plombier", zones: ["Pikine"], status: "VERIFIED", services: { create: { serviceId: svc.id } } } })).id;
  });

  afterAll(async () => {
    await admin.updateSettings(adminId, savedSettings);
    const users = await db.user.findMany({ where: { phone: { contains: TAG } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await db.review.deleteMany({ where: { clientId: { in: ids } } });
    await db.dispute.deleteMany({ where: { openedBy: { in: ids } } });
    await db.serviceRequest.deleteMany({ where: { clientId: { in: ids } } });
    await db.adminAction.deleteMany({ where: { adminId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  const mk = async (over = {}) => { const r = await createRequest(client, { ...base, ...over }); if (!r.ok) throw new Error(JSON.stringify(r)); return r.id; };

  it("refuse tout accès aux non-admins (client, prestataire, compte inexistant, admin désactivé)", async () => {
    for (const id of [client, provUser, "00000000-0000-0000-0000-000000000000"]) {
      await expect(admin.listUsers(id, {})).rejects.toThrow("FORBIDDEN");
      await expect(admin.setProviderStatus(id, provId, "VERIFIED")).rejects.toThrow("FORBIDDEN");
      await expect(admin.assignProvider(id, "x", provId)).rejects.toThrow("FORBIDDEN");
      await expect(admin.updateSettings(id, { commission: 5, zones: ["Dakar"] })).rejects.toThrow("FORBIDDEN");
    }
    await db.user.update({ where: { id: adminId }, data: { isActive: false } });
    await expect(admin.listRequests(adminId, {})).rejects.toThrow("FORBIDDEN");
    await db.user.update({ where: { id: adminId }, data: { isActive: true } });
  });

  it("validation du prestataire : motif requis pour refuser, journal, notification", async () => {
    const m = await mk();
    expect((await admin.assignProvider(adminId, m, provId)).ok).toBe(false); // encore en attente
    expect((await admin.setProviderStatus(adminId, provId, "REJECTED")).ok).toBe(false); // sans motif
    expect((await admin.setProviderStatus(adminId, provId, "VERIFIED")).ok).toBe(true);
    const p = await db.providerProfile.findUnique({ where: { id: provId } });
    expect(p?.status).toBe("VERIFIED");
    expect(p?.verifiedById).toBe(adminId);
    expect(await db.notification.count({ where: { userId: provUser, kind: "provider.status" } })).toBe(1);
    expect(await db.adminAction.count({ where: { adminId, action: "provider.verified", targetId: provId } })).toBe(1);
  });

  it("affectation manuelle : contrôles de zone, remplacement, acceptation par le seul destinataire", async () => {
    const id = await mk();
    expect((await admin.assignProvider(adminId, id, pikineProv)).ok).toBe(false); // mauvaise zone
    expect((await admin.assignProvider(adminId, id, provId)).ok).toBe(true);
    const r = await db.serviceRequest.findUnique({ where: { id } });
    expect(r?.status).toBe("ASSIGNED");
    expect((await listMissions(provUser, "new")).map((x) => x.preview.id)).toContain(id);
    const detail = await admin.getRequestDetail(adminId, id);
    expect(detail?.candidates.map((c) => c.id)).toContain(provId);
    expect((await acceptMission(provUser, id)).ok).toBe(true);
    expect((await admin.assignProvider(adminId, id, provId)).ok).toBe(false); // déjà acceptée
  });

  it("suspension : les missions non commencées retournent en attente, le prestataire ne peut plus agir", async () => {
    const id = await mk();
    await admin.assignProvider(adminId, id, provId);
    await acceptMission(provUser, id);
    const started = await mk();
    await admin.assignProvider(adminId, started, provId);
    await acceptMission(provUser, started);
    await advanceMission(provUser, started, "EN_ROUTE");
    expect((await admin.setProviderStatus(adminId, provId, "SUSPENDED", "Plaintes clients")).ok).toBe(true);
    expect((await db.serviceRequest.findUnique({ where: { id } }))?.status).toBe("PENDING");
    expect((await advanceMission(provUser, started, "ARRIVED")).ok).toBe(false);
    expect((await acceptMission(provUser, await mk())).ok).toBe(false);
    expect(await db.notification.count({ where: { userId: client, kind: "request.reassign" } })).toBeGreaterThanOrEqual(1);
    await admin.setProviderStatus(adminId, provId, "VERIFIED");
  });

  it("filtres de demandes : statut, service, zone, date, recherche", async () => {
    const id = await mk({ district: "Thiaroye" });
    const ref = (await db.serviceRequest.findUnique({ where: { id } }))!.reference;
    expect((await admin.listRequests(adminId, { zone: "Pikine", q: ref })).map((r) => r.id)).toEqual([id]);
    expect(await admin.listRequests(adminId, { zone: "Dakar", q: ref })).toHaveLength(0);
    expect(await admin.listRequests(adminId, { status: "COMPLETED", q: ref })).toHaveLength(0);
    expect(await admin.listRequests(adminId, { service: "menage-lessive", q: ref })).toHaveLength(0);
    const today = new Date().toISOString().slice(0, 10);
    expect((await admin.listRequests(adminId, { from: today, to: today, q: ref }))).toHaveLength(1);
    expect(await admin.listRequests(adminId, { to: "2020-01-01", q: ref })).toHaveLength(0);
  });

  it("avis masqué : note moyenne recalculée ; litige : décision obligatoire", async () => {
    const id = await mk();
    await admin.assignProvider(adminId, id, provId);
    await acceptMission(provUser, id);
    for (const s of ["EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"] as const) await advanceMission(provUser, id, s);
    await submitReview(client, id, { rating: 1, comment: "Insultes" });
    const review = (await db.review.findUnique({ where: { requestId: id } }))!;
    expect(Number((await db.providerProfile.findUnique({ where: { id: provId } }))!.ratingAvg)).toBe(1);
    expect((await admin.setReviewHidden(adminId, review.id, true)).ok).toBe(true);
    expect(Number((await db.providerProfile.findUnique({ where: { id: provId } }))!.ratingAvg)).toBe(0);

    const d = await db.dispute.create({ data: { requestId: id, openedBy: client, reason: "Test" } });
    expect((await admin.updateDispute(adminId, d.id, "RESOLVED")).ok).toBe(false);
    expect((await admin.updateDispute(adminId, d.id, "RESOLVED", "Avertissement au prestataire")).ok).toBe(true);
    expect((await db.dispute.findUnique({ where: { id: d.id } }))?.status).toBe("RESOLVED");
  });

  it("indicateurs cohérents avec les données", async () => {
    const k = await admin.getKpis();
    const total = await db.serviceRequest.count();
    expect(k.total).toBe(total);
    expect(k.completed).toBe(await db.serviceRequest.count({ where: { status: "COMPLETED" } }));
    expect(k.cancelled).toBe(await db.serviceRequest.count({ where: { status: "CANCELLED" } }));
    expect(k.acceptanceRate).toBeGreaterThanOrEqual(0);
    expect(k.acceptanceRate).toBeLessThanOrEqual(100);
  });

  it("comptes : désactivation, impossible sur soi-même ou un admin ; commission et zones", async () => {
    expect((await admin.setUserActive(adminId, adminId, false)).ok).toBe(false);
    const other = await mkUser("admin2", "ADMIN");
    expect((await admin.setUserActive(adminId, other.id, false)).ok).toBe(false);
    expect((await admin.setUserActive(adminId, client, false)).ok).toBe(true);
    expect((await db.user.findUnique({ where: { id: client } }))?.isActive).toBe(false);
    await admin.setUserActive(adminId, client, true);

    expect((await admin.updateSettings(adminId, { commission: 50, zones: ["Dakar"] })).ok).toBe(false);
    expect((await admin.updateSettings(adminId, { commission: 12, zones: [] })).ok).toBe(false);
    expect((await admin.updateSettings(adminId, { commission: 12, zones: ["Dakar"] })).ok).toBe(true);
    const out = await createRequest(client, { ...base, district: "Thiaroye" }); // Pikine non couverte
    expect(out.ok).toBe(false);
    expect((await mk()).length).toBeGreaterThan(0); // Dakar toujours OK
  });

  it("services : prix fixe validé, désactivation retire le service de la demande", async () => {
    const svc = await db.service.findUniqueOrThrow({ where: { slug: "menage-lessive" } });
    const input = { name: svc.name, basePriceFcfa: svc.basePriceFcfa, priceMode: svc.priceMode, allowsUrgent: svc.allowsUrgent, isActive: svc.isActive };
    expect((await admin.updateService(adminId, svc.id, { ...input, basePriceFcfa: null })).ok).toBe(false);
    expect((await admin.updateService(adminId, svc.id, { ...input, isActive: false })).ok).toBe(true);
    expect((await createRequest(client, { ...base, serviceSlug: "menage-lessive", mode: "SCHEDULED", scheduledAt: new Date(Date.now() + 86_400_000).toISOString() })).ok).toBe(false);
    await admin.updateService(adminId, svc.id, input);
    expect((await admin.listAdminActions(adminId)).length).toBeGreaterThan(0);
    void cancelClientRequest;
  });
});
