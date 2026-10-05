import { describe, expect, it } from "vitest";
import { sniff, stripMetadata } from "@/lib/uploads";
import { KEY_RE } from "@/lib/storage";

const seg = (marker: number, payload: Buffer) => Buffer.concat([Buffer.from([0xff, marker]), Buffer.from([(payload.length + 2) >> 8, (payload.length + 2) & 255]), payload]);
const SOI = Buffer.from([0xff, 0xd8]), EOI = Buffer.from([0xff, 0xd9]);
const exif = seg(0xe1, Buffer.from("Exif\0\0GPSLatitude=14.6937;GPSLongitude=-17.4441"));
const jfif = seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0"));
const sos = Buffer.concat([seg(0xda, Buffer.from([1, 1, 0, 0, 63, 0])), Buffer.from([1, 2, 3, 0xff, 0x00, 4]), EOI]);
const jpegWithGps = Buffer.concat([SOI, jfif, exif, seg(0xed, Buffer.from("IPTC")), seg(0xfe, Buffer.from("comment")), sos]);

const png = (chunks: [string, Buffer][]) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks.map(([t, d]) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); return Buffer.concat([l, Buffer.from(t, "latin1"), d, Buffer.alloc(4)]); })]);

describe("fichiers : détection par signature", () => {
  it("reconnaît JPEG, PNG, PDF ; refuse le reste, même avec la bonne extension", () => {
    expect(sniff(jpegWithGps)?.kind).toBe("jpeg");
    expect(sniff(png([["IHDR", Buffer.alloc(13)], ["IEND", Buffer.alloc(0)]]))?.kind).toBe("png");
    expect(sniff(Buffer.from("%PDF-1.7\n..."))?.kind).toBe("pdf");
    expect(sniff(Buffer.from("<?php echo 1; ?>"))).toBeNull();
    expect(sniff(Buffer.from("<svg onload=alert(1)></svg>"))).toBeNull();
    expect(sniff(Buffer.from("GIF89a...."))).toBeNull();
    expect(sniff(Buffer.alloc(0))).toBeNull();
  });
});

describe("fichiers : suppression des métadonnées GPS", () => {
  it("JPEG : EXIF/IPTC/commentaires retirés, le reste est intact", () => {
    const out = stripMetadata(jpegWithGps, "jpeg");
    expect(out.includes("GPSLatitude")).toBe(false);
    expect(out.includes("Exif")).toBe(false);
    expect(out.includes("IPTC")).toBe(false);
    expect(out.includes("comment")).toBe(false);
    expect(out.includes("JFIF")).toBe(true); // APP0 conservé
    expect(out.subarray(out.length - sos.length).equals(sos)).toBe(true); // données d'image identiques
    expect(sniff(out)?.kind).toBe("jpeg");
  });
  it("PNG : eXIf et blocs texte retirés", () => {
    const src = png([["IHDR", Buffer.alloc(13)], ["eXIf", Buffer.from("GPSLatitude")], ["tEXt", Buffer.from("Comment\0GPS")], ["IDAT", Buffer.from([1, 2, 3])], ["IEND", Buffer.alloc(0)]]);
    const out = stripMetadata(src, "png");
    expect(out.includes("GPSLatitude")).toBe(false);
    expect(out.includes("eXIf")).toBe(false);
    expect(out.includes("tEXt")).toBe(false);
    expect(out.includes("IDAT")).toBe(true);
  });
  it("fichiers tronqués ou corrompus : erreur, jamais de contenu partiel", () => {
    expect(() => stripMetadata(Buffer.concat([SOI, Buffer.from([0xff, 0xe1, 0xff, 0xff, 1])]), "jpeg")).toThrow();
    expect(() => stripMetadata(Buffer.from([0xff, 0xd8, 0xff]), "jpeg")).toThrow();
    expect(() => stripMetadata(png([["IHDR", Buffer.alloc(13)]]), "png")).toThrow();
  });
});

describe("clés de stockage", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  it("seul le format u/<uuid>/<uuid>.<ext> est accepté (pas de traversée de répertoire)", () => {
    expect(KEY_RE.test(`u/${id}/${id}.jpg`)).toBe(true);
    for (const bad of ["../etc/passwd", `u/${id}/../${id}.jpg`, `u/${id}/${id}.php`, `u/${id}/${id}.jpg/x`, "u/x/y.jpg", `/u/${id}/${id}.jpg`]) expect(KEY_RE.test(bad), bad).toBe(false);
  });
});
