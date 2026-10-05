import { NextResponse } from "next/server";
import { getActor } from "@/lib/guards";
import { sameOrigin } from "@/lib/http";
import { addProviderDocument, addPropertyPhoto, setAvatar, storeUpload } from "@/lib/files";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads";

export const dynamic = "force-dynamic";
const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

// POST multipart : purpose = REQUEST_PHOTO | PROVIDER_DOC | AVATAR | PROPERTY_PHOTO (+ kind / propertyId). Tout est revérifié côté serveur.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Requête refusée.", 403);
  const actor = await getActor();
  if (!actor) return fail("Session expirée. Reconnectez-vous.", 401);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 100_000) return fail("Fichier trop lourd (4 Mo maximum).", 413);
  let form: FormData;
  try { form = await req.formData(); } catch { return fail("Envoi invalide."); }
  const file = form.get("file");
  if (!(file instanceof File)) return fail("Aucun fichier reçu.");
  if (file.size > MAX_UPLOAD_BYTES) return fail("Fichier trop lourd (4 Mo maximum).", 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  const purpose = String(form.get("purpose") ?? "");

  switch (purpose) {
    case "REQUEST_PHOTO": {
      const r = await storeUpload(actor, "REQUEST_PHOTO", bytes);
      return r.ok ? NextResponse.json({ ok: true, key: r.key }) : fail(r.error);
    }
    case "PROVIDER_DOC": { const r = await addProviderDocument(actor, String(form.get("kind") ?? ""), bytes); return r.ok ? NextResponse.json({ ok: true }) : fail(r.error); }
    case "AVATAR": { const r = await setAvatar(actor, bytes); return r.ok ? NextResponse.json({ ok: true }) : fail(r.error); }
    case "PROPERTY_PHOTO": {
      if (actor.role !== "ADMIN") return fail("Action non autorisée.", 403);
      const r = await addPropertyPhoto(actor.id, String(form.get("propertyId") ?? ""), bytes);
      return r.ok ? NextResponse.json({ ok: true }) : fail(r.error);
    }
    default: return fail("Finalité inconnue.");
  }
}
