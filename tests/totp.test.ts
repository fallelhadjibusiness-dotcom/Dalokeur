import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, decryptSecret, encryptSecret, generateRecoveryCodes, generateSecret, stepOf, totpAt, verifyTotp } from "@/lib/totp";

process.env.AUTH_SECRET ||= "test-secret";
// RFC 6238 (SHA-1) : secret ASCII "12345678901234567890", codes 6 chiffres = 6 derniers chiffres des valeurs 8 chiffres de l'annexe B.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("vecteurs de test RFC 6238", () => {
    const at = (t: number) => totpAt(RFC_SECRET, stepOf(t * 1000));
    expect(at(59)).toBe("287082");
    expect(at(1111111109)).toBe("081804");
    expect(at(1111111111)).toBe("050471");
    expect(at(1234567890)).toBe("005924");
    expect(at(2000000000)).toBe("279037");
  });
  it("base32 aller-retour", () => {
    const b = Buffer.from([1, 2, 3, 250, 251, 252, 0, 99]);
    expect(base32Decode(base32Encode(b)).equals(b)).toBe(true);
    expect(() => base32Decode("1!?")).toThrow();
  });
  it("tolérance ±1 pas, rejeu refusé, code invalide refusé", () => {
    const s = generateSecret(); const now = Date.now(); const step = stepOf(now);
    expect(verifyTotp(s, totpAt(s, step), null, now)).toBe(step);
    expect(verifyTotp(s, totpAt(s, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(s, totpAt(s, step - 2), null, now)).toBeNull(); // trop ancien
    expect(verifyTotp(s, totpAt(s, step), step, now)).toBeNull(); // déjà utilisé
    expect(verifyTotp(s, totpAt(s, step + 1), step, now)).toBe(step + 1);
    for (const bad of ["", "12345", "abcdef", "1234567"]) expect(verifyTotp(s, bad, null, now)).toBeNull();
  });
  it("chiffrement : aller-retour, aléatoire, falsification détectée", () => {
    const s = generateSecret();
    const a = encryptSecret(s), b = encryptSecret(s);
    expect(a).not.toBe(b);
    expect(a).not.toContain(s);
    expect(decryptSecret(a)).toBe(s);
    const [iv, tag, enc] = a.split(".");
    expect(() => decryptSecret([iv, tag, Buffer.from("x" + Buffer.from(enc, "base64").toString("latin1")).toString("base64")].join("."))).toThrow();
  });
  it("codes de secours : 8 codes uniques bien formés", () => {
    const c = generateRecoveryCodes();
    expect(new Set(c).size).toBe(8);
    for (const x of c) expect(x).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
  });
});
