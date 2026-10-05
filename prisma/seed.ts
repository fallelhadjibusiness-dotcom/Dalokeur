// Données de démonstration — Dakar et Pikine uniquement. Aucun paiement réel.
import { PrismaClient, type ProviderStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DISTRICT_CENTERS, approximatePoint } from "../src/lib/geo";

const db = new PrismaClient();

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "Dalokeur2026!";

const categories = [
  { slug: "menage-lessive-nettoyage", name: "Ménage, lessive et nettoyage", icon: "🧺", sortOrder: 1, isLaunch: true },
  { slug: "depannage-domicile", name: "Dépannage à domicile", icon: "🔧", sortOrder: 2, isLaunch: true },
  { slug: "livraison-locale", name: "Livraison locale", icon: "🛵", sortOrder: 3, isLaunch: true },
  { slug: "location-vehicules", name: "Location de véhicules", icon: "🚗", sortOrder: 10, isLaunch: false },
  { slug: "agence-immobiliere", name: "Agence immobilière", icon: "🏠", sortOrder: 11, isLaunch: false },
  { slug: "gestion-locative", name: "Gestion locative", icon: "🔑", sortOrder: 12, isLaunch: false },
];

const services = [
  { cat: "menage-lessive-nettoyage", slug: "menage-lessive", name: "Ménage, lessive et nettoyage", base: 8000, transport: null, price: "FIXED_ESTIMATE", track: "NONE", urgent: false },
  { cat: "depannage-domicile", slug: "plomberie", name: "Plomberie", base: null, transport: 2000, price: "QUOTE_AFTER_DIAGNOSIS", track: "LIVE_ON_CONSENT", urgent: true },
  { cat: "depannage-domicile", slug: "electricite", name: "Électricité", base: null, transport: 2000, price: "QUOTE_AFTER_DIAGNOSIS", track: "LIVE_ON_CONSENT", urgent: true },
  { cat: "depannage-domicile", slug: "climatisation", name: "Climatisation", base: null, transport: 2000, price: "QUOTE_AFTER_DIAGNOSIS", track: "LIVE_ON_CONSENT", urgent: true },
  { cat: "depannage-domicile", slug: "serrurerie", name: "Serrurerie", base: null, transport: 2000, price: "QUOTE_AFTER_DIAGNOSIS", track: "LIVE_ON_CONSENT", urgent: true },
  { cat: "livraison-locale", slug: "livraison-locale", name: "Livraison locale", base: 1500, transport: 1500, price: "FIXED_ESTIMATE", track: "LIVE_ON_CONSENT", urgent: true },
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
    const data = { categoryId: cats[s.cat], slug: s.slug, name: s.name, basePriceFcfa: s.base, transportFeeFcfa: s.transport, priceMode: s.price, trackingPolicy: s.track, allowsUrgent: s.urgent };
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
    { name: "Awa Diop", phone: "+221772000001", district: "Médina", addr: "Rue 11 x 6", landmark: "près de la pharmacie", points: 150 },
    { name: "Mamadou Sarr", phone: "+221772000002", district: "Thiaroye", addr: "Cité Gadaye", landmark: "derrière la mosquée", points: 0 },
  ];
  for (const c of clients) {
    await db.user.upsert({
      where: { phone: c.phone }, update: {},
      create: { phone: c.phone, fullName: c.name, passwordHash: hash, roles: { create: { role: "CLIENT" } }, wallet: { create: { isDemo: true, balanceFcfa: 0 } }, keurPoints: { create: { balance: c.points } } },
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

  // Annonces immobilières de démonstration (Dakar et Pikine). Adresses exactes fictives, jamais publiées avant validation d'une visite.
  if ((await db.property.count()) === 0) {
    const L = [
      { title: "Appartement F3 lumineux à Mermoz", kind: "RENT", type: "APARTMENT", price: 350000, bed: 2, m2: 95, district: "Mermoz", addr: "Résidence Les Flamboyants, 3e étage, rue MZ 12", desc: "Appartement de 2 chambres avec salon, cuisine équipée et balcon, dans une résidence sécurisée avec gardien. Proche des écoles et des commerces." },
      { title: "Studio meublé à la Médina", kind: "RENT", type: "STUDIO", price: 120000, bed: 1, m2: 28, district: "Médina", addr: "Rue 11 x 6, immeuble Sow, 1er étage", desc: "Studio meublé et climatisé, eau et électricité incluses dans la facture forfaitaire. Idéal pour une personne seule ou un étudiant." },
      { title: "Villa 5 pièces avec jardin à Ngor", kind: "SALE", type: "VILLA", price: 185000000, bed: 4, m2: 320, district: "Ngor", addr: "Route de Ngor, villa n°14, porte en bois", desc: "Belle villa de 4 chambres avec jardin, garage et terrasse, à quelques minutes de la plage. Titre foncier disponible." },
      { title: "Terrain de 300 m² à Keur Massar", kind: "SALE", type: "LAND", price: 12000000, bed: null, m2: 300, district: "Keur Massar", addr: "Zone Aliou Sow, lot 45", desc: "Terrain viabilisé, bornage fait, accès par une route carrossable. Papiers en règle, idéal pour construire une maison familiale." },
      { title: "Plateau de bureaux au Plateau", kind: "RENT", type: "OFFICE", price: 500000, bed: null, m2: 120, district: "Plateau", addr: "Avenue Léopold Sédar Senghor, 4e étage", desc: "Plateau de bureaux de 120 m² avec climatisation, ascenseur et parking. Convient pour une agence ou une petite entreprise." },
      { title: "Villa familiale à Thiaroye", kind: "SALE", type: "VILLA", price: 45000000, bed: 4, m2: 180, district: "Thiaroye", addr: "Cité Gadaye, villa n°7, derrière la mosquée", desc: "Villa de 4 chambres sur 200 m², cour intérieure et deux salles de bain. Quartier calme, transports à proximité." },
      { title: "Appartement 2 chambres à Guédiawaye", kind: "RENT", type: "APARTMENT", price: 150000, bed: 2, m2: 70, district: "Guédiawaye", addr: "Golf Sud, immeuble Ndiaye, 2e étage", desc: "Appartement de 2 chambres, salon et cuisine, avec réservoir d'eau. À 5 minutes de la route principale." },
      { title: "Appartement vue mer aux Almadies", kind: "RENT", type: "APARTMENT", price: 650000, bed: 3, m2: 140, district: "Almadies", addr: "Résidence Océane, 5e étage, Route des Almadies", desc: "Appartement de standing de 3 chambres avec vue sur la mer, piscine et gardien 24h/24." },
    ] as const;
    for (const x of L) {
      const c = DISTRICT_CENTERS[x.district];
      await db.property.create({ data: { title: x.title, listingType: x.kind, propertyType: x.type, priceFcfa: x.price, bedrooms: x.bed, surfaceM2: x.m2, district: x.district, exactAddress: x.addr, description: x.desc, photoKeys: [], ...approximatePoint(c.lat, c.lng) } });
    }
  }

  await db.setting.upsert({ where: { key: "commission_percent" }, update: {}, create: { key: "commission_percent", value: 10 } });
  await db.setting.upsert({ where: { key: "keur_rules" }, update: {}, create: { key: "keur_rules", value: { pointValueFcfa: 10, perMission: 10, perReview: 5 } } });
  await db.setting.upsert({ where: { key: "coverage_zones" }, update: {}, create: { key: "coverage_zones", value: ["Dakar", "Pikine"] } });
  console.log("Seed terminé.");
}

main().finally(() => db.$disconnect());
