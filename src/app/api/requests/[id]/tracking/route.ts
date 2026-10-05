import { NextResponse } from "next/server";
import { getActor } from "@/lib/guards";
import { getLiveLocation } from "@/lib/tracking";

export const dynamic = "force-dynamic";

// Lecture de la position : client de la mission ou admin. Tout le contrôle est dans getLiveLocation.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const live = await getLiveLocation(actor, id);
  if (!live) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return NextResponse.json(live, { headers: { "Cache-Control": "no-store" } });
}
