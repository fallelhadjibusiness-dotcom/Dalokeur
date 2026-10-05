import { NextResponse } from "next/server";
import { getActor } from "@/lib/guards";
import { readFile } from "@/lib/files";

export const dynamic = "force-dynamic";

// Lecture contrôlée : session obligatoire puis règle d'accès propre à chaque fichier. Réponse 404 uniforme (pas d'indice sur l'existence).
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { key } = await params;
  const f = await readFile(actor, key.join("/"));
  if (!f) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return new Response(new Uint8Array(f.bytes), {
    headers: {
      "Content-Type": f.contentType,
      "Content-Length": String(f.bytes.length),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      // Un PDF ou une image ne doit jamais pouvoir exécuter de script dans notre origine.
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      "Content-Disposition": f.contentType === "application/pdf" ? "attachment" : "inline",
    },
  });
}
