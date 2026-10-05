import { Logo } from "@/components/ui/Logo";

export const metadata = { title: "Hors connexion — Dalokeur" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="text-2xl font-extrabold text-emerald-800">Vous êtes hors connexion</h1>
      <p className="text-ink-soft">Vérifiez votre connexion internet puis réessayez. Vos demandes en cours ne sont pas perdues.</p>
      <a href="/client" className="inline-flex min-h-12 items-center rounded-xl2 bg-emerald-600 px-5 font-bold text-white">Réessayer</a>
    </main>
  );
}
