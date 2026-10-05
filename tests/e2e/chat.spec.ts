import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const db = new PrismaClient();
const stamp = Date.now().toString().slice(-7);
const PASSWORD = "MotDePasse123";

async function login(page: Page, p: string) {
  await page.goto("/connexion");
  await page.getByLabel("Téléphone").fill(p);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/(client|prestataire|admin)$/);
}

test.afterAll(async () => {
  await db.notification.deleteMany({ where: { user: { fullName: { startsWith: "Test " } } } });
  await db.serviceRequest.deleteMany({ where: { client: { fullName: { startsWith: "Test " } } } });
  await db.user.deleteMany({ where: { fullName: { startsWith: "Test " } } });
  await db.$disconnect();
});

test("messagerie : échange en quasi temps réel, accusé de lecture, notifications, hors connexion", async ({ browser }) => {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const svc = await db.service.findUniqueOrThrow({ where: { slug: "plomberie" } });
  const client = await db.user.create({ data: { fullName: "Test Client Chat", phone: `+22175${stamp}`, passwordHash: hash, roles: { create: { role: "CLIENT" } } } });
  const prov = await db.user.create({ data: { fullName: "Test Prestataire Chat", phone: `+22176${stamp}`, passwordHash: hash, roles: { create: { role: "PROVIDER" } } } });
  await db.providerProfile.create({ data: { userId: prov.id, jobTitle: "Plombier", zones: ["Dakar"], status: "VERIFIED", services: { create: { serviceId: svc.id } } } });
  const { createRequest } = await import("../../src/lib/requests");
  const { acceptMission } = await import("../../src/lib/missions");
  const req = await createRequest(client.id, { serviceSlug: "plomberie", mode: "URGENT", description: "Fuite sous l'évier de la cuisine", district: "Fann", addressLine: "Rue 5", landmark: "près de la pharmacie" });
  if (!req.ok) throw new Error("request");

  const cctx = await browser.newContext({ ...test.info().project.use });
  const pctx = await browser.newContext({ ...test.info().project.use });
  const cp = await cctx.newPage(), pp = await pctx.newPage();
  await login(cp, `75${stamp}`);
  await login(pp, `76${stamp}`);

  // Avant acceptation : message d'attente, pas de zone de saisie
  await cp.goto(`/client/commandes/${req.id}`);
  await expect(cp.getByText(/La messagerie s'ouvre dès qu'un prestataire accepte/)).toBeVisible();
  expect((await pp.request.get(`/api/requests/${req.id}/messages`)).status()).toBe(404);

  await acceptMission(prov.id, req.id);

  // Le client écrit, le prestataire reçoit par polling sans recharger
  await cp.goto(`/client/commandes/${req.id}`);
  await pp.goto(`/prestataire/missions/${req.id}`);
  await cp.getByLabel("Votre message").fill("Bonjour, vous arrivez quand ?");
  await cp.getByRole("button", { name: "Envoyer" }).click();
  await expect(cp.getByText("Bonjour, vous arrivez quand ?")).toBeVisible();
  await expect(pp.getByText("Bonjour, vous arrivez quand ?")).toBeVisible({ timeout: 15_000 });

  // Réponse + accusé de lecture côté client
  await pp.getByLabel("Votre message").fill("Dans 20 minutes, devant la porte bleue");
  await pp.getByRole("button", { name: "Envoyer" }).click();
  await expect(cp.getByText("Dans 20 minutes, devant la porte bleue")).toBeVisible({ timeout: 15_000 });
  await expect(cp.getByText(/· Lu/).first()).toBeVisible({ timeout: 15_000 });

  // Notifications : cloche et liste
  await cp.goto("/client");
  await expect(cp.getByRole("link", { name: /Notifications, \d+ non lue/ })).toBeVisible();
  await cp.goto("/client/notifications");
  await expect(cp.getByText("Demande acceptée")).toBeVisible();
  await cp.getByRole("button", { name: "Tout marquer comme lu" }).click();
  await expect(cp.getByRole("link", { name: "Notifications", exact: true })).toBeVisible();

  // Liste des conversations côté prestataire
  await pp.goto("/prestataire/messages");
  await expect(pp.getByText("Plomberie")).toBeVisible();

  // Hors connexion : bannière, puis retour du réseau
  await cp.goto(`/client/commandes/${req.id}`);
  await cctx.setOffline(true);
  await expect(cp.getByText(/Hors connexion/)).toBeVisible({ timeout: 15_000 });
  await cctx.setOffline(false);
  await expect(cp.getByText(/Hors connexion/)).toHaveCount(0, { timeout: 15_000 });

  // Pas de défilement horizontal
  expect(await cp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await cctx.close(); await pctx.close();
});
