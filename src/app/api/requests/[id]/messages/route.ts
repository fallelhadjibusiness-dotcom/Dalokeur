import { NextResponse } from "next/server";
import { getActor } from "@/lib/guards";
import { listMessages } from "@/lib/chat";

export const dynamic = "force-dynamic";

// Polling : GET ?after=<ISO>. Toute la vérification d'accès est dans listMessages.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const data = await listMessages(actor, id, new URL(req.url).searchParams.get("after") ?? undefined);
  if (!data) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
