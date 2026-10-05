const isDev = process.env.NODE_ENV !== "production";

// Origines autorisées pour la carte : fournisseur de tuiles configuré + OSM (repli de développement)
// + origines supplémentaires facultatives (sprites, glyphes…) via MAP_CSP_ORIGINS.
function mapOrigins() {
  const out = new Set(["https://tile.openstreetmap.org", "https://*.tile.openstreetmap.org"]);
  try { if (process.env.NEXT_PUBLIC_MAP_STYLE_URL) out.add(new URL(process.env.NEXT_PUBLIC_MAP_STYLE_URL).origin); } catch {}
  for (const o of (process.env.MAP_CSP_ORIGINS ?? "").split(/\s+/).filter(Boolean)) out.add(o);
  return [...out].join(" ");
}

const csp = [
  "default-src 'self'",
  // Next.js injecte de petits scripts inline : sans nonce, 'unsafe-inline' est nécessaire. Les origines restent restreintes.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${mapOrigins()}`,
  "font-src 'self' data:",
  `connect-src 'self' ${mapOrigins()}${isDev ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "child-src blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Géolocalisation autorisée uniquement pour notre propre origine (et sur geste utilisateur côté code).
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
