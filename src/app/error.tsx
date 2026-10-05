"use client";
import { Logo } from "@/components/ui/Logo";

// Message volontairement générique : aucun détail technique n'est montré à l'utilisateur.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="text-2xl font-extrabold text-emerald-800">Un problème est survenu</h1>
      <p className="text-ink-soft">Veuillez réessayer. Si le problème continue, contactez l'assistance Dalokeur.</p>
      <button onClick={reset} className="min-h-12 rounded-xl2 bg-emerald-600 px-5 font-bold text-white">Réessayer</button>
    </main>
  );
}
