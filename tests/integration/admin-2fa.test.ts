import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { beginSetup, confirmSetup, disableTwoFactor, twoFactorStatus, verifySecondFactor } from "@/lib/admin-2fa";
import { decryptSecret, stepOf, totpAt } from "@/lib/totp";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const TAG = `f${Date.now()}`;

suite("double authentification admin (base réelle)", () => {
  let admin: string, client: string, secret: string, codes: string[];
  const NOW = Date.now();
  const code = (offset = 0) => totpAt(secret, stepOf(NOW) + offset);

  beforeAll(async () => {
    admin = (await db.user.create({ data: { phone: `test-${TAG}-a`, fullName: "Test admin2fa", passwordHash: "x", roles: { create: { role: "ADMIN" } } } })).id;
    client = (await db.user.create({ data: { phone: `test-${TAG}-c`, fullName: "Test client2fa", passwordHash: "x", roles: { create: { role: "CLIENT" } } } })).id;
  });
  afterAll(async () => {
    await db.adminAction.deleteMany({ where: { adminId: admin } });
    await db.rateLimit.deleteMany({ where: { key: { contains: admin } } });
    await db.user.deleteMany({ where: { id: { in: [admin, client] } } });
    await db.$disconnect();
  });

  it("seul un admin peut configurer ; le secret est chiffré en base", async () => {
    await expect(beginSetup(client)).rejects.toThrow("FORBIDDEN");
    const r = await beginSetup(admin);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    secret = r.secret;
    expect(r.uri).toContain("otpauth://totp/Dalokeur");
    const row = await db.user.findUniqueOrThrow({ where: { id: admin } });
    expect(row.totpSecretEnc).not.toContain(secret);
    expect(decryptSecret(row.totpSecretEnc!)).toBe(secret);
    expect(row.totpEnabledAt).toBeNull(); // pas actif tant que non confirmé
    expect(await verifySecondFactor(admin, code(), NOW)).toBe(false); // inactif : aucun code accepté
  });

  it("activation : mauvais code refusé, bon code accepté, codes de secours remis", async () => {
    expect((await confirmSetup(admin, "000000", NOW)).ok).toBe(false);
    const r = await confirmSetup(admin, code(), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    codes = r.recoveryCodes;
    expect(codes).toHaveLength(8);
    const st = await twoFactorStatus(admin);
    expect(st).toMatchObject({ enabled: true, recoveryLeft: 8 });
    const stored = JSON.stringify((await db.user.findUniqueOrThrow({ where: { id: admin } })).totpRecovery);
    for (const c of codes) expect(stored).not.toContain(c); // seules des empreintes sont stockées
    expect((await beginSetup(admin)).ok).toBe(false); // déjà active
  });

  it("connexion : code valide une fois (anti-rejeu), mauvais code refusé", async () => {
    expect(await verifySecondFactor(admin, code(1), NOW)).toBe(true);
    expect(await verifySecondFactor(admin, code(1), NOW)).toBe(false); // rejeu
    expect(await verifySecondFactor(admin, code(0), NOW)).toBe(false); // pas plus ancien que le dernier accepté
    expect(await verifySecondFactor(admin, "123456", NOW)).toBe(false);
    expect(await verifySecondFactor(admin, "", NOW)).toBe(false);
    expect(await verifySecondFactor(client, code(2), NOW)).toBe(false); // compte sans 2FA
  });

  it("codes de secours : usage unique", async () => {
    expect(await verifySecondFactor(admin, codes[0], NOW)).toBe(true);
    expect(await verifySecondFactor(admin, codes[0], NOW)).toBe(false);
    expect((await twoFactorStatus(admin)).recoveryLeft).toBe(7);
    expect(await verifySecondFactor(admin, codes[1].toUpperCase(), NOW)).toBe(true); // insensible à la casse
  });

  it("limite de tentatives : blocage après 8 essais", async () => {
    await db.rateLimit.deleteMany({ where: { key: { contains: admin } } });
    const res = [];
    for (let i = 0; i < 10; i++) res.push(await verifySecondFactor(admin, "000000", NOW));
    expect(res.every((x) => x === false)).toBe(true);
    expect(await verifySecondFactor(admin, codes[2], NOW)).toBe(false); // même un bon code est bloqué pendant la fenêtre
    await db.rateLimit.deleteMany({ where: { key: { contains: admin } } });
    expect(await verifySecondFactor(admin, codes[2], NOW)).toBe(true);
  });

  it("désactivation : exige un code courant ; impossible si 2FA obligatoire", async () => {
    expect((await disableTwoFactor(admin, "000000", NOW + 120_000)).ok).toBe(false);
    process.env.REQUIRE_ADMIN_2FA = "true";
    expect((await disableTwoFactor(admin, totpAt(secret, stepOf(NOW + 120_000)), NOW + 120_000)).ok).toBe(false);
    delete process.env.REQUIRE_ADMIN_2FA;
    expect((await disableTwoFactor(admin, totpAt(secret, stepOf(NOW + 120_000)), NOW + 120_000)).ok).toBe(true);
    const row = await db.user.findUniqueOrThrow({ where: { id: admin } });
    expect(row).toMatchObject({ totpSecretEnc: null, totpEnabledAt: null });
    expect(await verifySecondFactor(admin, codes[3], NOW)).toBe(false);
    expect(await db.adminAction.count({ where: { adminId: admin, action: { in: ["admin.2fa.enable", "admin.2fa.disable"] } } })).toBe(2);
  });
});
