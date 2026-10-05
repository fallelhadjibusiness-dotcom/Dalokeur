// Stockage de fichiers : « local » (développement et tests) ou « s3 » (Cloudflare R2 / S3, production).
// Les fichiers ne sont jamais servis directement : toujours via /api/files avec contrôle d'accès.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const KEY_RE = /^u\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|pdf)$/; // empêche toute traversée de répertoire

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

const assertKey = (key: string) => { if (!KEY_RE.test(key)) throw new Error("clé de fichier invalide"); };

class LocalStorage implements Storage {
  private dir = path.resolve(process.env.UPLOAD_DIR || ".uploads");
  private file(key: string) { assertKey(key); return path.join(this.dir, key); }
  async put(key: string, body: Buffer) { const f = this.file(key); await mkdir(path.dirname(f), { recursive: true }); await writeFile(f, body); }
  async get(key: string) { try { return await readFile(this.file(key)); } catch { return null; } }
  async delete(key: string) { await rm(this.file(key), { force: true }); }
}

class S3Storage implements Storage {
  private async client() {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const { S3_ENDPOINT, S3_REGION = "auto", S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
    if (!S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !process.env.S3_BUCKET) throw new Error("Stockage S3 non configuré (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)");
    return new S3Client({ region: S3_REGION, endpoint: S3_ENDPOINT, credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY } });
  }
  async put(key: string, body: Buffer, contentType: string) {
    assertKey(key);
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.client()).send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
  }
  async get(key: string) {
    assertKey(key);
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const r = await (await this.client()).send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
      return Buffer.from(await r.Body!.transformToByteArray());
    } catch (e) { if ((e as { name?: string }).name === "NoSuchKey") return null; throw e; }
  }
  async delete(key: string) {
    assertKey(key);
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.client()).send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
  }
}

let instance: Storage | null = null;
export function getStorage(): Storage {
  if (instance) return instance;
  const driver = process.env.STORAGE_DRIVER || "local";
  // Sur Vercel le disque est éphémère : un stockage local y perdrait les fichiers.
  if (driver === "local" && process.env.VERCEL) throw new Error("STORAGE_DRIVER=s3 requis sur Vercel (disque éphémère)");
  instance = driver === "s3" ? new S3Storage() : new LocalStorage();
  return instance;
}
