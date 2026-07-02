import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDiskStorage, S3Storage, createBlobStorage, type ObjectPutter } from "./blob-storage";

describe("LocalDiskStorage", () => {
  const dir = mkdtempSync(join(tmpdir(), "kbi-blob-"));
  const storage = new LocalDiskStorage(dir, "http://localhost:3000");

  it("writes a content-addressed object and returns its public URL", async () => {
    const bytes = Buffer.from("<svg/>", "utf8");
    const { url, key } = await storage.put({ bytes, contentType: "image/svg+xml" });
    expect(key).toMatch(/^[a-f0-9]{32}\.svg$/);
    expect(url).toBe(`http://localhost:3000/uploads/${key}`);
    expect(existsSync(join(dir, key))).toBe(true);
    expect(readFileSync(join(dir, key))).toEqual(bytes);
  });

  it("is content-addressed: identical bytes dedupe to the same key", async () => {
    const a = await storage.put({ bytes: Buffer.from("same"), contentType: "image/png" });
    const b = await storage.put({ bytes: Buffer.from("same"), contentType: "image/png" });
    expect(a.key).toBe(b.key);
    const c = await storage.put({ bytes: Buffer.from("different"), contentType: "image/png" });
    expect(c.key).not.toBe(a.key);
  });

  it("maps the content type to the right extension", async () => {
    const { key } = await storage.put({ bytes: Buffer.from("x"), contentType: "image/jpeg" });
    expect(key.endsWith(".jpg")).toBe(true);
  });
});

describe("S3Storage", () => {
  /** A fake object store so we exercise the storage logic without the AWS SDK / network. */
  function fakePutter() {
    const puts: { key: string; contentType: string; len: number }[] = [];
    const putter: ObjectPutter = { put: async (key, bytes, contentType) => { puts.push({ key, contentType, len: bytes.length }); } };
    return { putter, puts };
  }

  it("writes a content-addressed object under the prefix and returns its public (CDN) URL", async () => {
    const { putter, puts } = fakePutter();
    const storage = new S3Storage(putter, "https://cdn.vibearning.in", "logos/");
    const { url, key } = await storage.put({ bytes: Buffer.from("<svg/>"), contentType: "image/svg+xml" });
    expect(key).toMatch(/^logos\/[a-f0-9]{32}\.svg$/);
    expect(url).toBe(`https://cdn.vibearning.in/${key}`);
    expect(puts).toEqual([{ key, contentType: "image/svg+xml", len: 6 }]);
  });

  it("is content-addressed: identical bytes dedupe to the same key", async () => {
    const { putter } = fakePutter();
    const storage = new S3Storage(putter, "https://cdn.x", "");
    const a = await storage.put({ bytes: Buffer.from("same"), contentType: "image/png" });
    const b = await storage.put({ bytes: Buffer.from("same"), contentType: "image/png" });
    expect(a.key).toBe(b.key);
  });
});

describe("createBlobStorage", () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of ["VIBEARNING_STORAGE", "VIBEARNING_S3_BUCKET", "VIBEARNING_PUBLIC_URL"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("defaults to local disk", () => {
    delete process.env.VIBEARNING_STORAGE;
    expect(createBlobStorage()).toBeInstanceOf(LocalDiskStorage);
  });

  it("s3 selected but missing bucket → fails loudly (no silent disk fallback)", () => {
    process.env.VIBEARNING_STORAGE = "s3";
    delete process.env.VIBEARNING_S3_BUCKET;
    expect(() => createBlobStorage()).toThrow(/VIBEARNING_S3_BUCKET/);
  });

  it("s3 with a bucket but no public URL → fails loudly", () => {
    process.env.VIBEARNING_STORAGE = "s3";
    process.env.VIBEARNING_S3_BUCKET = "my-bucket";
    delete process.env.VIBEARNING_PUBLIC_URL;
    expect(() => createBlobStorage()).toThrow(/VIBEARNING_PUBLIC_URL/);
  });

  it("s3 fully configured → returns an S3Storage (SDK not loaded until first upload)", () => {
    process.env.VIBEARNING_STORAGE = "s3";
    process.env.VIBEARNING_S3_BUCKET = "my-bucket";
    process.env.VIBEARNING_PUBLIC_URL = "https://cdn.vibearning.in";
    expect(createBlobStorage()).toBeInstanceOf(S3Storage);
  });
});
