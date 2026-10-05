import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const db = new PrismaClient();
const stamp = Date.now().toString().slice(-7);
const PASSWORD = "MotDePasse123";
const FANN = { latitude: 14.6935, longitude: -17.4655, accuracy: 15 };

// Simule le refus de l'utilisateur dans la boîte de permission du navigateur.
const denyGeolocation = () => {
  navigator.geolocation.getCurrentPosition = (_ok, err) => {
    err?.({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "User denied Geolocation" } as GeolocationPositionError);
  };
};

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

test("géolocalisation : GPS sur demande, permission refusée, partage avec consentement, arrêt", async ({ browser }) => {
  test.setTimeout(150_000);
  const hash = await bcrypt.hash(PASSWORD, 10);
  const svc = await db.service.findUniqueOrThrow({ where: { slug: "plomberie" } });
  const client = await db.user.create({ data: { fullName: "Test Client GPS", phone: `+22175${stamp}`, passwordHash: hash, roles: { create: { role: "CLIENT" } } } });
  const prov = await db.user.create({ data: { fullName: "Test Prestataire GPS", phone: `+22176${stamp}`, passwordHash: hash, roles: { create: { role: "PROVIDER" } } } });
  await db.providerProfile.create({ data: { userId: prov.id, jobTitle: "Plombier", zones: ["Dakar"], status: "VERIFIED", services: { create: { serviceId: svc.id } } } });
  const use = test.info().project.use;

  // ── Client A : GPS accordé → quartier suggéré, précision affichée, coordonnées enregistrées
  const gps = await browser.newContext({ ...use, permissions: ["geolocation"], geolocation: FANN });
  const cp = await gps.newPage();
  await login(cp, `75${stamp}`);
  await cp.goto("/client/demande?service=plomberie&mode=URGENT");
  expect(await cp.evaluate(() => (window as unknown as { __gpsAsked?: boolean }).__gpsAsked)).toBeUndefined();
  await cp.getByRole("button", { name: /Utiliser ma position/ }).click();
  await expect(cp.getByText(/Précision ±15 m/)).toBeVisible();
  await expect(cp.getByLabel("Quartier")).toHaveValue("Fann"); // suggestion
  await cp.getByLabel("3. Votre besoin").fill("Fuite d'eau sous le lavabo de la salle de bain");
  await cp.getByLabel("Adresse").fill("Rue 5 x 10, villa 3");
  await cp.getByLabel("Point de repère").fill("porte bleue près de la pharmacie");
  await cp.getByRole("button", { name: "Confirmer ma demande" }).click();
  await expect(cp).toHaveURL(/\/client\/commandes\/[0-9a-f-]{36}$/);
  const requestId = cp.url().split("/").pop()!;
  const loc = (await db.serviceRequest.findUniqueOrThrow({ where: { id: requestId }, include: { location: true } })).location;
  expect(loc.source).toBe("GPS");
  expect(loc.lat).toBeCloseTo(FANN.latitude, 4);
  expect(loc.approxLat).not.toBe(loc.lat);

  // ── Client B : permission refusée → message clair, saisie manuelle possible
  const denied = await browser.newContext({ ...use });
  await denied.addInitScript(denyGeolocation);
  const dp = await denied.newPage();
  await login(dp, `75${stamp}`);
  await dp.goto("/client/demande?service=plomberie&mode=URGENT");
  await dp.getByRole("button", { name: /Utiliser ma position/ }).click();
  await expect(dp.getByText(/Autorisation de localisation refusée/)).toBeVisible();
  await dp.getByLabel("3. Votre besoin").fill("Prise électrique qui chauffe dans le salon");
  await dp.getByLabel("Quartier").selectOption("Médina");
  await dp.getByLabel("Adresse").fill("Rue 11 x 6");
  await dp.getByLabel("Point de repère").fill("derrière la mosquée");
  await dp.getByRole("button", { name: "Confirmer ma demande" }).click();
  await expect(dp).toHaveURL(/\/client\/commandes\/[0-9a-f-]{36}$/);
  const manualId = dp.url().split("/").pop()!;
  expect((await db.serviceRequest.findUniqueOrThrow({ where: { id: manualId }, include: { location: true } })).location.source).toBe("MANUAL");
  await denied.close();

  // ── Prestataire : aperçu approximatif, puis acceptation
  const pgood = await browser.newContext({ ...use, permissions: ["geolocation"], geolocation: { latitude: 14.7, longitude: -17.45, accuracy: 10 } });
  const pp = await pgood.newPage();
  await login(pp, `76${stamp}`);
  await pp.goto(`/prestataire/missions/${requestId}`);
  await expect(pp.getByText("Zone approximative")).toBeVisible();
  const html = await pp.content();
  expect(html).not.toContain(String(FANN.latitude));
  expect(html).not.toContain("Rue 5 x 10");
  await pp.getByRole("button", { name: /Accepter la mission/ }).click();
  await expect(pp.getByText("Rue 5 x 10, villa 3")).toBeVisible();
  await expect(pp.getByText(/Ouvrir l'itinéraire/)).toBeVisible();

  // ── Consentement explicite : bouton inactif tant que la case n'est pas cochée
  const start = pp.getByRole("button", { name: "Commencer le trajet" });
  await expect(pp.getByText(/uniquement par le client de cette mission/)).toBeVisible();
  await expect(start).toBeDisabled();

  // Prestataire sans permission GPS : refus géré, aucun partage créé
  const pdenied = await browser.newContext({ ...use });
  await pdenied.addInitScript(denyGeolocation);
  const pd = await pdenied.newPage();
  await login(pd, `76${stamp}`);
  await pd.goto(`/prestataire/missions/${requestId}`);
  await pd.getByLabel(/J'accepte de partager ma position/).check();
  await pd.getByRole("button", { name: "Commencer le trajet" }).click();
  await expect(pd.getByText(/Autorisation de localisation refusée/)).toBeVisible();
  expect(await db.liveLocationUpdate.count({ where: { assignment: { requestId } } })).toBe(0);
  expect((await db.serviceRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("ACCEPTED");
  await pdenied.close();

  // ── Avec permission : consentement → trajet démarré
  await pp.getByLabel(/J'accepte de partager ma position/).check();
  await expect(start).toBeEnabled();
  await start.click();
  await expect(pp.getByText("Partage de position actif")).toBeVisible();
  await expect(pp.getByRole("button", { name: /Arrêter le partage de ma position/ })).toBeVisible();
  const first = await db.liveLocationUpdate.findFirstOrThrow({ where: { assignment: { requestId } } });
  expect(first.consentAt).toBeTruthy();
  expect((await db.serviceRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("EN_ROUTE");

  // ── Le client voit la position, l'heure de mise à jour et le statut
  await cp.goto(`/client/commandes/${requestId}`);
  await expect(cp.getByTestId("live-updated")).toContainText("à");
  await expect(cp.getByText("En route").first()).toBeVisible();

  // Nouvelle position envoyée ~15 s plus tard
  await pgood.setGeolocation({ latitude: 14.697, longitude: -17.463, accuracy: 8 });
  await expect.poll(() => db.liveLocationUpdate.count({ where: { assignment: { requestId } } }), { timeout: 40_000, intervals: [2000] }).toBeGreaterThanOrEqual(2);
  expect(await cp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // ── Arrêt manuel : le client n'a plus de position
  await pp.getByRole("button", { name: /Arrêter le partage de ma position/ }).click();
  await expect(pp.getByText("Partage de position arrêté")).toBeVisible();
  expect(await db.liveLocationUpdate.count({ where: { assignment: { requestId }, sharingActive: true } })).toBe(0);
  await expect(cp.getByText("Le suivi en direct est terminé")).toBeVisible({ timeout: 20_000 });

  await gps.close(); await pgood.close();
});
