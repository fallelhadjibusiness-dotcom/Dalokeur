// Validation des fichiers par leur CONTENU (signature), pas par leur nom ni leur type déclaré,
// et suppression des métadonnées (EXIF/GPS) des photos.
export type Sniffed = { kind: "jpeg" | "png" | "pdf"; mime: string; ext: "jpg" | "png" | "pdf" };
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // sous la limite de 4,5 Mo des fonctions Vercel

export function sniff(buf: Buffer): Sniffed | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: "jpeg", mime: "image/jpeg", ext: "jpg" };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: "png", mime: "image/png", ext: "png" };
  if (buf.length > 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return { kind: "pdf", mime: "application/pdf", ext: "pdf" };
  return null;
}

// JPEG : retire APP1 (EXIF/XMP, contient le GPS), APP13 (IPTC) et les commentaires ; conserve le reste.
function stripJpeg(buf: Buffer): Buffer {
  const out: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error("JPEG invalide");
    let marker = buf[i + 1];
    while (marker === 0xff) { i++; marker = buf[i + 1]; } // octets de remplissage
    if (marker === 0xd9) { out.push(buf.subarray(i)); return Buffer.concat(out); } // EOI
    if (marker === 0xda) { out.push(buf.subarray(i)); return Buffer.concat(out); } // SOS : données d'image, on copie la suite telle quelle
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { out.push(buf.subarray(i, i + 2)); i += 2; continue; } // marqueurs sans longueur
    if (i + 4 > buf.length) throw new Error("JPEG tronqué");
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) throw new Error("JPEG corrompu");
    if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  throw new Error("JPEG sans données d'image");
}

// PNG : retire eXIf et les blocs texte (tEXt, zTXt, iTXt) ; conserve les blocs d'image.
function stripPng(buf: Buffer): Buffer {
  const out: Buffer[] = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString("latin1");
    const end = i + 12 + len;
    if (end > buf.length) throw new Error("PNG corrompu");
    if (!["eXIf", "tEXt", "zTXt", "iTXt"].includes(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === "IEND") return Buffer.concat(out);
  }
  throw new Error("PNG sans fin");
}

export function stripMetadata(buf: Buffer, kind: Sniffed["kind"]): Buffer {
  if (kind === "jpeg") return stripJpeg(buf);
  if (kind === "png") return stripPng(buf);
  return buf; // PDF : documents réservés à l'administration
}
