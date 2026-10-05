import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => { const p = path.join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk("src");

// Fonctions exportées d'un fichier "use server" : (nom, texte jusqu'au prochain export).
function exportedFunctions(src: string) {
  const starts = [...src.matchAll(/export async function (\w+)\s*\(/g)];
  const nextExport = (from: number) => { const n = src.indexOf("\nexport ", from + 1); return n === -1 ? src.length : n; };
  return starts.map((m) => ({ name: m[1], body: src.slice(m.index!, nextExport(m.index!)) }));
}

// Actions volontairement publiques (formulaires d'authentification) — liste fermée et relue.
const PUBLIC_ACTIONS = new Set(["loginAction", "logoutAction", "registerClientAction", "registerProviderAction"]);

describe("garde-fous de sécurité (analyse statique)", () => {
  it("chaque action serveur vérifie l'identité ou délègue à une fonction qui le fait", () => {
    const actionFiles = files.filter((f) => readFileSync(f, "utf8").startsWith('"use server"'));
    expect(actionFiles.length).toBeGreaterThan(5);
    const missing: string[] = [];
    for (const f of actionFiles) {
      for (const fn of exportedFunctions(readFileSync(f, "utf8"))) {
        if (PUBLIC_ACTIONS.has(fn.name)) continue;
        const guarded = /requireRole\(|getActor\(|await run\(|await act\(/.test(fn.body) || /return (run|act)\(/.test(fn.body);
        if (!guarded) missing.push(`${f}:${fn.name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("les helpers run()/act() exigent un rôle", () => {
    for (const f of files.filter((f) => /app\/(admin|client|prestataire)\/(\w+\/)?actions\.ts$/.test(f))) {
      const src = readFileSync(f, "utf8");
      if (/async function (run|act)\(/.test(src)) expect(src).toMatch(/async function (run|act)\([^)]*\)[^{]*\{\s*(\/\/[^\n]*\n\s*)?const user = await requireRole\(/);
    }
  });

  it("chaque route API exige une session ou un secret", () => {
    const routes = files.filter((f) => f.endsWith("route.ts") && f.includes("/api/") && !f.includes("[...nextauth]"));
    expect(routes.length).toBeGreaterThan(1);
    for (const r of routes) expect(readFileSync(r, "utf8"), r).toMatch(/getActor\(|CRON_SECRET/);
  });

  it("les pages des espaces protégés appellent requireRole", () => {
    const pages = files.filter((f) => /app\/(admin|client|prestataire)\/(.*\/)?page\.tsx$/.test(f));
    expect(pages.length).toBeGreaterThan(15);
    for (const p of pages) expect(readFileSync(p, "utf8"), p).toMatch(/requireRole\(/);
  });

  it("aucun secret en dur ni variable secrète exposée au navigateur", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(SECRET|TOKEN|PASSWORD|PRIVATE)/);
      expect(src, f).not.toMatch(/(sk_live|AKIA[0-9A-Z]{16}|-----BEGIN (RSA )?PRIVATE KEY)/);
    }
  });
});
