"use client";
// Réduit les photos avant envoi (économie de data en connexion faible) ; le ré-encodage supprime aussi l'EXIF/GPS.
export async function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    return blob && blob.size < file.size ? blob : blob ?? file;
  } catch { return file; }
}

export async function uploadFile(purpose: string, file: Blob, extra: Record<string, string> = {}): Promise<{ ok: true; key?: string } | { ok: false; error: string }> {
  const fd = new FormData();
  fd.set("purpose", purpose);
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  fd.set("file", file, (file as File).name || "photo.jpg");
  try {
    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    const data = await res.json().catch(() => null);
    return data?.ok ? { ok: true, key: data.key } : { ok: false, error: data?.error ?? "Envoi impossible. Vérifiez votre connexion." };
  } catch { return { ok: false, error: "Envoi impossible. Vérifiez votre connexion." }; }
}
