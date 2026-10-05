import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { existsSync } from "node:fs";
import { stepOf, totpAt } from "../../src/lib/totp";

if (existsSync(".env")) process.loadEnvFile(".env");
const db = new PrismaClient();
const stamp = Date.now().toString().slice(-7);
const PASSWORD = "MotDePasse123";
const PHONE = `70${stamp}`;

async function submitLogin(page: Page, totp?: string) {
  await page.goto("/connexion");
  await page.getByLabel("Téléphone").fill(PHONE);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  if (totp) { await page.getByText("Administrateur : code de vérification").click(); await page.getByLabel(/Code à 6 chiffres/).fill(totp); }
  await page.getByRole("button", { name: "Se connecter" }).click();
}

test.afterAll(async () => {
  await db.adminAction.deleteMany({ where: { admin: { fullName: "Test Admin 2FA" } } });
  await db.user.deleteMany({ where: { fullName: "Test Admin 2FA" } });
  await db.$disconnect();
});

test("2FA admin : activation, connexion avec code, refus sans code, code de secours", async ({ page, context }) => {
  await db.user.create({ data: { fullName: "Test Admin 2FA", phone: `+221${PHONE}`, passwordHash: await bcrypt.hash(PASSWORD, 10), roles: { create: { role: "ADMIN" } } } });

  // Connexion sans 2FA configurée, puis activation depuis /admin/securite
  await submitLogin(page);
  await page.waitForURL(/\/admin$/);
  await page.goto("/admin/securite");
  await page.getByRole("button", { name: "Activer la double authentification" }).click();
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await expect(page.getByAltText("QR code de double authentification")).toBeVisible();
  await page.getByLabel("Code à 6 chiffres").fill("000000");
  await page.getByRole("button", { name: "Confirmer et activer" }).click();
  await expect(page.getByText(/Code incorrect/)).toBeVisible();
  await page.getByLabel("Code à 6 chiffres").fill(totpAt(secret, stepOf(Date.now())));
  await page.getByRole("button", { name: "Confirmer et activer" }).click();
  await expect(page.getByText("Double authentification activée")).toBeVisible();
  const codes = await page.getByTestId("recovery-codes").locator("li").allTextContents();
  expect(codes).toHaveLength(8);

  // Déconnexion forcée : on repart d'un contexte propre
  await context.clearCookies();

  // Sans code → refus ; mauvais code → refus
  await submitLogin(page);
  await expect(page.getByText(/Identifiants incorrects/)).toBeVisible();
  await expect(page).toHaveURL(/\/connexion/);
  await submitLogin(page, "000000");
  await expect(page.getByText(/Identifiants incorrects/)).toBeVisible();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/connexion/);

  // Bon code (pas suivant, accepté une fois) → accès
  const next = totpAt(secret, stepOf(Date.now()) + 1);
  await submitLogin(page, next);
  await page.waitForURL(/\/admin$/);
  await context.clearCookies();
  await submitLogin(page, next); // rejeu du même code → refusé
  await expect(page.getByText(/Identifiants incorrects/)).toBeVisible();

  // Code de secours (usage unique)
  await submitLogin(page, codes[0]);
  await page.waitForURL(/\/admin$/);
  await context.clearCookies();
  await submitLogin(page, codes[0]);
  await expect(page.getByText(/Identifiants incorrects/)).toBeVisible();
});
