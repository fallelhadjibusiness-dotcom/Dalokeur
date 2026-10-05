// Points Keur et portefeuille de démonstration. Aucun paiement réel, aucune conversion points → argent.
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { notify } from "./notifications";
import { DEFAULT_KEUR_RULES, type KeurRules } from "./pricing";

type Tx = Prisma.TransactionClient | typeof db;

export async function getKeurRules(tx: Tx = db): Promise<KeurRules> {
  const row = await tx.setting.findUnique({ where: { key: "keur_rules" } });
  const v = (row?.value ?? {}) as Partial<KeurRules>;
  const n = (x: unknown, d: number) => (typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : d);
  return { pointValueFcfa: Math.max(1, n(v.pointValueFcfa, DEFAULT_KEUR_RULES.pointValueFcfa)), perMission: n(v.perMission, DEFAULT_KEUR_RULES.perMission), perReview: n(v.perReview, DEFAULT_KEUR_RULES.perReview) };
}

export const REASON = { mission: "Mission terminée", review: "Avis laissé", used: "Utilisés pour la demande", refund: "Remboursement : mission annulée ou expirée" } as const;

// Crédit idempotent par (utilisateur, demande, motif) : un événement ne rapporte des points qu'une fois.
export async function awardPoints(tx: Tx, userId: string, points: number, reason: string, requestId: string) {
  if (points <= 0) return 0;
  const done = await tx.keurPointTransaction.findFirst({ where: { userId, requestId, reason } });
  if (done) return 0;
  await tx.keurPoints.upsert({ where: { userId }, update: { balance: { increment: points } }, create: { userId, balance: points } });
  await tx.keurPointTransaction.create({ data: { userId, delta: points, reason, requestId } });
  await notify(tx, userId, "keur.earned", `+${points} points Keur`, `${reason} : vous avez gagné ${points} points, utilisables sur vos frais de transport.`, { requestId });
  return points;
}

export async function awardCompletion(tx: Tx, clientId: string, requestId: string) {
  return awardPoints(tx, clientId, (await getKeurRules(tx)).perMission, REASON.mission, requestId);
}
export async function awardReview(tx: Tx, clientId: string, requestId: string) {
  return awardPoints(tx, clientId, (await getKeurRules(tx)).perReview, REASON.review, requestId);
}

// Débit atomique : échoue si le solde est insuffisant (la contrainte CHECK >= 0 protège en plus).
export async function spendPoints(tx: Tx, userId: string, points: number, requestId: string, reference: string): Promise<boolean> {
  if (points <= 0) return true;
  const res = await tx.keurPoints.updateMany({ where: { userId, balance: { gte: points } }, data: { balance: { decrement: points } } });
  if (res.count !== 1) return false;
  await tx.keurPointTransaction.create({ data: { userId, delta: -points, reason: `${REASON.used} ${reference}`, requestId } });
  return true;
}

// Remboursement unique des points utilisés par une demande annulée ou expirée.
export async function refundPoints(tx: Tx, userId: string, requestId: string, points: number) {
  if (points <= 0) return;
  const done = await tx.keurPointTransaction.findFirst({ where: { userId, requestId, reason: REASON.refund } });
  if (done) return;
  await tx.keurPoints.update({ where: { userId }, data: { balance: { increment: points } } });
  await tx.keurPointTransaction.create({ data: { userId, delta: points, reason: REASON.refund, requestId } });
}

// ── Portefeuille de démonstration (monnaie fictive) ──
export const DEMO_TOPUPS = [5000, 10000, 20000];
export const DEMO_MAX_BALANCE = 100_000;

export async function topUpDemo(userId: string, amountFcfa: number): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!DEMO_TOPUPS.includes(amountFcfa)) return { ok: false, error: "Montant de démonstration invalide." };
  const wallet = await db.wallet.findUnique({ where: { userId } });
  if (!wallet || !wallet.isDemo) return { ok: false, error: "Portefeuille introuvable." };
  if (wallet.balanceFcfa + amountFcfa > DEMO_MAX_BALANCE) return { ok: false, error: "Plafond du portefeuille de démonstration atteint." };
  await db.$transaction([
    db.wallet.update({ where: { id: wallet.id }, data: { balanceFcfa: { increment: amountFcfa } } }),
    db.walletTransaction.create({ data: { walletId: wallet.id, kind: "DEMO_TOPUP", amountFcfa, note: "Recharge de démonstration (monnaie fictive)" } }),
  ]);
  return { ok: true };
}
