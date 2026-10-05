// Les requêtes qui modifient des données doivent venir de notre propre site (défense CSRF en plus des cookies SameSite).
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const forwarded = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return o.host === forwarded;
  } catch { return false; }
}
