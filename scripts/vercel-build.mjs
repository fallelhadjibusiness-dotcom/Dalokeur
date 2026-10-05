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
// Une adresse copiée à moitié (sans « postgresql:// ») ou entourée de guillemets est l'erreur la plus fréquente.
const problem = (name, v) => {
  if (!v) return null;
  if (/^["'\s]|["'\s]$/.test(v)) return `${name} contient des guillemets ou des espaces au début/à la fin : retirez-les.`;
  if (!/^postgres(ql)?:\/\//.test(v)) return `${name} doit COMMENCER par « postgresql:// » (vous avez peut-être copié l'adresse sans son début). Exemple : postgresql://utilisateur:motdepasse@serveur/neondb?sslmode=require`;
  return null;
};
for (const name of ["DATABASE_URL", "DIRECT_URL", "DATABASE_URL_UNPOOLED"]) {
  const msg = problem(name, env[name]);
  if (msg) {
    console.error(`\nERREUR : ${msg}\nCorrigez-la dans Vercel → Settings → Environment Variables, puis relancez (Redeploy).\n`);
    process.exit(1);
  }
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
