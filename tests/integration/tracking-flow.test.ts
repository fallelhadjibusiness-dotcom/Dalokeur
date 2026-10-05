import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelClientRequest, confirmCompletion, createRequest } from "@/lib/requests";
import { acceptMission, advanceMission, getMission, listMissions } from "@/lib/missions";
import { getLiveLocation, getProviderTracking, MIN_INTERVAL_MS, purgeTrackingData, pushLocation, startSharing, stopSharing } from "@/lib/tracking";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const TAG = `g${Date.now()}`;
const GPS = { lat: 14.6935, lng: -17.4655 }; // Fann (adresse du client)
const base = { serviceSlug: "plomberie", mode: "URGENT" as const, description: "Fuite sous l'évier de la cuisine", district: "Fann", addressLine: "Rue 5", landmark: "près de la pharmacie", lat: GPS.lat, lng: GPS.lng, accuracy: 12, source: "GPS" as const };
const trip = (n: number) => ({ lat: 14.7 + n * 0.001, lng: -17.45, accuracy: 10 });

suite("géolocalisation (base réelle)", () => {
  const u: Record<string, string> = {};

  beforeAll(async () => {
    const svc = await db.service.findMany({ where: { slug: { in: ["plomberie", "menage-lessive", "livraison-locale"] } } });
    for (const [k, role] of [["client", "CLIENT"], ["client2", "CLIENT"], ["prov", "PROVIDER"], ["prov2", "PROVIDER"], ["admin", "ADMIN"]] as const) {
      u[k] = (await db.user.create({ data: { phone: `test-${TAG}-${k}`, fullName: `Test ${k}`, passwordHash: "x", roles: { create: { role } } } })).id;
    }
    for (const k of ["prov", "prov2"]) await db.providerProfile.create({ data: { userId: u[k], jobTitle: "Prestataire", zones: ["Dakar"], status: "VERIFIED", services: { create: svc.map((s) => ({ serviceId: s.id })) } } });
  });
  afterAll(async () => {
    const ids = Object.values(u);
    await db.serviceRequest.deleteMany({ where: { clientId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  const mk = async (over = {}) => { const r = await createRequest(u.client, { ...base, ...over }); if (!r.ok) throw new Error(JSON.stringify(r)); return r.id; };
  const accepted = async (over = {}) => { const id = await mk(over); await acceptMission(u.prov, id); return id; };

  it("création : coordonnées exactes + version approximative ; hors zone refusée ; manuel possible", async () => {
    const id = await mk();
    const loc = (await db.serviceRequest.findUnique({ where: { id }, include: { location: true } }))!.location;
    expect(loc.lat).toBe(GPS.lat);
    expect(loc.source).toBe("GPS");
    expect(loc.approxLat).not.toBe(GPS.lat);
    expect(Math.abs(loc.approxLat! - GPS.lat)).toBeLessThan(0.005);
    const out = await createRequest(u.client, { ...base, lat: 48.85, lng: 2.35 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors?.location).toMatch(/hors de la zone/);
    const manual = await createRequest(u.client, { ...base, lat: "", lng: "", accuracy: "", source: "MANUAL" });
    expect(manual.ok).toBe(true);
    if (manual.ok) expect((await db.serviceRequest.findUnique({ where: { id: manual.id }, include: { location: true } }))!.location.lat).toBeNull();
    const pin = await mk({ source: "PIN" });
    expect((await db.serviceRequest.findUnique({ where: { id: pin }, include: { location: true } }))!.location.source).toBe("PIN");
  });

  it("avant acceptation : le prestataire ne reçoit que la position approximative", async () => {
    const id = await mk();
    const m = (await listMissions(u.prov, "new")).find((x) => x.preview.id === id)!;
    const json = JSON.stringify(m);
    expect(json).not.toContain(String(GPS.lat));
    expect(json).not.toContain(String(GPS.lng));
    expect(m.preview.approx.lat).not.toBeNull();
    await acceptMission(u.prov, id);
    expect((await getMission(u.prov, id))!.full!.coords.lat).toBe(GPS.lat); // exact après acceptation
    expect(await getMission(u.prov2, id)).toBeNull();
  });

  it("consentement obligatoire ; prestataire non accepté ou service non éligible refusés", async () => {
    const id = await accepted();
    expect((await startSharing(u.prov, id, trip(0), false)).ok).toBe(false);
    expect((await startSharing(u.prov, id, trip(0), undefined as unknown as boolean)).ok).toBe(false);
    expect((await startSharing(u.prov2, id, trip(0), true)).ok).toBe(false); // pas le prestataire assigné
    const menage = await accepted({ serviceSlug: "menage-lessive", mode: "SCHEDULED", scheduledAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect((await getProviderTracking(u.prov, menage))?.eligible).toBe(false);
    expect((await startSharing(u.prov, menage, trip(0), true)).ok).toBe(false);
    const plombProgramme = await accepted({ mode: "SCHEDULED", scheduledAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect((await getProviderTracking(u.prov, plombProgramme))?.eligible).toBe(false); // dépannage programmé : pas de GPS continu
    const livraison = await accepted({ serviceSlug: "livraison-locale", mode: "SCHEDULED", scheduledAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect((await getProviderTracking(u.prov, livraison))?.eligible).toBe(true); // livraison : toujours éligible
    expect((await db.liveLocationUpdate.count({ where: { assignment: { requestId: { in: [id, menage, plombProgramme] } } } }))).toBe(0);
  });

  it("« Commencer le trajet » : consentement horodaté, passage en route, client notifié, position lisible", async () => {
    const id = await accepted();
    expect(await getLiveLocation({ id: u.client, role: "CLIENT" }, id)).toEqual({ state: "not_started" });
    expect((await startSharing(u.prov, id, trip(0), true)).ok).toBe(true);
    expect((await db.serviceRequest.findUnique({ where: { id } }))?.status).toBe("EN_ROUTE");
    const row = await db.liveLocationUpdate.findFirst({ where: { assignment: { requestId: id } } });
    expect(row?.consentAt).toBeTruthy();
    expect(row?.sharingActive).toBe(true);
    expect((await db.notification.count({ where: { userId: u.client, kind: "tracking.started" } }))).toBeGreaterThan(0);
    const live = await getLiveLocation({ id: u.client, role: "CLIENT" }, id);
    expect(live?.state).toBe("active");
    if (live?.state === "active") {
      expect(live.position.lat).toBeCloseTo(14.7, 3);
      expect(live.etaMinutes).toBeGreaterThanOrEqual(1);
      expect(live.stale).toBe(false);
    }
    expect((await startSharing(u.prov, id, trip(1), true)).ok).toBe(true); // idempotent
    expect(await db.liveLocationUpdate.count({ where: { assignment: { requestId: id } } })).toBe(1);
  });

  it("mises à jour : cadence minimale, zone, précision", async () => {
    const id = await accepted();
    await startSharing(u.prov, id, trip(0), true);
    const t0 = new Date();
    expect((await pushLocation(u.prov, id, trip(1), new Date(t0.getTime() + 2000))).ok).toBe(true);
    expect(await db.liveLocationUpdate.count({ where: { assignmentId: (await db.assignment.findFirstOrThrow({ where: { requestId: id } })).id } })).toBe(1); // ignoré : trop rapproché
    expect((await pushLocation(u.prov, id, trip(2), new Date(t0.getTime() + MIN_INTERVAL_MS + 1000))).ok).toBe(true);
    expect(await db.liveLocationUpdate.count({ where: { assignment: { requestId: id } } })).toBe(2);
    expect((await pushLocation(u.prov, id, { lat: 48.85, lng: 2.35 }, new Date(t0.getTime() + 60_000))).ok).toBe(false);
    expect((await pushLocation(u.prov2, id, trip(3), new Date(t0.getTime() + 60_000))).ok).toBe(false);
    const bad = await accepted();
    expect((await startSharing(u.prov, bad, { ...trip(0), accuracy: 5000 }, true)).ok).toBe(false); // signal trop imprécis
  });

  it("confidentialité : seuls le client concerné et l'admin lisent la position", async () => {
    const id = await accepted();
    await startSharing(u.prov, id, trip(0), true);
    expect((await getLiveLocation({ id: u.client, role: "CLIENT" }, id))?.state).toBe("active");
    expect((await getLiveLocation({ id: u.admin, role: "ADMIN" }, id))?.state).toBe("active");
    expect(await getLiveLocation({ id: u.client2, role: "CLIENT" }, id)).toBeNull();
    expect(await getLiveLocation({ id: u.prov2, role: "PROVIDER" }, id)).toBeNull();
    expect(await getLiveLocation({ id: u.prov, role: "PROVIDER" }, id)).toBeNull();
  });

  it("arrêt manuel : plus aucune position visible, redémarrage possible", async () => {
    const id = await accepted();
    await startSharing(u.prov, id, trip(0), true);
    expect((await stopSharing(u.prov, id)).ok).toBe(true);
    expect(await getLiveLocation({ id: u.client, role: "CLIENT" }, id)).toEqual({ state: "stopped" });
    expect((await pushLocation(u.prov, id, trip(1), new Date(Date.now() + 60_000))).ok).toBe(false);
    expect((await startSharing(u.prov, id, trip(2), true)).ok).toBe(true);
    expect((await getLiveLocation({ id: u.client, role: "CLIENT" }, id))?.state).toBe("active");
  });

  it("arrêt automatique : mission terminée, confirmée par le client, annulée, expirée", async () => {
    const run = async (end: (id: string) => Promise<unknown>) => {
      const id = await accepted(); await startSharing(u.prov, id, trip(0), true); await end(id);
      expect(await db.liveLocationUpdate.count({ where: { assignment: { requestId: id }, sharingActive: true } })).toBe(0);
      const st = await getLiveLocation({ id: u.client, role: "CLIENT" }, id);
      expect(["stopped", "unavailable"]).toContain(st?.state); // aucune position exposée après la fin
      expect(JSON.stringify(st)).not.toContain("position");
      return id;
    };
    await run(async (id) => { for (const s of ["ARRIVED", "IN_PROGRESS", "COMPLETED"] as const) await advanceMission(u.prov, id, s); });
    await run(async (id) => { await advanceMission(u.prov, id, "ARRIVED"); await advanceMission(u.prov, id, "IN_PROGRESS"); await confirmCompletion(u.client, id); });
    await run((id) => cancelClientRequest(u.client, id, "Plus besoin"));
    // expiration (> 4 h)
    const id = await accepted(); await startSharing(u.prov, id, trip(0), true);
    await db.liveLocationUpdate.updateMany({ where: { assignment: { requestId: id } }, data: { startedAt: new Date(Date.now() - 5 * 3600_000) } });
    expect((await getLiveLocation({ id: u.client, role: "CLIENT" }, id))?.state).toBe("stopped");
    expect((await pushLocation(u.prov, id, trip(1), new Date())).ok).toBe(false);
  });

  it("position périmée : signalée comme « dernière position connue »", async () => {
    const id = await accepted(); await startSharing(u.prov, id, trip(0), true);
    const live = await getLiveLocation({ id: u.client, role: "CLIENT" }, id, new Date(Date.now() + 3 * 60_000));
    expect(live?.state === "active" && live.stale).toBe(true);
  });

  it("purge : trajets des missions closes depuis > 24 h supprimés, missions en cours conservées", async () => {
    const old = await accepted(); await startSharing(u.prov, old, trip(0), true);
    for (const s of ["ARRIVED", "IN_PROGRESS", "COMPLETED"] as const) await advanceMission(u.prov, old, s);
    const recent = await accepted(); await startSharing(u.prov, recent, trip(0), true);
    for (const s of ["ARRIVED", "IN_PROGRESS", "COMPLETED"] as const) await advanceMission(u.prov, recent, s);
    const live = await accepted(); await startSharing(u.prov, live, trip(0), true);
    await db.serviceRequest.update({ where: { id: old }, data: { completedAt: new Date(Date.now() - 25 * 3600_000) } });
    await purgeTrackingData();
    const count = (id: string) => db.liveLocationUpdate.count({ where: { assignment: { requestId: id } } });
    expect(await count(old)).toBe(0);
    expect(await count(recent)).toBe(1); // < 24 h : conservé pour d'éventuels litiges
    expect(await count(live)).toBe(1);
  });
});
