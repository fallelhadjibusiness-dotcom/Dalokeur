import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="text-2xl font-extrabold text-emerald-800">Page introuvable</h1>
      <p className="text-ink-soft">Cette page n'existe pas ou n'est pas accessible avec votre compte.</p>
      <Link href="/" className="inline-flex min-h-12 items-center rounded-xl2 bg-emerald-600 px-5 font-bold text-white">Retour à l'accueil</Link>
    </main>
  );
}
