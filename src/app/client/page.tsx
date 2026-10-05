import Link from "next/link";
import { ClientShell } from "@/components/ClientShell";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fcfa } from "@/lib/format";

export default async function ClientHome({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireRole("CLIENT");
  const q = ((await searchParams).q ?? "").trim().slice(0, 60);
  const services = await db.service.findMany({
    where: { isActive: true, category: { isLaunch: true, isActive: true }, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
    include: { category: true },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
  });
  const urgent = services.filter((s) => s.allowsUrgent && s.category.slug === "depannage-domicile");
  const points = await db.keurPoints.findUnique({ where: { userId: user.id } });
  const providers = await db.providerProfile.findMany({
    where: { status: "VERIFIED", available: true, user: { isActive: true } },
    orderBy: [{ ratingAvg: "desc" }, { missionsDone: "desc" }], take: 4,
    include: { user: { select: { fullName: true } } },
  });

  return (
    <ClientShell>
      <h1 className="text-2xl font-extrabold text-emerald-800">Bonjour {user.fullName.split(" ")[0]} 👋</h1>
      <form role="search" className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Plombier, ménage, livraison…" aria-label="Rechercher un service" className="min-h-12 flex-1 rounded-xl2 border-2 border-emerald-100 bg-white px-4" />
        <button className="min-h-12 rounded-xl2 bg-emerald-600 px-4 font-bold text-white">Chercher</button>
      </form>
      <Link href="/client/portefeuille" className="flex items-center justify-between rounded-xl2 border border-amber-400 bg-amber-100 px-4 py-3"><span className="font-bold">⭐ Points Keur</span><span className="font-extrabold text-amber-600">{points?.balance ?? 0} pts</span></Link>
      <ButtonLink href="/client/demande" variant="accent" className="w-full">Demander un service</ButtonLink>

      {urgent.length > 0 && !q && (
        <section aria-labelledby="urg"><h2 id="urg" className="mb-2 text-lg font-extrabold">🚨 Urgences à domicile</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {urgent.map((s) => <Link key={s.id} href={`/client/demande?service=${s.slug}&mode=URGENT`} className="shrink-0 rounded-full bg-amber-100 px-4 py-3 text-sm font-bold text-emerald-900">{s.name}</Link>)}
          </div>
        </section>
      )}

      <section aria-labelledby="svc"><h2 id="svc" className="mb-2 text-lg font-extrabold">Nos services</h2>
        {services.length === 0 ? <Card>Aucun service ne correspond à « {q} ».</Card> : (
          <ul className="space-y-2">
            {services.map((s) => (
              <li key={s.id}><Link href={`/client/demande?service=${s.slug}`}><Card className="flex items-center gap-3">
                <span className="text-2xl" aria-hidden>{s.category.icon}</span>
                <div className="flex-1"><p className="font-extrabold">{s.name}</p><p className="text-sm text-ink-soft">{s.priceMode === "QUOTE_AFTER_DIAGNOSIS" ? "Devis après diagnostic" : `À partir de ${fcfa(s.basePriceFcfa ?? 0)}`}</p></div>
              </Card></Link></li>
            ))}
          </ul>
        )}
      </section>

      {!q && providers.length > 0 && (
        <section aria-labelledby="rec"><h2 id="rec" className="mb-2 text-lg font-extrabold">Prestataires recommandés</h2>
          <ul className="space-y-2">
            {providers.map((p) => (
              <li key={p.id}><Card className="flex items-center justify-between">
                <div><p className="font-extrabold">{p.user.fullName}</p><p className="text-sm text-ink-soft">{p.jobTitle} · {p.zones.join(", ")}</p></div>
                <div className="text-right"><p className="font-bold">⭐ {Number(p.ratingAvg).toFixed(1)}</p><Badge>Vérifié</Badge></div>
              </Card></li>
            ))}
          </ul>
        </section>
      )}
    </ClientShell>
  );
}
