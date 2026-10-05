// Build Vercel : migrations → données de départ (si RUN_SEED=1) → next build.
// DIRECT_URL (connexion directe, pour les migrations) est déduite si elle n'est pas fournie :
//  1) DATABASE_URL_UNPOOLED (variable créée par l'intégration Neon de Vercel) ;
//  2) sinon DATABASE_URL sans « -pooler » dans le nom du serveur (convention Neon).
import { spawnSync } from "node:child_process";

const env = { ...process.env };
if (!env.DATABASE_URL) {
  console.error("\nERREUR : la variable DATABASE_URL est absente.\nAjoutez-la dans Vercel → Settings → Environment Variables (coche « Production »), puis relancez (Redeploy).\n");
  process.exit(1);
}
if (!env.DIRECT_URL) {
  env.DIRECT_URL = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL.replace("-pooler", "");
  console.log("DIRECT_URL absente : déduite de la connexion à la base (" + (env.DATABASE_URL_UNPOOLED ? "DATABASE_URL_UNPOOLED" : "DATABASE_URL sans -pooler") + ").");
}

const run = (cmd, args) => {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run("npx", ["prisma", "migrate", "deploy"]);
run("node", ["scripts/maybe-seed.mjs"]);
run("npx", ["next", "build"]);
