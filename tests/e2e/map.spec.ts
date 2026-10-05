import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const db = new PrismaClient();
const stamp = Date.now().toString().slice(-7);

test.afterAll(async () => { await db.user.deleteMany({ where: { phone: `+22175${stamp}` } }); await db.$disconnect(); });

// La carte doit soit s'afficher, soit se replier proprement : jamais bloquer la saisie de l'adresse.
test("carte : chargement paresseux et repli sans blocage", async ({ page }) => {
  await db.user.create({ data: { fullName: "Test Client Carte", phone: `+22175${stamp}`, passwordHash: await bcrypt.hash("MotDePasse123", 10), roles: { create: { role: "CLIENT" } } } });
  await page.goto("/connexion");
  await page.getByLabel("Téléphone").fill(`75${stamp}`);
  await page.getByLabel("Mot de passe").fill("MotDePasse123");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/client$/);
  await page.goto("/client/demande?service=plomberie");
  await expect(page.locator("[data-map-state]")).toHaveCount(0); // aucune carte (ni GPS) tant que le client ne la demande pas
  await page.getByRole("button", { name: /Placer l'épingle sur la carte/ }).click();
  const map = page.locator("[data-map-state]");
  await expect(map).toHaveCount(1);
  await expect(map).toHaveAttribute("data-map-state", /ready|failed|loading/);
  const state = await map.getAttribute("data-map-state");
  console.log("état de la carte dans ce navigateur de test :", state);
  await page.getByLabel("Adresse").fill("Rue 1"); // la saisie reste possible quel que soit l'état de la carte
  await expect(page.getByLabel("Adresse")).toHaveValue("Rue 1");
});
