import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const db = new PrismaClient();
const stamp = Date.now().toString().slice(-7);
const PASSWORD = "MotDePasse123";

async function registerClient(page: Page, name: string, phone: string) {
  await page.goto("/inscription");
  await page.getByLabel("Nom complet").fill(name);
  await page.getByLabel("Téléphone").fill(phone);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/client$/);
}

test.afterAll(async () => {
  await db.review.deleteMany({ where: { client: { fullName: { startsWith: "Test " } } } });
  await db.serviceRequest.deleteMany({ where: { client: { fullName: { startsWith: "Test " } } } });
  await db.user.deleteMany({ where: { fullName: { startsWith: "Test " } } });
  await db.$disconnect();
});

test("prestataire : validation requise, aperçu masqué, acceptation, statuts, vue client", async ({ page, browser }) => {
  // Client crée une demande de plomberie à Médina
  const clientCtx = await browser.newContext({ ...test.info().project.use });
  const cp = await clientCtx.newPage();
  await registerClient(cp, "Test Client E2E", `77${stamp}`);
  await cp.goto("/client/demande?service=plomberie&mode=URGENT");
  await cp.getByLabel("3. Votre besoin").fill("Fuite d'eau sous le lavabo de la salle de bain");
  await cp.getByLabel("Quartier").selectOption("Médina");
  await cp.getByLabel("Adresse").fill("Rue 6 x 15, villa 8");
  await cp.getByLabel("Point de repère").fill("derrière la mosquée");
  await cp.getByRole("button", { name: "Confirmer ma demande" }).click();
  await expect(cp).toHaveURL(/\/client\/commandes\/[0-9a-f-]{36}$/);
  const clientUrl = cp.url();
  const requestId = clientUrl.split("/").pop()!;

  // Inscription prestataire (plombier, Dakar) → en attente
  await page.goto("/inscription/prestataire");
  await page.getByLabel("Nom complet").fill("Test Plombier E2E");
  await page.getByLabel("Téléphone").fill(`78${stamp}`);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByLabel("Votre métier").fill("Plombier");
  await page.getByLabel("Plomberie", { exact: true }).check();
  await page.getByLabel("Dakar").check();
  await page.getByRole("button", { name: "Envoyer ma candidature" }).click();
  await expect(page).toHaveURL(/\/prestataire$/);
  await expect(page.getByText("En attente de validation").first()).toBeVisible();

  // Non vérifié : aucune demande visible, accès direct refusé
  await page.goto("/prestataire/missions");
  await expect(page.getByText("doit être validé")).toBeVisible();
  expect((await page.goto(`/prestataire/missions/${requestId}`))?.status()).toBe(404);

  // L'administrateur valide (simulé en base)
  await db.providerProfile.updateMany({ where: { user: { phone: `+22178${stamp}` } }, data: { status: "VERIFIED", verifiedAt: new Date() } });

  // Aperçu : zone approximative, aucune donnée privée
  await page.goto("/prestataire/missions");
  await expect(page.getByText("Fuite d'eau sous le lavabo")).toBeVisible();
  await page.getByText("Fuite d'eau sous le lavabo").click();
  await expect(page.getByText("Zone approximative")).toBeVisible();
  const html = await page.content();
  for (const secret of ["Rue 6 x 15", "derrière la mosquée", `77${stamp}`]) expect(html).not.toContain(secret);

  // Acceptation : les infos apparaissent
  await page.getByRole("button", { name: /Accepter la mission/ }).click();
  await expect(page.getByText("Rue 6 x 15, villa 8")).toBeVisible();
  await expect(page.getByText("derrière la mosquée")).toBeVisible();
  await expect(page.getByText(`+22177${stamp}`)).toBeVisible();

  // Statuts
  for (const label of [/Je suis en route/, /Je suis arrivé/, /Démarrer l'intervention/]) {
    const btn = page.getByRole("button", { name: label });
    await btn.click();
    await expect(btn).toHaveCount(0);
  }
  await expect(page.getByText("En cours").first()).toBeVisible();

  // Côté client : prestataire visible avec note, vérification et statut courant
  await cp.reload();
  await expect(cp.getByText("Test Plombier E2E")).toBeVisible();
  await expect(cp.getByText("Prestataire vérifié")).toBeVisible();
  await expect(cp.getByRole("button", { name: /Confirmer que le service est terminé/ })).toBeVisible();

  // Fin par le prestataire → avis client
  await page.getByRole("button", { name: /Terminer l'intervention/ }).click();
  await expect(page.getByRole("button", { name: /Terminer l'intervention/ })).toHaveCount(0);
  await cp.reload();
  await expect(cp.getByText("Donnez votre avis")).toBeVisible();
  await clientCtx.close();

  // Aucun scroll horizontal côté prestataire
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("un client ne peut pas entrer dans l'espace prestataire", async ({ page }) => {
  await registerClient(page, "Test Client Bis", `76${stamp}`);
  await page.goto("/prestataire/missions");
  await expect(page).toHaveURL(/\/client$/);
});
