import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const db = new PrismaClient();
const stamp = Date.now().toString().slice(-7);
const PASSWORD = "MotDePasse123";
const SECRET = `Résidence Teranga ${stamp}, 4e étage, porte verte`;
const TITLE = `Appartement F3 Test ${stamp}`;
const local = (d: Date) => d.toISOString().slice(0, 16);

async function login(page: Page, p: string) {
  await page.goto("/connexion");
  await page.getByLabel("Téléphone").fill(p);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/(client|prestataire|admin)$/);
}

test.afterAll(async () => {
  await db.propertyVisit.deleteMany({ where: { property: { title: TITLE } } });
  await db.property.deleteMany({ where: { title: TITLE } });
  await db.notification.deleteMany({ where: { user: { fullName: { startsWith: "Test " } } } });
  await db.adminAction.deleteMany({ where: { admin: { fullName: { startsWith: "Test " } } } });
  await db.user.deleteMany({ where: { fullName: { startsWith: "Test " } } });
  await db.$disconnect();
});

test("immobilier : annonce, recherche, visite, adresse masquée puis révélée", async ({ browser }) => {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const mk = (n: string, p: string, role: "ADMIN" | "CLIENT") => db.user.create({ data: { fullName: n, phone: `+221${p}${stamp}`, passwordHash: hash, roles: { create: { role } } } });
  await mk("Test Admin Immo", "70", "ADMIN"); await mk("Test Client Immo", "75", "CLIENT"); await mk("Test Autre Client", "76", "CLIENT");
  const use = test.info().project.use;

  // ── Administrateur : crée l'annonce (erreurs de formulaire, puis succès)
  const actx = await browser.newContext({ ...use }); const ap = await actx.newPage();
  await login(ap, `70${stamp}`);
  await ap.goto("/admin/immobilier/nouveau");
  await ap.getByRole("button", { name: "Enregistrer l'annonce" }).click();
  await expect(ap.getByText("Titre trop court.")).toBeVisible();
  await expect(ap.getByText(/Adresse exacte requise/)).toBeVisible();
  await ap.getByLabel("Titre de l'annonce").fill(TITLE);
  await ap.getByLabel(/Prix en FCFA/).fill("275000");
  await ap.getByLabel("Chambres").fill("2");
  await ap.getByLabel("Surface (m²)").fill("85");
  await ap.getByLabel(/Quartier \(affiché/).selectOption("Fann");
  await ap.getByLabel(/Adresse exacte/).fill(SECRET);
  await ap.getByLabel("Description").fill("Bel appartement lumineux avec balcon, gardien et parking, proche des écoles.");
  await ap.getByRole("button", { name: "Enregistrer l'annonce" }).click();
  await expect(ap).toHaveURL(/\/admin\/immobilier$/);
  await expect(ap.getByText(TITLE)).toBeVisible();

  // ── Client : recherche Louer + filtres
  const cctx = await browser.newContext({ ...use }); const cp = await cctx.newPage();
  await login(cp, `75${stamp}`);
  await cp.goto("/client/immobilier");
  await expect(cp.getByRole("tab", { name: "Louer" })).toHaveAttribute("aria-selected", "true");
  await cp.getByLabel("Type de bien").selectOption("APARTMENT");
  await cp.getByLabel("Quartier", { exact: true }).selectOption("Fann");
  await cp.getByLabel("Budget maximum").fill("300000");
  await cp.getByRole("button", { name: "Filtrer" }).click();
  await expect(cp.getByText(TITLE)).toBeVisible();
  await cp.getByLabel("Budget maximum").fill("100000");
  await cp.getByRole("button", { name: "Filtrer" }).click();
  await expect(cp.getByText("Aucune annonce ne correspond")).toBeVisible();
  await cp.getByRole("tab", { name: "Acheter" }).click();
  await expect(cp.getByText(TITLE)).toHaveCount(0);
  await cp.goto("/client/immobilier?type=RENT&district=Fann");
  expect(await cp.content()).not.toContain(SECRET); // aucune fuite dans la liste
  await cp.getByText(TITLE).click();

  // ── Fiche : localisation approximative, adresse jamais affichée
  await expect(cp.getByText("localisation approximative")).toBeVisible();
  await expect(cp.getByText(/adresse exacte est communiquée après validation/)).toBeVisible();
  expect(await cp.content()).not.toContain(SECRET);
  const propertyUrl = cp.url();

  // ── Demande de visite : erreur de créneau puis succès
  await cp.getByLabel("Date et heure souhaitées").fill(local(new Date(Date.now() + 30 * 60_000)));
  await cp.getByRole("button", { name: "Demander une visite" }).click();
  await expect(cp.getByText(/au moins 2 heures/)).toBeVisible();
  await cp.getByLabel("Date et heure souhaitées").fill(local(new Date(Date.now() + 2 * 86_400_000)));
  await cp.getByLabel(/Message/).fill("Disponible le matin");
  await cp.getByRole("button", { name: "Demander une visite" }).click();
  await expect(cp).toHaveURL(/\/client\/immobilier\/visites\/[0-9a-f-]{36}$/);
  const visitUrl = cp.url();
  await expect(cp.getByText("Demandée").first()).toBeVisible();
  await expect(cp.getByText(/adresse exacte sera affichée ici après la confirmation/)).toBeVisible();
  expect(await cp.content()).not.toContain(SECRET);
  await cp.goto(propertyUrl);
  await expect(cp.getByText("Vous avez déjà une demande de visite")).toBeVisible(); // pas de doublon

  // ── Un autre client n'a aucun accès à cette visite
  const octx = await browser.newContext({ ...use }); const op = await octx.newPage();
  await login(op, `76${stamp}`);
  expect((await op.goto(visitUrl))?.status()).toBe(404);
  await octx.close();

  // ── Admin : confirme la visite avec un créneau
  await ap.goto("/admin/visites?status=REQUESTED");
  const card = ap.locator("li", { hasText: TITLE });
  await expect(card.getByText("Test Client Immo")).toBeVisible();
  await card.getByText("Confirmer avec un créneau").click();
  await card.getByLabel("Créneau confirmé").fill(local(new Date(Date.now() + 3 * 86_400_000)));
  await card.getByPlaceholder(/Note pour le client/).fill("RDV devant le portail");
  await card.getByRole("button", { name: "Confirmer la visite" }).click();
  await expect(card).toHaveCount(0); // sorti de l'onglet « Demandées »

  // ── Client : adresse exacte révélée + notification
  await cp.goto(visitUrl);
  await expect(cp.getByText("Confirmée").first()).toBeVisible();
  await expect(cp.getByTestId("exact-address")).toHaveText(SECRET);
  await expect(cp.getByText(/RDV devant le portail/)).toBeVisible();
  await cp.goto("/client/notifications");
  await expect(cp.getByText("Visite confirmée")).toBeVisible();
  expect(await cp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // ── Annonce désactivée : disparaît de la recherche
  await ap.goto("/admin/immobilier");
  await ap.locator("li", { hasText: TITLE }).getByRole("button", { name: "Désactiver" }).click();
  await expect(ap.locator("li", { hasText: TITLE }).getByText("Désactivée")).toBeVisible();
  expect((await cp.goto(propertyUrl))?.status()).toBe(404);

  // ── Droits : le client n'entre pas dans l'administration immobilière
  await cp.goto("/admin/immobilier");
  await expect(cp).toHaveURL(/\/client$/);
  await actx.close(); await cctx.close();
});
