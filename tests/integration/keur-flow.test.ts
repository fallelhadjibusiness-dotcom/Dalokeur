import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelClientRequest, confirmCompletion, createRequest, getClientRequest, submitReview } from "@/lib/requests";
import { acceptMission, advanceMission } from "@/lib/missions";
import { expireStaleRequests } from "@/lib/expiry";
import { DEMO_MAX_BALANCE, topUpDemo } from "@/lib/keur";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const TAG = `k${Date.now()}`;
const base = { serviceSlug: "plomberie", mode: "URGENT" as const, description: "Fuite sous l'évier de la cuisine", district: "Médina", addressLine: "Rue 11", landmark: "porte bleue" };

suite("points Keur et portefeuille démo (base réelle)", () => {
  const u: Record<string, string> = {};
  const balance = async (k: string) => (await db.keurPoints.findUnique({ where: { userId: u[k] } }))!.balance;
  const setBalance = (k: string, n: number) => db.keurPoints.update({ where: { userId: u[k] }, data: { balance: n } });
  const mk = async (k: string, over = {}) => { const r = await createRequest(u[k], { ...base, ...over }); return r; };
  const ok = async (k: string, over = {}) => { const r = await mk(k, over); if (!r.ok) throw new Error(JSON.stringify(r)); return r.id; };

  beforeAll(async () => {
    const svc = await db.service.findUniqueOrThrow({ where: { slug: "plomberie" } });
    for (const [k, role] of [["c1", "CLIENT"], ["c2", "CLIENT"], ["c3", "CLIENT"], ["prov", "PROVIDER"]] as const) {
      u[k] = (await db.user.create({ data: { phone: `test-${TAG}-${k}`, fullName: `Test ${k}`, passwordHash: "x", roles: { create: { role } },
        ...(role === "CLIENT" ? { keurPoints: { create: { balance: 0 } }, wallet: { create: { isDemo: true } } } : {}) } })).id;
    }
    await db.providerProfile.create({ data: { userId: u.prov, jobTitle: "Plombier", zones: ["Dakar"], status: "VERIFIED", services: { create: { serviceId: svc.id } } } });
  });
  afterAll(async () => {
    const ids = Object.values(u);
    await db.review.deleteMany({ where: { clientId: { in: ids } } });
    await db.serviceRequest.deleteMany({ where: { clientId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("un nouveau compte n'a ni points ni argent", async () => {
    expect(await balance("c1")).toBe(0);
    expect((await db.wallet.findUnique({ where: { userId: u.c1 } }))!.balanceFcfa).toBe(0);
  });

  it("utilisation : réduction du transport seulement, plafonnée ; débit tracé", async () => {
    await setBalance("c1", 300);
    const id = await ok("c1", { useKeur: true });
    const r = await db.serviceRequest.findUniqueOrThrow({ where: { id } });
    expect(r).toMatchObject({ transportFeeFcfa: 2000, keurPointsUsed: 200, keurDiscountFcfa: 2000 });
    expect(await balance("c1")).toBe(100);
    expect(await db.keurPointTransaction.count({ where: { userId: u.c1, requestId: id, delta: -200 } })).toBe(1);
    await setBalance("c1", 50);
    const id2 = await ok("c1", { useKeur: true });
    expect(await db.serviceRequest.findUniqueOrThrow({ where: { id: id2 } })).toMatchObject({ keurPointsUsed: 50, keurDiscountFcfa: 500 });
    expect(await balance("c1")).toBe(0);
  });

  it("refus : sans solde, ou service sans frais de transport (ménage)", async () => {
    await setBalance("c2", 0);
    const none = await mk("c2", { useKeur: true });
    expect(none.ok).toBe(false);
    await setBalance("c2", 100);
    const menage = await mk("c2", { serviceSlug: "menage-lessive", mode: "SCHEDULED", scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), useKeur: true });
    expect(menage.ok).toBe(false);
    if (!menage.ok) expect(menage.errors?.useKeur).toMatch(/pas de frais de transport/);
    expect(await balance("c2")).toBe(100); // rien débité
    expect(await db.serviceRequest.count({ where: { clientId: u.c2 } })).toBe(0);
  });

  it("deux demandes simultanées avec le même solde : un seul débit, jamais de solde négatif", async () => {
    await setBalance("c3", 200);
    const [a, b] = await Promise.all([mk("c3", { useKeur: true }), mk("c3", { useKeur: true })]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await balance("c3")).toBe(0);
    expect(await db.serviceRequest.count({ where: { clientId: u.c3 } })).toBe(1);
  });

  it("annulation (avant ou après acceptation) : remboursement une seule fois", async () => {
    await setBalance("c1", 100);
    const id = await ok("c1", { useKeur: true });
    expect(await balance("c1")).toBe(0);
    await acceptMission(u.prov, id);
    expect((await cancelClientRequest(u.c1, id, "Plus besoin")).ok).toBe(true);
    expect(await balance("c1")).toBe(100);
    expect((await cancelClientRequest(u.c1, id, "encore")).ok).toBe(false);
    expect(await balance("c1")).toBe(100);
    const w = await db.wallet.findUniqueOrThrow({ where: { userId: u.c1 } });
    expect(w.balanceFcfa).toBe(0); // les points ne touchent jamais le solde en FCFA
  });

  it("expiration : demande sans prestataire annulée, points remboursés, client notifié", async () => {
    await setBalance("c1", 100);
    const id = await ok("c1", { useKeur: true });
    await db.serviceRequest.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    const res = await expireStaleRequests(new Date());
    expect(res.expired).toBeGreaterThanOrEqual(1);
    const r = await db.serviceRequest.findUniqueOrThrow({ where: { id } });
    expect(r.status).toBe("CANCELLED");
    expect(await balance("c1")).toBe(100);
    expect(await db.notification.count({ where: { userId: u.c1, kind: "request.expired" } })).toBeGreaterThanOrEqual(1);
    expect((await expireStaleRequests(new Date())).expired).toBe(0); // idempotent
    expect(await balance("c1")).toBe(100);
    // expiration paresseuse à la consultation
    const id2 = await ok("c1");
    await db.serviceRequest.update({ where: { id: id2 }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await getClientRequest(u.c1, id2))?.status).toBe("CANCELLED");
  });

  it("gains : points à la fin de mission et à l'avis, une seule fois, rien si annulée", async () => {
    await setBalance("c1", 0);
    const id = await ok("c1");
    await acceptMission(u.prov, id);
    for (const s of ["EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"] as const) await advanceMission(u.prov, id, s);
    expect(await balance("c1")).toBe(10);
    expect((await confirmCompletion(u.c1, id)).ok).toBe(false); // déjà terminée : pas de double gain
    expect(await balance("c1")).toBe(10);
    expect((await submitReview(u.c1, id, { rating: 5 })).ok).toBe(true);
    expect(await balance("c1")).toBe(15);
    expect((await submitReview(u.c1, id, { rating: 5 })).ok).toBe(false);
    expect(await balance("c1")).toBe(15);
    // fin confirmée par le client
    const id2 = await ok("c1");
    await acceptMission(u.prov, id2);
    for (const s of ["EN_ROUTE", "ARRIVED", "IN_PROGRESS"] as const) await advanceMission(u.prov, id2, s);
    expect((await confirmCompletion(u.c1, id2)).ok).toBe(true);
    expect(await balance("c1")).toBe(25);
    // annulée : aucun point
    const id3 = await ok("c1");
    await cancelClientRequest(u.c1, id3);
    expect(await balance("c1")).toBe(25);
    expect((await db.wallet.findUniqueOrThrow({ where: { userId: u.c1 } })).balanceFcfa).toBe(0);
  });

  it("règles configurables par l'administration", async () => {
    const prev = await db.setting.findUnique({ where: { key: "keur_rules" } });
    await db.setting.upsert({ where: { key: "keur_rules" }, update: { value: { pointValueFcfa: 20, perMission: 30, perReview: 5 } }, create: { key: "keur_rules", value: { pointValueFcfa: 20, perMission: 30, perReview: 5 } } });
    await setBalance("c1", 40);
    const id = await ok("c1", { useKeur: true });
    expect(await db.serviceRequest.findUniqueOrThrow({ where: { id } })).toMatchObject({ keurPointsUsed: 40, keurDiscountFcfa: 800 });
    await cancelClientRequest(u.c1, id);
    if (prev) await db.setting.update({ where: { key: "keur_rules" }, data: { value: prev.value as object } });
    else await db.setting.delete({ where: { key: "keur_rules" } });
  });

  it("portefeuille démo : recharges prédéfinies, plafond, historique", async () => {
    expect((await topUpDemo(u.c2, 123)).ok).toBe(false);
    expect((await topUpDemo(u.c2, 20000)).ok).toBe(true);
    expect((await db.wallet.findUniqueOrThrow({ where: { userId: u.c2 } })).balanceFcfa).toBe(20000);
    await db.wallet.update({ where: { userId: u.c2 }, data: { balanceFcfa: DEMO_MAX_BALANCE - 1000 } });
    expect((await topUpDemo(u.c2, 5000)).ok).toBe(false);
    expect(await db.walletTransaction.count({ where: { wallet: { userId: u.c2 }, kind: "DEMO_TOPUP" } })).toBe(1);
    expect(await balance("c2")).toBe(100); // les points sont intacts
  });
});
