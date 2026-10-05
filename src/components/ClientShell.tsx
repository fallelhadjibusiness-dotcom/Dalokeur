import Link from "next/link";
import { Logo } from "./ui/Logo";
import { Button } from "./ui";
import { logoutAction } from "@/lib/session-actions";

const NAV = [
  ["/client", "Accueil", "🏠"],
  ["/client/commandes", "Commandes", "📋"],
  ["/client/portefeuille", "Portefeuille", "👛"],
];

export function ClientShell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <header className="flex items-center justify-between px-4 py-3">
        <Link href="/client" aria-label="Accueil"><Logo /></Link>
        <form action={logoutAction}><Button variant="ghost" className="min-h-10 px-3 text-sm">Déconnexion</Button></form>
      </header>
      <main className="space-y-4 px-4">
        {title && <h1 className="text-2xl font-extrabold text-emerald-800">{title}</h1>}
        {children}
      </main>
      <nav aria-label="Navigation" className="fixed inset-x-0 bottom-0 border-t border-emerald-100 bg-white">
        <ul className="mx-auto flex max-w-md">
          {NAV.map(([href, label, icon]) => (
            <li key={href} className="flex-1">
              <Link href={href} className="flex min-h-14 flex-col items-center justify-center text-xs font-bold text-emerald-800"><span aria-hidden className="text-lg">{icon}</span>{label}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
