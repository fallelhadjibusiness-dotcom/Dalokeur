// TOTP (RFC 6238) sans dépendance : HMAC-SHA1, 6 chiffres, pas de 30 s. Secret chiffré au repos (AES-256-GCM).
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch); if (i < 0) throw new Error("base32 invalide");
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const generateSecret = () => base32Encode(randomBytes(20));
export const stepOf = (ms: number) => Math.floor(ms / 1000 / 30);

export function totpAt(secretB32: string, step: number, digits = 6): string {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secretB32)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}
export const totpNow = (secretB32: string, now = Date.now()) => totpAt(secretB32, stepOf(now));

// Vérifie le code avec une tolérance de ±1 pas ; renvoie le pas accepté ou null. `lastStep` empêche tout rejeu.
export function verifyTotp(secretB32: string, code: string, lastStep: number | null, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code.trim())) return null;
  const cur = stepOf(now);
  for (const step of [cur, cur - 1, cur + 1]) {
    if (lastStep != null && step <= lastStep) continue;
    if (timingSafe(totpAt(secretB32, step), code.trim())) return step;
  }
  return null;
}
function timingSafe(a: string, b: string) { let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; }

function key(): Buffer {
  const base = process.env.TOTP_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!base) throw new Error("AUTH_SECRET ou TOTP_ENCRYPTION_KEY requis pour chiffrer les secrets 2FA");
  return Buffer.from(hkdfSync("sha256", base, "dalokeur-totp", "secret-encryption", 32));
}
export function encryptSecret(secretB32: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(secretB32, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function decryptSecret(blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export function otpauthUri(secretB32: string, account: string) {
  return `otpauth://totp/Dalokeur:${encodeURIComponent(account)}?secret=${secretB32}&issuer=Dalokeur&algorithm=SHA1&digits=6&period=30`;
}

// Codes de secours : lisibles, sans caractères ambigus.
export function generateRecoveryCodes(n = 8): string[] {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: n }, () => { const r = randomBytes(8); const c = [...r].map((b) => alphabet[b % alphabet.length]).join(""); return `${c.slice(0, 4)}-${c.slice(4)}`; });
}
