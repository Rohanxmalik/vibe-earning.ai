import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { logoExtFor } from "@vibearning/shared";

export interface PutInput {
  bytes: Buffer;
  contentType: string;
}
export interface PutResult {
  /** Public URL where the object can be fetched. */
  url: string;
  /** Storage key / object name. */
  key: string;
}

/**
 * Pluggable blob store. `LocalDiskStorage` is the dev/default impl; an `S3Storage` (or any
 * S3-compatible bucket) can be dropped in behind the same interface and selected via env — see
 * `createBlobStorage`. Objects are content-addressed (sha256), so identical uploads dedupe and the
 * URL is safely cacheable forever.
 */
export interface BlobStorage {
  put(input: PutInput): Promise<PutResult>;
}

/** DI token for the active BlobStorage implementation. */
export const BLOB_STORAGE = Symbol("BLOB_STORAGE");

/** Where local-disk uploads live (shared by the writer and the GET route). */
export function localUploadDir(): string {
  return process.env.VIBEARNING_UPLOAD_DIR ?? join(process.cwd(), "uploads");
}

/** Public origin the stored URL is built on (https in prod; http://localhost in dev). */
export function publicBaseUrl(): string {
  return (process.env.VIBEARNING_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Stores objects on local disk and serves them back via `GET /uploads/:name`. */
export class LocalDiskStorage implements BlobStorage {
  constructor(
    private readonly dir = localUploadDir(),
    private readonly publicBase = publicBaseUrl(),
  ) {
    mkdirSync(this.dir, { recursive: true });
  }

  async put({ bytes, contentType }: PutInput): Promise<PutResult> {
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
    const key = `${hash}.${logoExtFor(contentType)}`;
    const path = join(this.dir, key);
    if (!existsSync(path)) writeFileSync(path, bytes); // content-addressed → write once, dedupe
    return { url: `${this.publicBase}/uploads/${key}`, key };
  }
}

/** Minimal write-side of an object store, injected so `S3Storage` is unit-testable without the SDK. */
export interface ObjectPutter {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
}

/**
 * S3 / S3-compatible storage (AWS S3, Cloudflare R2, Supabase Storage, MinIO). Objects are
 * content-addressed exactly like the disk backend; the public URL is built on `publicBase` (your
 * bucket's public URL or a CDN in front of it) — so `/serve` still carries a short URL, and reads
 * go straight to the bucket/CDN (no app round-trip, unlike the disk backend's `GET /uploads/:name`).
 */
export class S3Storage implements BlobStorage {
  constructor(
    private readonly putter: ObjectPutter,
    private readonly publicBase: string,
    private readonly prefix = "",
  ) {}

  async put({ bytes, contentType }: PutInput): Promise<PutResult> {
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
    const key = `${this.prefix}${hash}.${logoExtFor(contentType)}`;
    await this.putter.put(key, bytes, contentType);
    return { url: `${this.publicBase}/${key}`, key };
  }
}

interface S3Config {
  bucket: string;
  region?: string;
  endpoint?: string; // set for R2 / Supabase / MinIO
  forcePathStyle?: boolean; // true for R2 / MinIO
  accessKeyId?: string;
  secretAccessKey?: string;
}

/**
 * Real S3 putter. The AWS SDK is imported lazily on first write, so a disk-mode deployment never
 * loads it (smaller startup, no dependency surface unless S3 is actually used).
 */
function envS3Putter(cfg: S3Config): ObjectPutter {
  let loaded: Promise<{ send: (cmd: unknown) => Promise<unknown>; makeCmd: (i: unknown) => unknown }> | null = null;
  const load = () => {
    if (!loaded) {
      loaded = import("@aws-sdk/client-s3").then(({ S3Client, PutObjectCommand }) => {
        const client = new S3Client({
          region: cfg.region,
          endpoint: cfg.endpoint,
          forcePathStyle: cfg.forcePathStyle,
          credentials:
            cfg.accessKeyId && cfg.secretAccessKey
              ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
              : undefined, // else fall back to the default AWS credential chain (env / instance role)
        });
        return { send: (cmd) => client.send(cmd as never), makeCmd: (i) => new PutObjectCommand(i as never) };
      });
    }
    return loaded;
  };
  return {
    put: async (key, bytes, contentType) => {
      const s3 = await load();
      await s3.send(
        s3.makeCmd({ Bucket: cfg.bucket, Key: key, Body: bytes, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }),
      );
    },
  };
}

/**
 * Pick the storage backend from env (`VIBEARNING_STORAGE`): "disk" (default) or "s3". Both the s3
 * selection and its required config fail loudly, so a mis-set env can never silently fall back to
 * ephemeral local disk in production.
 */
export function createBlobStorage(): BlobStorage {
  const kind = (process.env.VIBEARNING_STORAGE ?? "disk").toLowerCase();
  if (kind === "s3") {
    const bucket = process.env.VIBEARNING_S3_BUCKET;
    const publicBase = process.env.VIBEARNING_PUBLIC_URL;
    if (!bucket) throw new Error("VIBEARNING_STORAGE=s3 requires VIBEARNING_S3_BUCKET");
    if (!publicBase) throw new Error("VIBEARNING_STORAGE=s3 requires VIBEARNING_PUBLIC_URL (public bucket/CDN base URL)");
    const putter = envS3Putter({
      bucket,
      region: process.env.VIBEARNING_S3_REGION,
      endpoint: process.env.VIBEARNING_S3_ENDPOINT || undefined,
      forcePathStyle: process.env.VIBEARNING_S3_FORCE_PATH_STYLE === "true",
      accessKeyId: process.env.VIBEARNING_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.VIBEARNING_S3_SECRET_ACCESS_KEY,
    });
    return new S3Storage(putter, publicBase.replace(/\/+$/, ""), process.env.VIBEARNING_S3_PREFIX ?? "");
  }
  return new LocalDiskStorage();
}
