import Link from "next/link";
import { Logo } from "./ui/Logo";
import { Button } from "./ui";
import { logoutAction } from "@/lib/session-actions";

const NAV = [
  ["/prestataire", "Accueil", "📊"],
  ["/prestataire/missions", "Missions", "🧰"],
  ["/prestataire/agenda", "Agenda", "📅"],
  ["/prestataire/messages", "Messages", "💬"],
  ["/prestataire/gains", "Gains", "💰"],
  ["/prestataire/profil", "Profil", "👤"],
];

export function ProviderShell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <header className="flex items-center justify-between px-4 py-3">
        <Link href="/prestataire" aria-label="Accueil prestataire"><Logo /></Link>
        <form action={logoutAction}><Button variant="ghost" className="min-h-10 px-3 text-sm">Déconnexion</Button></form>
      </header>
      <main className="space-y-4 px-4">
        {title && <h1 className="text-2xl font-extrabold text-emerald-800">{title}</h1>}
        {children}
      </main>
      <nav aria-label="Navigation prestataire" className="fixed inset-x-0 bottom-0 border-t border-emerald-100 bg-white">
        <ul className="mx-auto flex max-w-md">
          {NAV.map(([href, label, icon]) => (
            <li key={href} className="flex-1"><Link href={href} className="flex min-h-14 flex-col items-center justify-center text-[11px] font-bold text-emerald-800"><span aria-hidden className="text-lg">{icon}</span>{label}</Link></li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
