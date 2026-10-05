import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const db = new PrismaClient();
const stamp = Date.now().toString().slice(-7);
const PASSWORD = "MotDePasse123";
const phone = (prefix: string) => `${prefix}${stamp}`;

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
  await db.adminAction.deleteMany({ where: { admin: { fullName: { startsWith: "Test " } } } });
  await db.user.deleteMany({ where: { fullName: { startsWith: "Test " } } });
  await db.$disconnect();
});

test("administration : validation, refus avec motif, affectation, droits", async ({ page, browser }) => {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const mk = (name: string, p: string, role: "ADMIN" | "CLIENT" | "PROVIDER") => db.user.create({ data: { fullName: name, phone: `+221${p}`, passwordHash: hash, roles: { create: { role } } } });
  const svc = await db.service.findUniqueOrThrow({ where: { slug: "plomberie" } });
  await mk("Test Admin E2E", phone("70"), "ADMIN");
  const client = await mk("Test Client Admin", phone("75"), "CLIENT");
  for (const [name, p] of [["Test Prestataire Un", "76"], ["Test Prestataire Deux", "78"]] as const) {
    const u = await mk(name, phone(p), "PROVIDER");
    await db.providerProfile.create({ data: { userId: u.id, jobTitle: "Plombier", zones: ["Dakar"], services: { create: { serviceId: svc.id } } } });
  }
  const { createRequest } = await import("../../src/lib/requests");
  const req = await createRequest(client.id, { serviceSlug: "plomberie", mode: "URGENT", description: "Fuite d'eau dans la cuisine", district: "Fann", addressLine: "Rue 5", landmark: "près de la pharmacie" });
  expect(req.ok).toBe(true);

  // Admin : tableau de bord
  await login(page, phone("70"));
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("Demandes totales")).toBeVisible();
  await expect(page.getByText(/en attente de validation/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Refus sans motif : erreur ; validation du premier prestataire
  await page.goto("/admin/prestataires?status=PENDING&q=Test%20Prestataire");
  const deux = page.locator("li", { hasText: "Test Prestataire Deux" });
  await deux.getByText("Refuser", { exact: true }).first().click();
  await deux.getByRole("button", { name: "Refuser" }).click();
  await expect(deux.getByText(/Indiquez un motif/)).toBeVisible();
  const un = page.locator("li", { hasText: "Test Prestataire Un" });
  await un.getByRole("button", { name: "Valider" }).click();
  await expect(un).toHaveCount(0); // sorti de l'onglet « En attente »
  await page.goto("/admin/prestataires?status=VERIFIED&q=Test%20Prestataire");
  await expect(page.getByText("Test Prestataire Un")).toBeVisible();

  // Affectation manuelle
  await page.goto("/admin/demandes?q=Test%20Client%20Admin");
  await page.getByRole("link", { name: /Test Client Admin/ }).click();
  await expect(page.getByText("Affecter un prestataire")).toBeVisible();
  await expect(page.getByText("Test Prestataire Deux")).toHaveCount(0); // non vérifié : pas proposé
  await page.locator("li", { hasText: "Test Prestataire Un" }).getByRole("button", { name: "Affecter" }).click();
  await expect(page.getByText(/👷 Test Prestataire Un — en attente de réponse/)).toBeVisible();

  // Le prestataire affecté voit et accepte la mission
  const pctx = await browser.newContext({ ...test.info().project.use });
  const pp = await pctx.newPage();
  await login(pp, phone("76"));
  await expect(pp).toHaveURL(/\/prestataire$/);
  await pp.goto("/prestataire/missions");
  await pp.getByText("Fuite d'eau dans la cuisine").click();
  await pp.getByRole("button", { name: /Accepter la mission/ }).click();
  await expect(pp.getByText("Rue 5")).toBeVisible();
  await pctx.close();

  // Droits : client et prestataire n'entrent pas dans /admin ; l'admin n'entre pas ailleurs
  const cctx = await browser.newContext({ ...test.info().project.use });
  const cp = await cctx.newPage();
  await login(cp, phone("75"));
  await cp.goto("/admin/prestataires");
  await expect(cp).toHaveURL(/\/client$/);
  await cctx.close();
  await page.goto("/client");
  await expect(page).toHaveURL(/\/admin$/);

  // Journal et paramètres
  await page.goto("/admin/journal");
  await expect(page.getByText("provider.verified")).toBeVisible();
  await expect(page.getByText("request.assign")).toBeVisible();
  await page.goto("/admin/parametres");
  await page.getByLabel("Commission Dalokeur (%)").fill("45");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText(/Entre 0 et 30/).first()).toBeVisible();
});
