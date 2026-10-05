import Link from "next/link";
import { auth } from "@/auth";
import { unreadCount } from "@/lib/notifications";

export async function NotificationBell({ href }: { href: string }) {
  const session = await auth();
  const n = session?.user ? await unreadCount(session.user.id) : 0;
  return (
    <Link href={href} aria-label={n ? `Notifications, ${n} non lue(s)` : "Notifications"} className="relative inline-flex min-h-10 min-w-10 items-center justify-center text-xl">
      🔔{n > 0 && <span className="absolute right-0 top-0 min-w-5 rounded-full bg-amber-500 px-1 text-center text-xs font-extrabold text-emerald-900">{n > 9 ? "9+" : n}</span>}
    </Link>
  );
}
