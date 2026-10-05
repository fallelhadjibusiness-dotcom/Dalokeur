"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Card } from "@/components/ui";
import { compressImage, uploadFile } from "@/lib/image-client";
import { fileUrl } from "@/lib/format";

const DOC_KINDS = ["CNI", "Justificatif de métier", "Casier judiciaire", "Autre"];
const DOC_STATUS = { PENDING: ["En attente", "amber"], APPROVED: ["Accepté", "green"], REJECTED: ["Refusé", "red"] } as const;

export function ProfileMedia({ avatarKey, docs }: { avatarKey: string | null; docs: { id: string; kind: string; status: keyof typeof DOC_STATUS }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"avatar" | "doc" | null>(null);
  const [err, setErr] = useState<string>();
  const [kind, setKind] = useState(DOC_KINDS[0]);

  async function send(purpose: "AVATAR" | "PROVIDER_DOC", file: File | undefined, extra: Record<string, string> = {}) {
    if (!file) return;
    setErr(undefined); setBusy(purpose === "AVATAR" ? "avatar" : "doc");
    const r = await uploadFile(purpose, await compressImage(file), extra);
    setBusy(null);
    if (r.ok) router.refresh(); else setErr(r.error);
  }

  return (
    <div className="space-y-3">
      <Card className="flex items-center gap-4">
        {avatarKey ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={fileUrl(avatarKey)} alt="Ma photo de profil" className="h-20 w-20 rounded-full object-cover" /> : <span aria-hidden className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-3xl">👤</span>}
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl2 border-2 border-emerald-600 px-4 font-bold text-emerald-700">
          {busy === "avatar" ? "Envoi…" : avatarKey ? "Changer ma photo" : "Ajouter ma photo"}
          <input type="file" accept="image/*" className="sr-only" aria-label="Photo de profil" disabled={busy !== null} onChange={(e) => { void send("AVATAR", e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </Card>
      <Card className="space-y-3">
        <p className="font-bold">Documents de vérification</p>
        <p className="text-sm text-ink-soft">🔒 Visibles uniquement par l'administrateur. Photo (JPEG, PNG) ou PDF, 4 Mo maximum.</p>
        {docs.length > 0 && <ul className="space-y-1">{docs.map((d) => <li key={d.id} className="flex items-center justify-between"><span>{d.kind}</span><Badge tone={DOC_STATUS[d.status][1]}>{DOC_STATUS[d.status][0]}</Badge></li>)}</ul>}
        <div className="flex gap-2">
          <select aria-label="Type de document" value={kind} onChange={(e) => setKind(e.target.value)} className="min-h-11 flex-1 rounded-xl2 border-2 border-emerald-100 bg-white px-3 text-sm">{DOC_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl2 bg-emerald-600 px-4 font-bold text-white">
            {busy === "doc" ? "Envoi…" : "Envoyer"}
            <input type="file" accept="image/*,application/pdf" className="sr-only" aria-label="Envoyer un document" disabled={busy !== null} onChange={(e) => { void send("PROVIDER_DOC", e.target.files?.[0], { kind }); e.target.value = ""; }} />
          </label>
        </div>
        {err && <p role="alert" className="text-sm font-semibold text-red-600">{err}</p>}
      </Card>
    </div>
  );
}
