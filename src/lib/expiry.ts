// Expiration des demandes restées sans prestataire : annulation automatique + remboursement des points Keur.
import { db } from "./db";
import { refundPoints } from "./keur";
import { notify } from "./notifications";
import { endSharingTx } from "./tracking";

export async function expireStaleRequests(now = new Date(), clientId?: string) {
  const stale = await db.serviceRequest.findMany({
    where: { status: { in: ["NEW", "PENDING", "ASSIGNED"] }, expiresAt: { lt: now }, ...(clientId ? { clientId } : {}) },
    take: 100,
  });
  let expired = 0;
  for (const r of stale) {
    await db.$transaction(async (tx) => {
      const res = await tx.serviceRequest.updateMany({ where: { id: r.id, status: r.status }, data: { status: "CANCELLED", cancelReason: "Expirée : aucun prestataire disponible" } });
      if (res.count !== 1) return; // changé entre-temps
      await tx.assignment.updateMany({ where: { requestId: r.id, status: { in: ["OFFERED", "ACCEPTED"] } }, data: { status: "EXPIRED", respondedAt: now } });
      await tx.requestStatusHistory.create({ data: { requestId: r.id, fromStatus: r.status, toStatus: "CANCELLED", note: "Expirée : aucun prestataire disponible" } });
      await endSharingTx(tx, r.id);
      await refundPoints(tx, r.clientId, r.id, r.keurPointsUsed);
      await notify(tx, r.clientId, "request.expired", "Demande expirée", `Aucun prestataire n'était disponible pour ${r.reference}.${r.keurPointsUsed ? " Vos points Keur ont été remboursés." : ""}`, { requestId: r.id });
      expired++;
    });
  }
  return { expired };
}
