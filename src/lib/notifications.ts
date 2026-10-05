import type { Prisma } from "@prisma/client";
import { db } from "./db";

type Tx = Prisma.TransactionClient | typeof db;

export async function notify(tx: Tx, userId: string, kind: string, title: string, body: string, data?: Prisma.InputJsonValue) {
  await tx.notification.create({ data: { userId, kind, title, body, data } });
}

export const unreadCount = (userId: string) => db.notification.count({ where: { userId, readAt: null } });

export const listNotifications = (userId: string) =>
  db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 });

// Un utilisateur ne peut marquer que SES notifications.
export async function markAllRead(userId: string) {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
