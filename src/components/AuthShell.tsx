import Link from "next/link";
import { Logo } from "./ui/Logo";

export function AuthShell({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <Link href="/" aria-label="Accueil"><Logo /></Link>
      <h1 className="mt-6 text-2xl font-extrabold text-emerald-800">{title}</h1>
      <div className="mt-4">{children}</div>
      {footer && <p className="mt-6 text-center text-sm text-ink-soft">{footer}</p>}
      <p className="mt-4 text-center text-sm"><Link href="/confidentialite" className="font-bold text-emerald-700 underline">Confidentialité</Link></p>
    </main>
  );
}
