// Tests d'intégration contre PostgreSQL (nécessite DATABASE_URL et un seed). Ignorés sans base.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelClientRequest, confirmCompletion, createRequest, getClientRequest, listClientRequests, reportProblem, submitReview } from "@/lib/requests";

const hasDb = !!process.env.DATABASE_URL;
const suite = hasDb ? describe : describe.skip;
const TAG = `t${Date.now()}`;

const base = { serviceSlug: "plomberie", mode: "URGENT" as const, description: "Fuite sous l'évier de la cuisine", district: "Médina", addressLine: "Rue 11 x 6", landmark: "près de la pharmacie" };

suite("parcours client (base réelle)", () => {
  let a: string, b: string, providerId: string;

  beforeAll(async () => {
    const mk = (n: string, role: "CLIENT" | "PROVIDER") =>
      db.user.create({ data: { phone: `test-${TAG}-${n}`, fullName: `Test ${n}`, passwordHash: "x", roles: { create: { role } }, keurPoints: role === "CLIENT" ? { create: { balance: 100 } } : undefined } });
    a = (await mk("1", "CLIENT")).id;
    b = (await mk("2", "CLIENT")).id;
    const p = await mk("3", "PROVIDER");
    providerId = (await db.providerProfile.create({ data: { userId: p.id, jobTitle: "Plombier", zones: ["Dakar"], status: "VERIFIED" } })).id;
  });

  afterAll(async () => {
    const users = await db.user.findMany({ where: { fullName: { startsWith: "Test " }, phone: { contains: TAG } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await db.review.deleteMany({ where: { clientId: { in: ids } } });
    await db.dispute.deleteMany({ where: { openedBy: { in: ids } } });
    await db.serviceRequest.deleteMany({ where: { clientId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  async function make(over: Partial<typeof base> & { scheduledAt?: string } = {}) {
    const r = await createRequest(a, { ...base, ...over });
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r.id;
  }
  const accept = async (id: string, status: "ACCEPTED" | "IN_PROGRESS" = "ACCEPTED") => {
    await db.assignment.create({ data: { requestId: id, providerId, status: "ACCEPTED" } });
    await db.serviceRequest.update({ where: { id }, data: { status } });
  };

  it("valide le formulaire en français", async () => {
    const r = await createRequest(a, { ...base, description: "court", landmark: "", district: "Paris" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors?.description).toMatch(/Décrivez/);
      expect(r.errors?.landmark).toMatch(/repère/);
      expect(r.errors?.district).toBeTruthy();
    }
  });

  it("refuse l'urgence pour le ménage et un créneau trop proche", async () => {
    const u = await createRequest(a, { ...base, serviceSlug: "menage-lessive" });
    expect(u.ok).toBe(false);
    const soon = await createRequest(a, { ...base, mode: "SCHEDULED", scheduledAt: new Date(Date.now() + 10 * 60_000).toISOString() });
    expect(soon.ok).toBe(false);
  });

  it("crée une demande avec zone, historique et prix selon le service", async () => {
    const id = await make();
    const r = await getClientRequest(a, id);
    expect(r?.status).toBe("NEW");
    expect(r?.zone).toBe("Dakar");
    expect(r?.priceMode).toBe("QUOTE_AFTER_DIAGNOSIS");
    expect(r?.estimateFcfa).toBeNull();
    expect(r?.history).toHaveLength(1);
    const m = await createRequest(a, { ...base, serviceSlug: "menage-lessive", mode: "SCHEDULED", scheduledAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(m.ok).toBe(true);
    if (m.ok) expect((await getClientRequest(a, m.id))?.estimateFcfa).toBe(8000);
    const pik = await make({ district: "Thiaroye" });
    expect((await getClientRequest(a, pik))?.zone).toBe("Pikine");
  });

  it("un autre client ne voit, n'annule ni ne note rien", async () => {
    const id = await make();
    expect(await getClientRequest(b, id)).toBeNull();
    expect((await listClientRequests(b)).find((r) => r.id === id)).toBeUndefined();
    expect((await cancelClientRequest(b, id)).ok).toBe(false);
    expect((await submitReview(b, id, { rating: 5 })).ok).toBe(false);
    expect((await reportProblem(b, id, "problème grave")).ok).toBe(false);
    expect((await getClientRequest(a, id))?.status).toBe("NEW");
  });

  it("annulation avant acceptation : sans motif", async () => {
    const id = await make();
    expect((await cancelClientRequest(a, id)).ok).toBe(true);
    expect((await getClientRequest(a, id))?.status).toBe("CANCELLED");
    expect((await cancelClientRequest(a, id)).ok).toBe(false); // déjà annulée
  });

  it("annulation après acceptation : motif obligatoire + remboursement des points Keur", async () => {
    const id = await make();
    await db.serviceRequest.update({ where: { id }, data: { keurPointsUsed: 30 } });
    await db.keurPoints.update({ where: { userId: a }, data: { balance: 70 } });
    await accept(id);
    const noReason = await cancelClientRequest(a, id);
    expect(noReason.ok).toBe(false);
    expect((await getClientRequest(a, id))?.status).toBe("ACCEPTED");
    expect((await cancelClientRequest(a, id, "Je ne suis plus disponible")).ok).toBe(true);
    expect((await db.keurPoints.findUnique({ where: { userId: a } }))?.balance).toBe(100);
    expect((await db.assignment.findFirst({ where: { requestId: id } }))?.status).toBe("CANCELLED");
  });

  it("fin de service, avis unique et note moyenne", async () => {
    const id = await make();
    expect((await confirmCompletion(a, id)).ok).toBe(false); // pas en cours
    await accept(id, "IN_PROGRESS");
    expect((await submitReview(a, id, { rating: 5 })).ok).toBe(false); // pas terminée
    expect((await confirmCompletion(a, id)).ok).toBe(true);
    expect((await submitReview(a, id, { rating: 9 })).ok).toBe(false); // note invalide
    expect((await submitReview(a, id, { rating: 4, comment: "Très bien" })).ok).toBe(true);
    const again = await submitReview(a, id, { rating: 1 });
    expect(again.ok).toBe(false);
    const p = await db.providerProfile.findUnique({ where: { id: providerId } });
    expect(Number(p?.ratingAvg)).toBe(4);
    expect(p?.missionsDone).toBe(1);
  });

  it("signalement : crée un litige", async () => {
    const id = await make();
    expect((await reportProblem(a, id, "ab")).ok).toBe(false);
    expect((await reportProblem(a, id, "Le prestataire n'est pas venu")).ok).toBe(true);
    expect(await db.dispute.count({ where: { requestId: id } })).toBe(1);
  });
});
