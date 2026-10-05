import { db } from "./db";

// Limiteur partagé en base : fonctionne avec plusieurs instances serverless.
// Une seule requête SQL atomique par appel (upsert avec fenêtre glissante par clé).
export async function checkRateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limits ("key", "count", "reset_at")
    VALUES (${key}, 1, now() + (${windowMs} * interval '1 millisecond'))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN rate_limits."reset_at" < now() THEN 1 ELSE rate_limits."count" + 1 END,
      "reset_at" = CASE WHEN rate_limits."reset_at" < now() THEN now() + (${windowMs} * interval '1 millisecond') ELSE rate_limits."reset_at" END
    RETURNING "count"`;
  return (rows[0]?.count ?? 1) <= max;
}

export async function purgeRateLimits() {
  return (await db.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } })).count;
}
