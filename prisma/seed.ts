// Données de démonstration — Dakar et Pikine uniquement. Aucun paiement réel.
import { PrismaClient, type ProviderStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "Dalokeur2026!";

const categories = [
  { slug: "menage-lessive-nettoyage", name: "Ménage, lessive et nettoyage", icon: "🧺", sortOrder: 1, isLaunch: true },
  { slug: "depannage-domicile", name: "Dépannage à domicile", icon: "🔧", sortOrder: 2, isLaunch: true },
  { slug: "livraison-locale", name: "Livraison locale", icon: "🛵", sortOrder: 3, isLaunch: true },
  { slug: "location-vehicules", name: "Location de véhicules", icon: "🚗", sortOrder: 10, isLaunch: false },
  { slug: "agence-immobiliere", name: "Agence immobilière", icon: "🏠", sortOrder: 11, isLaunch: false },
  { slug: "gestion-locative", name: "Gestion locative", icon: "🔑", sortOrder: 12, isLaunch: false },
  { slug: "gestion-boutiques", name: "Gestion de boutiques", icon: "🏪", sortOrder: 13, isLaunch: false },
];

const services = [
  { cat: "menage-lessive-nettoyage", slug: "menage-lessive", name: "Ménage, lessive et nettoyage", base: 8000, price: "FIXED_ESTIMATE", track: "NONE", urgent: false },
  { cat: "depannage-domicile", slug: "plomberie", name: "Plomberie", base: null, price: "QUOTE_AFTER_DIAGNOSIS", track: "LIVE_ON_CONSENT", urgent: true },
  { cat: "depannage-domicile", slug: "electricite", name: "Électricité", base: null, price: "QUOTE_AFTER_DIAGNOSIS", track: "LIVE_ON_CONSENT", urgent: true },
  { cat: "depannage-domicile", slug: "climatisation", name: "Climatisation", base: null, price: "QUOTE_AFTER_DIAGNOSIS", track: "LIVE_ON_CONSENT", urgent: true },
  { cat: "depannage-domicile", slug: "serrurerie", name: "Serrurerie", base: null, price: "QUOTE_AFTER_DIAGNOSIS", track: "LIVE_ON_CONSENT", urgent: true },
  { cat: "livraison-locale", slug: "livraison-locale", name: "Livraison locale", base: 1500, price: "FIXED_ESTIMATE", track: "LIVE_ON_CONSENT", urgent: true },
] as const;

type P = { name: string; phone: string; job: string; years: number; zones: string[]; svc: string[]; status: ProviderStatus; rating: number; done: number };
const providers: P[] = [
  { name: "Moussa Ndiaye", phone: "+221771000001", job: "Plombier", years: 8, zones: ["Dakar", "Pikine"], svc: ["plomberie"], status: "VERIFIED", rating: 4.8, done: 126 },
  { name: "Ibrahima Sow", phone: "+221771000002", job: "Électricien", years: 6, zones: ["Dakar"], svc: ["electricite", "climatisation"], status: "VERIFIED", rating: 4.6, done: 84 },
  { name: "Fatou Ba", phone: "+221771000003", job: "Aide-ménagère", years: 4, zones: ["Dakar", "Pikine"], svc: ["menage-lessive"], status: "VERIFIED", rating: 4.9, done: 210 },
  { name: "Cheikh Fall", phone: "+221771000004", job: "Livreur à moto", years: 3, zones: ["Pikine"], svc: ["livraison-locale"], status: "VERIFIED", rating: 4.5, done: 340 },
  { name: "Aminata Gueye", phone: "+221771000005", job: "Serrurière", years: 2, zones: ["Dakar"], svc: ["serrurerie"], status: "PENDING", rating: 0, done: 0 },
];

async function main() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);

  for (const c of categories) await db.serviceCategory.upsert({ where: { slug: c.slug }, update: c, create: c });
  const cats = Object.fromEntries((await db.serviceCategory.findMany()).map((c) => [c.slug, c.id]));
  for (const s of services) {
    const data = { categoryId: cats[s.cat], slug: s.slug, name: s.name, basePriceFcfa: s.base, priceMode: s.price, trackingPolicy: s.track, allowsUrgent: s.urgent };
    await db.service.upsert({ where: { slug: s.slug }, update: data, create: data });
  }
  const svcId = Object.fromEntries((await db.service.findMany()).map((s) => [s.slug, s.id]));

  // Admin : mot de passe fourni par l'environnement, jamais en dur.
  const adminPassword = process.env.ADMIN_SEED_PASSWORD;
  if (adminPassword) {
    const phone = process.env.ADMIN_SEED_PHONE ?? "+221770000000";
    await db.user.upsert({
      where: { phone }, update: {},
      create: { phone, email: process.env.ADMIN_SEED_EMAIL, fullName: "Administrateur Dalokeur", passwordHash: await bcrypt.hash(adminPassword, 12), roles: { create: { role: "ADMIN" } } },
    });
  } else console.warn("ADMIN_SEED_PASSWORD absent : aucun administrateur créé.");

  // Clients de démonstration
  const clients = [
    { name: "Awa Diop", phone: "+221772000001", district: "Médina", addr: "Rue 11 x 6", landmark: "près de la pharmacie" },
    { name: "Mamadou Sarr", phone: "+221772000002", district: "Thiaroye", addr: "Cité Gadaye", landmark: "derrière la mosquée" },
  ];
  for (const c of clients) {
    await db.user.upsert({
      where: { phone: c.phone }, update: {},
      create: { phone: c.phone, fullName: c.name, passwordHash: hash, roles: { create: { role: "CLIENT" } }, wallet: { create: { isDemo: true, balanceFcfa: 0 } }, keurPoints: { create: { balance: 0 } } },
    });
  }

  for (const p of providers) {
    await db.user.upsert({
      where: { phone: p.phone }, update: {},
      create: {
        phone: p.phone, fullName: p.name, passwordHash: hash,
        roles: { create: { role: "PROVIDER" } }, wallet: { create: { isDemo: true } },
        providerProfile: { create: { jobTitle: p.job, experienceYears: p.years, zones: p.zones, status: p.status, ratingAvg: p.rating, missionsDone: p.done, verifiedAt: p.status === "VERIFIED" ? new Date() : null, services: { create: p.svc.map((s) => ({ serviceId: svcId[s] })) } } },
      },
    });
  }

  await db.setting.upsert({ where: { key: "commission_percent" }, update: {}, create: { key: "commission_percent", value: 10 } });
  await db.setting.upsert({ where: { key: "coverage_zones" }, update: {}, create: { key: "coverage_zones", value: ["Dakar", "Pikine"] } });
  console.log("Seed terminé. Comptes démo : mot de passe =", DEMO_PASSWORD);
}

main().finally(() => db.$disconnect());
