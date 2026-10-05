"use client";
import { useState } from "react";
import { compressImage, uploadFile } from "@/lib/image-client";

type Item = { key: string; preview: string };

// Photos facultatives de la demande (3 max). Les clés sont envoyées avec le formulaire.
export function RequestPhotos({ error }: { error?: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setErr(undefined); setBusy(true);
    const blob = await compressImage(file);
    const r = await uploadFile("REQUEST_PHOTO", blob);
    if (r.ok && r.key) setItems((cur) => [...cur, { key: r.key!, preview: URL.createObjectURL(blob) }]);
    else if (!r.ok) setErr(r.error);
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">Photo (facultatif)</p>
      <ul className="flex flex-wrap gap-2">
        {items.map((it) => (
          <li key={it.key} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.preview} alt="Photo de la demande" className="h-20 w-20 rounded-xl2 object-cover" />
            <button type="button" aria-label="Retirer la photo" onClick={() => setItems((c) => c.filter((x) => x.key !== it.key))} className="absolute -right-2 -top-2 h-7 w-7 rounded-full bg-red-600 text-white">×</button>
            <input type="hidden" name="photoKeys" value={it.key} />
          </li>
        ))}
        {items.length < 3 && (
          <li>
            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-xl2 border-2 border-dashed border-emerald-500 text-center text-xs font-bold text-emerald-700">
              {busy ? "Envoi…" : <><span aria-hidden className="text-2xl">📷</span>Ajouter</>}
              <input type="file" accept="image/*" className="sr-only" onChange={onPick} disabled={busy} aria-label="Ajouter une photo" />
            </label>
          </li>
        )}
      </ul>
      {(err || error) && <p role="alert" className="text-sm font-semibold text-red-600">{err ?? error}</p>}
      <p className="text-sm text-ink-soft">Seul le prestataire qui accepte votre demande pourra voir la photo.</p>
    </div>
  );
}
