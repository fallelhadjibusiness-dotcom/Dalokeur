import Link from "next/link";
import { Logo } from "./ui/Logo";
import { Button } from "./ui";
import { logoutAction } from "@/lib/session-actions";

const NAV = [
  ["/admin", "Tableau de bord"], ["/admin/demandes", "Demandes"], ["/admin/prestataires", "Prestataires"], ["/admin/utilisateurs", "Comptes"],
  ["/admin/avis", "Avis"], ["/admin/litiges", "Litiges"], ["/admin/services", "Services"], ["/admin/immobilier", "Immobilier"], ["/admin/parametres", "Paramètres"], ["/admin/journal", "Journal"], ["/admin/securite", "Sécurité"],
];

export function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-3xl pb-10">
      <header className="flex items-center justify-between px-4 py-3">
        <Link href="/admin" aria-label="Administration"><Logo /></Link>
        <form action={logoutAction}><Button variant="ghost" className="min-h-10 px-3 text-sm">Déconnexion</Button></form>
      </header>
      <nav aria-label="Administration" className="flex gap-2 overflow-x-auto px-4 pb-3">
        {NAV.map(([href, label]) => <Link key={href} href={href} className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-bold text-emerald-800 shadow-sm">{label}</Link>)}
      </nav>
      <main className="space-y-4 px-4">
        <h1 className="text-2xl font-extrabold text-emerald-800">{title}</h1>
        {children}
      </main>
    </div>
  );
}
