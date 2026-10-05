"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { compressImage, uploadFile } from "@/lib/image-client";
import { fileUrl } from "@/lib/format";
import { removePropertyPhotoAction } from "@/app/admin/actions";

export function PropertyPhotosAdmin({ propertyId, keys }: { propertyId: string; keys: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setBusy(true); setErr(undefined);
    const r = await uploadFile("PROPERTY_PHOTO", await compressImage(file), { propertyId });
    setBusy(false);
    if (r.ok) router.refresh(); else setErr(r.error);
  }
  return (
    <section aria-label="Photos de l'annonce" className="space-y-2 rounded-xl2 border border-emerald-100 bg-white p-4">
      <h2 className="font-extrabold">Photos ({keys.length}/8)</h2>
      <ul className="flex flex-wrap gap-2">
        {keys.map((k) => (
          <li key={k} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl(k)} alt="Photo de l'annonce" className="h-20 w-24 rounded-xl2 object-cover" />
            <button type="button" aria-label="Supprimer la photo" disabled={pending} onClick={() => start(async () => { await removePropertyPhotoAction(propertyId, k); router.refresh(); })} className="absolute -right-2 -top-2 h-7 w-7 rounded-full bg-red-600 text-white">×</button>
          </li>
        ))}
        {keys.length < 8 && <li><label className="flex h-20 w-24 cursor-pointer items-center justify-center rounded-xl2 border-2 border-dashed border-emerald-500 text-center text-xs font-bold text-emerald-700">{busy ? "Envoi…" : "+ Photo"}<input type="file" accept="image/*" className="sr-only" aria-label="Ajouter une photo à l'annonce" onChange={onPick} disabled={busy} /></label></li>}
      </ul>
      {err && <p role="alert" className="text-sm font-semibold text-red-600">{err}</p>}
    </section>
  );
}
