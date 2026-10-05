import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { existsSync, rmSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const db = new PrismaClient();
const stamp = Date.now().toString().slice(-7);
const PASSWORD = "MotDePasse123";
// PNG 1×1 valide
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

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
  rmSync(".uploads", { recursive: true, force: true });
});

test("fichiers : photo de demande, photo de profil, documents (admin seul), contrôle d'accès", async ({ browser }) => {
  test.setTimeout(90_000);
  const hash = await bcrypt.hash(PASSWORD, 10);
  const svc = await db.service.findUniqueOrThrow({ where: { slug: "plomberie" } });
  const mk = (n: string, p: string, role: "ADMIN" | "CLIENT" | "PROVIDER") => db.user.create({ data: { fullName: n, phone: `+221${p}${stamp}`, passwordHash: hash, roles: { create: { role } } } });
  await mk("Test Admin Fichiers", "70", "ADMIN");
  await mk("Test Client Fichiers", "75", "CLIENT");
  await mk("Test Autre Fichiers", "78", "CLIENT");
  const prov = await mk("Test Prestataire Fichiers", "76", "PROVIDER");
  const other = await mk("Test Prestataire Deux", "77", "PROVIDER");
  for (const u of [prov, other]) await db.providerProfile.create({ data: { userId: u.id, jobTitle: "Plombier", zones: ["Dakar"], status: "VERIFIED", services: { create: { serviceId: svc.id } } } });
  const use = test.info().project.use;
  const ctx = async (p: string) => { const c = await browser.newContext({ ...use }); const pg = await c.newPage(); await login(pg, p); return { c, pg }; };

  // ── Client : demande avec photo
  const client = await ctx(`75${stamp}`);
  await client.pg.goto("/client/demande?service=plomberie&mode=URGENT");
  await client.pg.getByLabel("Ajouter une photo").setInputFiles({ name: "fuite.png", mimeType: "image/png", buffer: PNG });
  await expect(client.pg.getByAltText("Photo de la demande")).toBeVisible();
  await client.pg.getByLabel("3. Votre besoin").fill("Fuite d'eau sous le lavabo de la salle de bain");
  await client.pg.getByLabel("Quartier").selectOption("Médina");
  await client.pg.getByLabel("Adresse").fill("Rue 11 x 6");
  await client.pg.getByLabel("Point de repère").fill("porte bleue");
  await client.pg.getByRole("button", { name: "Confirmer ma demande" }).click();
  await expect(client.pg).toHaveURL(/\/client\/commandes\/[0-9a-f-]{36}$/);
  const requestId = client.pg.url().split("/").pop()!;
  const photoKey = (await db.serviceRequest.findUniqueOrThrow({ where: { id: requestId } })).photoKeys[0];
  expect(photoKey).toMatch(/^u\//);
  await expect(client.pg.getByAltText("Photo jointe à la demande")).toBeVisible();
  // l'image se charge réellement (réponse 200, type image)
  const own = await client.pg.request.get(`/api/files/${photoKey}`);
  expect(own.status()).toBe(200);
  expect(own.headers()["content-type"]).toBe("image/jpeg");
  expect(own.headers()["x-content-type-options"]).toBe("nosniff");

  // ── Autre client et prestataire non assigné : 404 uniforme
  const stranger = await ctx(`78${stamp}`);
  expect((await stranger.pg.request.get(`/api/files/${photoKey}`)).status()).toBe(404);
  const p1 = await ctx(`76${stamp}`);
  expect((await p1.pg.request.get(`/api/files/${photoKey}`)).status()).toBe(404); // avant acceptation
  await p1.pg.goto(`/prestataire/missions/${requestId}`);
  expect(await p1.pg.content()).not.toContain(photoKey); // pas dans l'aperçu
  await p1.pg.getByRole("button", { name: /Accepter la mission/ }).click();
  await expect(p1.pg.getByAltText("Photo jointe à la demande")).toBeVisible(); // après acceptation
  expect((await p1.pg.request.get(`/api/files/${photoKey}`)).status()).toBe(200);
  const p2 = await ctx(`77${stamp}`);
  expect((await p2.pg.request.get(`/api/files/${photoKey}`)).status()).toBe(404);
  await p2.c.close(); await stranger.c.close();

  // ── Sans connexion : refus
  const anon = await browser.newContext({ ...use });
  expect((await anon.request.get(`/api/files/${photoKey}`)).status()).toBe(401);
  // envoi depuis un autre site : refusé (Origin)
  const csrf = await client.pg.request.post("/api/uploads", { headers: { origin: "https://evil.example" }, multipart: { purpose: "REQUEST_PHOTO", file: { name: "a.png", mimeType: "image/png", buffer: PNG } } });
  expect(csrf.status()).toBe(403);
  await anon.close();

  // ── Prestataire : photo de profil + documents
  await p1.pg.goto("/prestataire/profil");
  await p1.pg.getByLabel("Photo de profil").setInputFiles({ name: "moi.png", mimeType: "image/png", buffer: PNG });
  await expect(p1.pg.getByAltText("Ma photo de profil")).toBeVisible();
  await p1.pg.getByLabel("Envoyer un document").setInputFiles({ name: "cni.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(p1.pg.getByText("En attente")).toBeVisible();
  await p1.pg.getByLabel("Envoyer un document").setInputFiles({ name: "faux.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") });
  await expect(p1.pg.getByText(/Format accepté/)).toBeVisible();
  const docKey = (await db.providerDocument.findFirstOrThrow({ where: { provider: { user: { phone: `+22176${stamp}` } } } })).fileKey;
  expect((await p1.pg.request.get(`/api/files/${docKey}`)).status()).toBe(404); // même le propriétaire ne relit pas ses pièces
  expect((await client.pg.request.get(`/api/files/${docKey}`)).status()).toBe(404);

  // ── Administrateur : voit et valide le document
  const admin = await ctx(`70${stamp}`);
  const doc = await admin.pg.request.get(`/api/files/${docKey}`);
  expect(doc.status()).toBe(200);
  expect(doc.headers()["content-disposition"]).toBe("attachment");
  await admin.pg.goto("/admin/prestataires?q=Test%20Prestataire%20Fichiers");
  const card = admin.pg.locator("li", { hasText: "Test Prestataire Fichiers" }).first();
  await expect(card.getByText("📄 CNI")).toBeVisible();
  await card.getByRole("button", { name: "Accepter" }).click();
  await expect(card.getByText("Accepté", { exact: true })).toBeVisible();
  await p1.pg.goto("/prestataire/profil");
  await expect(p1.pg.getByText("Accepté", { exact: true })).toBeVisible();

  // ── Client : la photo de profil du prestataire apparaît sur sa commande
  await client.pg.goto(`/client/commandes/${requestId}`);
  await expect(client.pg.locator("img[src*='/api/files/u/']").first()).toBeVisible();
  expect(await client.pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const x of [client, p1, admin]) await x.c.close();
});
