import { Logo } from "@/components/ui/Logo";
import { ButtonLink, Card } from "@/components/ui";

const CATEGORIES = [
  { name: "Ménage, lessive et nettoyage", icon: "🧺", note: "Réservez un créneau" },
  { name: "Dépannage à domicile", icon: "🔧", note: "Plomberie, électricité, climatisation, serrurerie" },
  { name: "Livraison locale", icon: "🛵", note: "Dakar et Pikine" },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-md pb-24">
      <header className="flex items-center justify-between px-4 py-4">
        <Logo />
        <ButtonLink href="/connexion" variant="ghost" className="min-h-10 px-3">Connexion</ButtonLink>
      </header>
      <section className="px-4">
        <h1 className="text-3xl font-extrabold leading-tight text-emerald-800">Tous vos services, une seule maison.</h1>
        <p className="mt-2 text-ink-soft">Des prestataires vérifiés, près de chez vous, à Dakar et Pikine.</p>
        <ul className="mt-6 space-y-3">
          {CATEGORIES.map((c) => (
            <li key={c.name}>
              <Card className="flex items-center gap-4">
                <span className="text-3xl" aria-hidden>{c.icon}</span>
                <div><p className="font-extrabold">{c.name}</p><p className="text-sm text-ink-soft">{c.note}</p></div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
      <div className="fixed inset-x-0 bottom-0 border-t border-emerald-100 bg-cream/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-3">
          <ButtonLink href="/inscription" variant="accent" className="flex-1">Demander un service</ButtonLink>
          <ButtonLink href="/inscription/prestataire" variant="outline">Devenir prestataire</ButtonLink>
        </div>
      </div>
    </main>
  );
}
