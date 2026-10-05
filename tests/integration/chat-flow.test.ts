import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelClientRequest, createRequest } from "@/lib/requests";
import { acceptMission, advanceMission } from "@/lib/missions";
import { listMessages, listConversations, sendMessage } from "@/lib/chat";
import { listNotifications, markAllRead, unreadCount } from "@/lib/notifications";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const TAG = `m${Date.now()}`;
const base = { serviceSlug: "plomberie", mode: "URGENT" as const, description: "Fuite sous l'évier de la cuisine", district: "Médina", addressLine: "Rue 11", landmark: "porte bleue" };

suite("messagerie et notifications (base réelle)", () => {
  const u: Record<string, string> = {};
  let providerProfile: string;
  const actor = (k: string, role: "CLIENT" | "PROVIDER" | "ADMIN") => ({ id: u[k], role });

  beforeAll(async () => {
    const svc = await db.service.findUniqueOrThrow({ where: { slug: "plomberie" } });
    for (const [k, role] of [["client", "CLIENT"], ["client2", "CLIENT"], ["prov", "PROVIDER"], ["prov2", "PROVIDER"], ["admin", "ADMIN"], ["spam", "CLIENT"]] as const) {
      u[k] = (await db.user.create({ data: { phone: `test-${TAG}-${k}`, fullName: `Test ${k}`, passwordHash: "x", roles: { create: { role } } } })).id;
    }
    for (const k of ["prov", "prov2"]) {
      const p = await db.providerProfile.create({ data: { userId: u[k], jobTitle: "Plombier", zones: ["Dakar"], status: "VERIFIED", services: { create: { serviceId: svc.id } } } });
      if (k === "prov") providerProfile = p.id;
    }
  });

  afterAll(async () => {
    const ids = Object.values(u);
    await db.serviceRequest.deleteMany({ where: { clientId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  const mk = async () => { const r = await createRequest(u.client, base); if (!r.ok) throw new Error(JSON.stringify(r)); return r.id; };

  it("pas de conversation avant l'acceptation", async () => {
    const id = await mk();
    expect(await listMessages(actor("client", "CLIENT"), id)).toBeNull();
    expect(await listMessages(actor("prov", "PROVIDER"), id)).toBeNull();
    expect((await sendMessage(actor("client", "CLIENT"), id, "Bonjour")).ok).toBe(false);
    expect((await sendMessage(actor("prov", "PROVIDER"), id, "Bonjour")).ok).toBe(false);
  });

  it("après acceptation : seuls client et prestataire échangent ; l'admin lit sans écrire ; les autres sont exclus", async () => {
    const id = await mk();
    await acceptMission(u.prov, id);
    expect((await sendMessage(actor("client", "CLIENT"), id, "Bonjour, vous arrivez quand ?")).ok).toBe(true);
    expect((await sendMessage(actor("prov", "PROVIDER"), id, "Dans 20 minutes")).ok).toBe(true);
    for (const [k, role] of [["client2", "CLIENT"], ["prov2", "PROVIDER"]] as const) {
      expect(await listMessages(actor(k, role), id)).toBeNull();
      expect((await sendMessage(actor(k, role), id, "intrus")).ok).toBe(false);
    }
    const adminView = await listMessages(actor("admin", "ADMIN"), id);
    expect(adminView?.messages).toHaveLength(2);
    expect(adminView?.canSend).toBe(false);
    expect((await sendMessage(actor("admin", "ADMIN"), id, "hello")).ok).toBe(false);
  });

  it("validation, accusés de lecture, curseur et non-lus", async () => {
    const id = await mk();
    await acceptMission(u.prov, id);
    const c = actor("client", "CLIENT"), p = actor("prov", "PROVIDER");
    expect((await sendMessage(c, id, "   ")).ok).toBe(false);
    expect((await sendMessage(c, id, "x".repeat(1001))).ok).toBe(false);
    const first = await sendMessage(c, id, "Message 1");
    expect(first.ok).toBe(true);
    expect((await listConversations(p)).find((x) => x.id === id)?.unread).toBe(1);
    const before = (await listMessages(c, id))!.messages[0];
    expect(before.read).toBe(false);
    const seen = await listMessages(p, id); // lecture par le prestataire
    expect(seen?.messages[0].mine).toBe(false);
    expect((await listConversations(p)).find((x) => x.id === id)?.unread).toBe(0);
    expect((await listMessages(c, id))!.messages[0].read).toBe(true); // "Lu" côté client
    await new Promise((r) => setTimeout(r, 5));
    await sendMessage(p, id, "Message 2");
    const delta = await listMessages(c, id, seen!.messages[0].createdAt);
    expect(delta?.messages.map((m) => m.body)).toContain("Message 2");
  });

  it("fermeture : lecture seule après annulation", async () => {
    const id = await mk();
    await acceptMission(u.prov, id);
    await sendMessage(actor("client", "CLIENT"), id, "Avant annulation");
    await cancelClientRequest(u.client, id, "Plus besoin");
    // l'assignation est annulée : plus de conversation accessible au prestataire
    expect(await listMessages(actor("prov", "PROVIDER"), id)).toBeNull();
    expect((await sendMessage(actor("client", "CLIENT"), id, "Après")).ok).toBe(false);
  });

  it("après la fin de mission : encore ouverte, puis fermée au bout de 48 h", async () => {
    const id = await mk();
    await acceptMission(u.prov, id);
    for (const s of ["EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"] as const) await advanceMission(u.prov, id, s);
    expect((await sendMessage(actor("client", "CLIENT"), id, "Merci !")).ok).toBe(true);
    await db.serviceRequest.update({ where: { id }, data: { completedAt: new Date(Date.now() - 49 * 3600_000) } });
    expect((await sendMessage(actor("client", "CLIENT"), id, "Encore")).ok).toBe(false);
    expect((await listMessages(actor("client", "CLIENT"), id))?.canSend).toBe(false);
  });

  it("notifications : acceptation, statuts, messages ; chacun ne lit que les siennes", async () => {
    const id = await mk();
    await acceptMission(u.prov, id);
    await advanceMission(u.prov, id, "EN_ROUTE");
    await sendMessage(actor("client", "CLIENT"), id, "Je suis au portail bleu");
    const kinds = (await listNotifications(u.client)).map((n) => n.kind);
    expect(kinds).toEqual(expect.arrayContaining(["request.accepted", "request.status"]));
    expect((await listNotifications(u.prov)).map((n) => n.kind)).toContain("message.new");
    expect(await unreadCount(u.client)).toBeGreaterThan(0);
    await markAllRead(u.client);
    expect(await unreadCount(u.client)).toBe(0);
    expect(await unreadCount(u.prov)).toBeGreaterThan(0); // intact
    await cancelClientRequest(u.client, id, "Annulation test");
    expect((await listNotifications(u.prov)).map((n) => n.kind)).toContain("mission.cancelled");
  });

  it("limite d'envoi : 20 messages par minute", async () => {
    const r = await createRequest(u.spam, base); if (!r.ok) throw new Error("x");
    await acceptMission(u.prov, r.id);
    let blocked = 0;
    for (let i = 0; i < 25; i++) if (!(await sendMessage(actor("spam", "CLIENT"), r.id, `m${i}`)).ok) blocked++;
    expect(blocked).toBe(5);
    void providerProfile;
  });
});
