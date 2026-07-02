import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Post,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { createReadStream, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { z } from "zod";
import { parseImageDataUrl, LOGO_MAX_BYTES } from "@vibearning/shared";
import { AuthGuard } from "../auth/auth.guard";
import { BLOB_STORAGE, type BlobStorage, localUploadDir } from "./blob-storage";

const uploadBody = z.object({ dataUrl: z.string() });

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

@Controller("uploads")
export class UploadController {
  constructor(@Inject(BLOB_STORAGE) private readonly storage: BlobStorage) {}

  /**
   * Authenticated logo upload. Takes the `data:image/…` URI the portal already builds from the
   * picked/dropped file, validates type + size server-side (never trust the client), stores it,
   * and returns the public URL the campaign keeps in `iconUrl` — so `/serve` carries a short URL
   * instead of a fat inline blob.
   */
  @Post("logo")
  @UseGuards(AuthGuard)
  async uploadLogo(@Body() raw: unknown): Promise<{ url: string }> {
    const parsed = uploadBody.safeParse(raw);
    if (!parsed.success) throw new BadRequestException("dataUrl is required");
    const img = parseImageDataUrl(parsed.data.dataUrl);
    if (!img) throw new BadRequestException("not a supported image data URI");
    if (img.byteLength > LOGO_MAX_BYTES) throw new BadRequestException("image too large (max 32KB)");
    const { url } = await this.storage.put({ bytes: Buffer.from(img.base64, "base64"), contentType: img.contentType });
    return { url };
  }

  /**
   * Public read for local-disk storage. Object names are content-addressed (32 hex chars + ext),
   * so the strict regex both routes valid keys and blocks path traversal. Served cross-origin +
   * immutable so the extension webview and portal can embed and cache it.
   */
  @Get(":name")
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  @Header("Cross-Origin-Resource-Policy", "cross-origin") // embeddable by the extension webview
  serve(@Param("name") name: string): StreamableFile {
    if (!/^[a-f0-9]{32}\.(png|jpg|gif|webp|svg)$/.test(name)) throw new NotFoundException();
    const path = join(localUploadDir(), name);
    if (!existsSync(path)) throw new NotFoundException();
    const type = CONTENT_TYPE_BY_EXT[extname(name).slice(1)] ?? "application/octet-stream";
    return new StreamableFile(createReadStream(path), { type });
  }
}
