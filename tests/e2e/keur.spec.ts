import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const db = new PrismaClient();
const stamp = Date.now().toString().slice(-7);

test.afterAll(async () => {
  await db.notification.deleteMany({ where: { user: { fullName: { startsWith: "Test " } } } });
  await db.serviceRequest.deleteMany({ where: { client: { fullName: { startsWith: "Test " } } } });
  await db.user.deleteMany({ where: { fullName: { startsWith: "Test " } } });
  await db.$disconnect();
});

test("points Keur et portefeuille démo : sans bonus, réduction du transport, remboursement, gains", async ({ page }) => {
  // Inscription : aucun bonus, ni points ni argent
  await page.goto("/inscription");
  await page.getByLabel("Nom complet").fill("Test Client Keur");
  await page.getByLabel("Téléphone").fill(`77${stamp}`);
  await page.getByLabel("Mot de passe").fill("MotDePasse123");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/client$/);
  await page.goto("/client/portefeuille");
  await expect(page.getByText("0 pts")).toBeVisible();
  await expect(page.getByText("Solde en FCFA", { exact: true })).toBeVisible();
  await expect(page.getByText(/pas convertibles en argent/)).toBeVisible();
  await expect(page.getByText("0 FCFA").first()).toBeVisible();
  // Aucun bouton de conversion des points
  await expect(page.getByRole("button", { name: /convertir|retirer|échanger/i })).toHaveCount(0);

  // Recharge de démonstration (monnaie fictive), distincte des points
  await page.getByRole("button", { name: /\+ 5 000 FCFA/ }).click();
  await expect(page.getByText("Recharge de démonstration").first()).toBeVisible();
  const user = await db.user.findFirstOrThrow({ where: { phone: `+22177${stamp}` } });
  expect((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balanceFcfa).toBe(5000);
  expect((await db.keurPoints.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(0);

  // Dépannage : option points désactivée sans solde, puis avec 120 points
  await page.goto("/client/demande?service=plomberie&mode=URGENT");
  await expect(page.getByLabel(/Utiliser mes points Keur/)).toBeDisabled();
  await db.keurPoints.update({ where: { userId: user.id }, data: { balance: 120 } });
  await page.goto("/client/demande?service=plomberie&mode=URGENT");
  const box = page.getByLabel(/Utiliser mes points Keur/);
  await expect(box).toBeEnabled();
  await expect(page.getByText(/jusqu'à 1 200 FCFA de réduction/)).toBeVisible();
  await box.check();
  await expect(page.getByText(/2 000 FCFA → .*800 FCFA/)).toBeVisible();
  await page.getByLabel("3. Votre besoin").fill("Fuite d'eau sous le lavabo de la salle de bain");
  await page.getByLabel("Quartier").selectOption("Médina");
  await page.getByLabel("Adresse").fill("Rue 11 x 6");
  await page.getByLabel("Point de repère").fill("porte bleue");
  await page.getByRole("button", { name: "Confirmer ma demande" }).click();
  await expect(page).toHaveURL(/\/client\/commandes\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  await expect(page.getByText(/Points Keur \(120 pts\)/)).toBeVisible();
  await expect(page.getByText("− 1 200 FCFA")).toBeVisible();
  await expect(page.getByText("Déplacement à régler")).toBeVisible();
  expect((await db.keurPoints.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(0);

  // Annulation : points remboursés, FCFA inchangé
  await page.getByText("Annuler la demande").click();
  await page.getByRole("button", { name: "Confirmer l'annulation" }).click();
  await expect(page.getByText("Demande annulée")).toBeVisible();
  await page.goto("/client/portefeuille");
  await expect(page.getByText("120 pts").first()).toBeVisible();
  await expect(page.getByText(/Remboursement/).first()).toBeVisible();
  expect((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balanceFcfa).toBe(5000);

  // Fin de mission : +10 points
  const svc = await db.service.findUniqueOrThrow({ where: { slug: "plomberie" } });
  const prov = await db.user.create({ data: { fullName: "Test Prestataire Keur", phone: `+22178${stamp}`, passwordHash: "x", roles: { create: { role: "PROVIDER" } } } });
  await db.providerProfile.create({ data: { userId: prov.id, jobTitle: "Plombier", zones: ["Dakar"], status: "VERIFIED", services: { create: { serviceId: svc.id } } } });
  const { createRequest } = await import("../../src/lib/requests");
  const { acceptMission, advanceMission } = await import("../../src/lib/missions");
  const r = await createRequest(user.id, { serviceSlug: "plomberie", mode: "URGENT", description: "Prise électrique qui chauffe", district: "Fann", addressLine: "Rue 5", landmark: "porte bleue" });
  if (!r.ok) throw new Error("request");
  await acceptMission(prov.id, r.id);
  for (const s of ["EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"] as const) await advanceMission(prov.id, r.id, s);
  await page.goto("/client/portefeuille");
  await expect(page.getByText("130 pts").first()).toBeVisible();
  await expect(page.getByText(/Mission terminée/).first()).toBeVisible();
  await page.goto("/client/notifications");
  await expect(page.getByText("+10 points Keur")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  void id;
});
