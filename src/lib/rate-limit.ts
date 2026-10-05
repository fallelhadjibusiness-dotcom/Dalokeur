// Limiteur simple en mémoire (par instance). À remplacer par Upstash/Redis en production multi-instances.
const hits = new Map<string, { count: number; reset: number }>();

export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= max;
}
