"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { sendMessageAction } from "@/app/messages/actions";
import type { ChatMessage } from "@/lib/chat";

const POLL_MS = 5000;
const hhmm = (iso: string) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dakar" }).format(new Date(iso));

// Messagerie par polling : léger et robuste en connexion faible (pause quand l'onglet est caché).
export function Chat({ requestId, initial, canSend: initialCanSend }: { requestId: string; initial: ChatMessage[]; canSend: boolean }) {
  const [messages, setMessages] = useState(initial);
  const [canSend, setCanSend] = useState(initialCanSend);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string>();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const merge = useCallback((incoming: ChatMessage[]) => {
    setMessages((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) map.set(m.id, m); // met aussi à jour l'accusé « Lu »
      return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
  }, []);

  const poll = useCallback(async () => {
    try {
      const cur = messagesRef.current;
      // On redemande depuis le plus ancien message non lu envoyé par moi pour rafraîchir les « Lu ».
      const firstUnread = cur.find((m) => m.mine && !m.read);
      const since = firstUnread?.createdAt ?? cur[cur.length - 1]?.createdAt;
      const res = await fetch(`/api/requests/${requestId}/messages${since ? `?after=${encodeURIComponent(since)}` : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { messages: ChatMessage[]; canSend: boolean };
      merge(data.messages);
      setCanSend(data.canSend);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [requestId, merge]);

  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") void poll(); };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); window.removeEventListener("online", tick); };
  }, [poll]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true); setError(undefined);
    try {
      const r = await sendMessageAction(requestId, text);
      if (r.ok) { merge([r.message]); setText(""); } else setError(r.error);
    } catch { setError("Message non envoyé. Vérifiez votre connexion."); }
    setSending(false);
  }

  return (
    <section aria-label="Messagerie" className="rounded-xl2 border border-emerald-100 bg-white">
      <h2 className="border-b border-emerald-100 px-4 py-3 font-extrabold">💬 Messagerie</h2>
      {offline && <p role="status" className="bg-amber-100 px-4 py-2 text-sm font-bold">Hors connexion — les nouveaux messages arriveront dès que le réseau revient.</p>}
      <div className="max-h-80 space-y-2 overflow-y-auto p-3" role="log" aria-live="polite">
        {messages.length === 0 && <p className="text-center text-sm text-ink-soft">Aucun message pour le moment.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-xl2 px-3 py-2 ${m.mine ? "bg-emerald-600 text-white" : "bg-cream-100"}`}>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className={`mt-1 text-right text-[11px] ${m.mine ? "text-emerald-100" : "text-ink-soft"}`}>{hhmm(m.createdAt)}{m.mine && (m.read ? " · Lu" : " · Envoyé")}</p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {canSend ? (
        <form onSubmit={submit} className="space-y-2 border-t border-emerald-100 p-3">
          {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
          <label htmlFor={`msg-${requestId}`} className="sr-only">Votre message</label>
          <textarea id={`msg-${requestId}`} value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000} placeholder="Écrire un message…" className="w-full rounded-xl2 border-2 border-emerald-100 p-3" />
          <Button type="submit" className="w-full" disabled={sending || !text.trim()}>{sending ? "Envoi…" : "Envoyer"}</Button>
        </form>
      ) : <p className="border-t border-emerald-100 px-4 py-3 text-sm text-ink-soft">Cette conversation est en lecture seule.</p>}
    </section>
  );
}
