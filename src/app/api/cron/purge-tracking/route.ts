import { NextResponse } from "next/server";
import { purgeTrackingData } from "@/lib/tracking";
import { expireStaleRequests } from "@/lib/expiry";
import { purgeOrphanUploads } from "@/lib/files";
import { purgeRateLimits } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Tâche planifiée (Vercel Cron) : conservation minimale des trajets. Protégée par CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return NextResponse.json({ ...(await purgeTrackingData()), ...(await expireStaleRequests()), ...(await purgeOrphanUploads()), rateLimitsPurged: await purgeRateLimits() });
}
