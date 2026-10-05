import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const db = new PrismaClient();
const stamp = Date.now().toString().slice(-7);

test.afterAll(async () => { await db.user.deleteMany({ where: { fullName: "Test Client PWA" } }); await db.$disconnect(); });

test("application installable : manifeste, icônes, service worker, repli hors connexion sans données privées", async ({ browser }) => {
  const ctx = await browser.newContext({ ...test.info().project.use });
  const page = await ctx.newPage();

  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: expect.stringContaining("Dalokeur"), display: "standalone", lang: "fr", theme_color: "#0f6b4d" });
  for (const icon of manifest.icons) {
    const res = await page.request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  }
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
  const sw = await page.request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toContain("no-cache");

  // Connexion d'un client, navigation sur des pages privées, puis installation du service worker
  await db.user.create({ data: { fullName: "Test Client PWA", phone: `+22175${stamp}`, passwordHash: await bcrypt.hash("MotDePasse123", 10), roles: { create: { role: "CLIENT" } } } });
  await page.goto("/connexion");
  await page.getByLabel("Téléphone").fill(`75${stamp}`);
  await page.getByLabel("Mot de passe").fill("MotDePasse123");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/client$/);
  await page.goto("/client/portefeuille");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // la page est maintenant contrôlée par le service worker
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // Rien de privé en cache : uniquement la page de repli, les icônes et les fichiers statiques
  const cached = await page.evaluate(async () => { const out: string[] = []; for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname); return out; });
  expect(cached.length).toBeGreaterThan(0);
  for (const p of cached) expect(p === "/offline" || p.startsWith("/icons/") || p.startsWith("/_next/static/"), p).toBe(true);

  // Hors connexion : page de repli claire, sans erreur brute du navigateur
  await ctx.setOffline(true);
  await page.goto("/client/commandes").catch(() => undefined);
  await expect(page.getByRole("heading", { name: "Vous êtes hors connexion" })).toBeVisible();
  await ctx.setOffline(false);
  await ctx.close();
});

// Mesure sur connexion lente (type 3G à Dakar) : ~400 kbit/s, 400 ms de latence, processeur 4× plus lent.
test("performance : chargement sur 3G lente", async ({ browser }) => {
  const ctx = await browser.newContext({ ...test.info().project.use });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (200 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  const measure = async (path: string) => {
    const t0 = Date.now();
    await page.goto(path, { waitUntil: "commit" });
    await page.locator("h1").first().waitFor({ timeout: 30_000 });
    const visible = Date.now() - t0; // contenu lisible (rendu côté serveur)
    await page.waitForLoadState("load");
    const loaded = Date.now() - t0; // tous les scripts et styles chargés
    const bytes = await page.evaluate(() => performance.getEntriesByType("resource").reduce((n, r) => n + ((r as PerformanceResourceTiming).transferSize || 0), 0) + ((performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).transferSize || 0));
    console.log(`3G lente — ${path} : contenu visible en ${visible} ms, chargement complet en ${loaded} ms, ${(bytes / 1024).toFixed(0)} Ko transférés`);
    return { visible, loaded, bytes };
  };
  const home = await measure("/");
  const login = await measure("/connexion");
  expect(home.visible).toBeLessThan(5_000);
  expect(home.loaded).toBeLessThan(15_000);
  expect(login.bytes).toBeLessThan(300 * 1024); // page de connexion légère
  await ctx.close();
});
