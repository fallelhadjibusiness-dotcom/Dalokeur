import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const db = new PrismaClient();
test.afterAll(async () => {
  await db.review.deleteMany({ where: { client: { fullName: { startsWith: "Test " } } } });
  await db.serviceRequest.deleteMany({ where: { client: { fullName: { startsWith: "Test " } } } });
  await db.user.deleteMany({ where: { fullName: { startsWith: "Test " } } });
  await db.$disconnect();
});

const stamp = Date.now().toString().slice(-7);
const phoneA = `77${stamp}`;
const phoneB = `78${stamp}`;
const PASSWORD = "MotDePasse123";

async function register(page: import("@playwright/test").Page, name: string, phone: string) {
  await page.goto("/inscription");
  await page.getByLabel("Nom complet").fill(name);
  await page.getByLabel("Téléphone").fill(phone);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/client$/);
}

test("parcours client mobile : inscription, demande, suivi, annulation, isolation", async ({ page, browser }) => {
  // pas de défilement horizontal sur mobile
  await register(page, "Test Awa Diop", phoneA);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByText("Prestataires recommandés")).toBeVisible();

  // recherche
  await page.getByLabel("Rechercher un service").fill("plomb");
  await page.getByRole("button", { name: "Chercher" }).click();
  await expect(page.getByText("Plomberie").first()).toBeVisible();

  // erreurs de formulaire
  await page.goto("/client/demande?service=plomberie&mode=URGENT");
  await page.getByRole("button", { name: "Confirmer ma demande" }).click();
  await expect(page.getByText(/Décrivez votre besoin/)).toBeVisible();
  await expect(page.getByText(/point de repère/i).first()).toBeVisible();
  await expect(page.getByText("Devis après diagnostic").first()).toBeVisible();

  // demande valide
  await page.getByLabel("3. Votre besoin").fill("Fuite d'eau sous l'évier de la cuisine");
  await page.getByLabel("Quartier").selectOption("Médina");
  await page.getByLabel("Adresse").fill("Rue 11 x 6, villa 12");
  await page.getByLabel("Point de repère").fill("porte bleue, près de la pharmacie");
  await page.getByRole("button", { name: "Confirmer ma demande" }).click();
  await expect(page).toHaveURL(/\/client\/commandes\/[0-9a-f-]{36}$/);
  const url = page.url();
  await expect(page.getByText("Nouvelle demande").first()).toBeVisible();
  await expect(page.getByText(/Nous recherchons un prestataire/)).toBeVisible();

  // un autre client ne peut pas ouvrir cette demande
  const ctxB = await browser.newContext({ ...test.info().project.use });
  const pageB = await ctxB.newPage();
  await register(pageB, "Test Mamadou Sarr", phoneB);
  const res = await pageB.goto(url);
  expect(res?.status()).toBe(404);
  await ctxB.close();

  // annulation avant acceptation, sans motif
  await page.getByText("Annuler la demande").click();
  await page.getByRole("button", { name: "Confirmer l'annulation" }).click();
  await expect(page.getByText("Demande annulée")).toBeVisible();
  await page.goto("/client/commandes");
  await expect(page.getByText("Annulée")).toBeVisible();

  // portefeuille : points Keur séparés du FCFA
  await page.goto("/client/portefeuille");
  await expect(page.getByText("Points Keur").first()).toBeVisible();
  await expect(page.getByText("Wave")).toBeVisible();
});

test("accès protégés sans connexion et par rôle", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/connexion/);
  await register(page, "Test Client Seul", `76${stamp}`);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/client$/);
  await page.goto("/prestataire");
  await expect(page).toHaveURL(/\/client$/);
});
