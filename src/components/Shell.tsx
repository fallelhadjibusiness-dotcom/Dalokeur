import { Logo } from "./ui/Logo";
import { Button } from "./ui";
import { logoutAction } from "@/lib/session-actions";

export function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-md px-4 py-4">
      <header className="flex items-center justify-between">
        <Logo />
        <form action={logoutAction}><Button variant="ghost" className="min-h-10 px-3">Déconnexion</Button></form>
      </header>
      <h1 className="mt-6 text-2xl font-extrabold text-emerald-800">{title}</h1>
      <div className="mt-4 space-y-4">{children}</div>
    </main>
  );
}
