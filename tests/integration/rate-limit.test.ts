import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { checkRateLimit, purgeRateLimits } from "@/lib/rate-limit";
import { passwordProblem } from "@/lib/validation";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const K = `test-rl-${Date.now()}`;

suite("limiteur de tentatives partagé", () => {
  afterAll(async () => { await db.rateLimit.deleteMany({ where: { key: { startsWith: K } } }); await db.$disconnect(); });

  it("bloque après le seuil, par clé", async () => {
    const r = [];
    for (let i = 0; i < 7; i++) r.push(await checkRateLimit(`${K}-a`, 5, 60_000));
    expect(r).toEqual([true, true, true, true, true, false, false]);
    expect(await checkRateLimit(`${K}-b`, 5, 60_000)).toBe(true); // autre clé indépendante
  });

  it("atomique sous concurrence : exactement `max` passages", async () => {
    const res = await Promise.all(Array.from({ length: 30 }, () => checkRateLimit(`${K}-c`, 10, 60_000)));
    expect(res.filter(Boolean)).toHaveLength(10);
  });

  it("la fenêtre expire puis repart de zéro ; purge des entrées expirées", async () => {
    await checkRateLimit(`${K}-d`, 1, 60_000);
    expect(await checkRateLimit(`${K}-d`, 1, 60_000)).toBe(false);
    await db.rateLimit.update({ where: { key: `${K}-d` }, data: { resetAt: new Date(Date.now() - 1000) } });
    expect(await purgeRateLimits()).toBeGreaterThanOrEqual(1);
    expect(await checkRateLimit(`${K}-d`, 1, 60_000)).toBe(true);
  });
});

describe("politique de mot de passe", () => {
  it("refuse les mots de passe triviaux", () => {
    for (const bad of ["12345678", "password", "aaaaaaaa", "azertyuiop", "abcdefgh", "12345678901"]) expect(passwordProblem(bad, "+221771234567"), bad).not.toBeNull();
    expect(passwordProblem("771234567", "+221771234567")).not.toBeNull(); // = téléphone
  });
  it("accepte un mot de passe raisonnable", () => {
    expect(passwordProblem("MotDePasse123", "+221771234567")).toBeNull();
    expect(passwordProblem("Dakar2026!", null)).toBeNull();
  });
});
