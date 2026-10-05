import AxeBuilder from "@axe-core/playwright";
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

// Violations graves (sérieuses ou critiques) : contraste, noms accessibles, étiquettes de champs, titres…
async function audit(page: Page, path: string) {
  await page.goto(path);
  await page.locator("h1").first().waitFor({ timeout: 15_000 });
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  return bad.map((v) => `${path} — ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
}

test.afterAll(async () => {
  await db.notification.deleteMany({ where: { user: { fullName: { startsWith: "Test " } } } });
  await db.serviceRequest.deleteMany({ where: { client: { fullName: { startsWith: "Test " } } } });
  await db.user.deleteMany({ where: { fullName: { startsWith: "Test " } } });
  await db.$disconnect();
});

test("accessibilité (axe, WCAG 2.1 AA) : aucune violation grave sur les écrans clés", async ({ browser }) => {
  test.setTimeout(300_000);
  const hash = await bcrypt.hash(PASSWORD, 10);
  const mk = (n: string, p: string, role: "ADMIN" | "CLIENT" | "PROVIDER") => db.user.create({ data: { fullName: n, phone: `+221${p}${stamp}`, passwordHash: hash, roles: { create: { role } } } });
  await mk("Test Admin A11y", "70", "ADMIN");
  const client = await mk("Test Client A11y", "75", "CLIENT");
  const prov = await mk("Test Prestataire A11y", "76", "PROVIDER");
  const svc = await db.service.findUniqueOrThrow({ where: { slug: "plomberie" } });
  await db.providerProfile.create({ data: { userId: prov.id, jobTitle: "Plombier", zones: ["Dakar"], status: "VERIFIED", services: { create: { serviceId: svc.id } } } });
  const { createRequest } = await import("../../src/lib/requests");
  const { acceptMission } = await import("../../src/lib/missions");
  const r = await createRequest(client.id, { serviceSlug: "plomberie", mode: "URGENT", description: "Fuite d'eau sous le lavabo de la salle de bain", district: "Fann", addressLine: "Rue 5", landmark: "porte bleue" });
  if (!r.ok) throw new Error("request");
  const prop = await db.property.findFirstOrThrow({ where: { isActive: true } });

  const use = test.info().project.use;
  const violations: string[] = [];
  const run = async (phone: string | null, paths: string[]) => {
    const c = await browser.newContext({ ...use }); const p = await c.newPage();
    if (phone) await login(p, phone);
    for (const path of paths) violations.push(...(await audit(p, path)));
    await c.close();
  };

  await run(null, ["/", "/connexion", "/inscription", "/inscription/prestataire", "/offline"]);
  await run(`75${stamp}`, ["/client", "/client/demande?service=plomberie&mode=URGENT", "/client/commandes", `/client/commandes/${r.id}`, "/client/portefeuille", "/client/notifications", "/client/immobilier", `/client/immobilier/${prop.id}`, "/client/immobilier/visites"]);
  await acceptMission(prov.id, r.id);
  await run(`76${stamp}`, ["/prestataire", "/prestataire/missions", `/prestataire/missions/${r.id}`, "/prestataire/agenda", "/prestataire/messages", "/prestataire/gains", "/prestataire/profil"]);
  await run(`70${stamp}`, ["/admin", "/admin/demandes", `/admin/demandes/${r.id}`, "/admin/prestataires", "/admin/utilisateurs", "/admin/avis", "/admin/litiges", "/admin/services", "/admin/parametres", "/admin/immobilier", "/admin/visites", "/admin/journal", "/admin/securite"]);

  expect(violations.join("\n")).toBe("");
});
