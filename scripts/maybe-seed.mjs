// Exécuté pendant le build Vercel. Crée les données de départ (services, quartiers, annonces, comptes de démonstration,
// administrateur) UNIQUEMENT si RUN_SEED=1. Le seed est idempotent : on peut le relancer sans créer de doublons.
import { spawnSync } from "node:child_process";

if (process.env.RUN_SEED !== "1") {
  console.log("RUN_SEED != 1 : seed ignoré.");
  process.exit(0);
}
if (!process.env.ADMIN_SEED_PASSWORD) {
  console.error("RUN_SEED=1 exige ADMIN_SEED_PASSWORD (mot de passe de l'administrateur).");
  process.exit(1);
}
console.log("Création des données de départ…");
const r = spawnSync("npx", ["tsx", "prisma/seed.ts"], { stdio: "inherit", env: process.env });
process.exit(r.status ?? 1);
