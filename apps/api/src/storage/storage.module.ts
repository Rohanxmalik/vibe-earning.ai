import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BLOB_STORAGE, createBlobStorage } from "./blob-storage";
import { UploadController } from "./upload.controller";

/** Blob storage + the logo upload/read endpoints. AuthModule supplies the AuthGuard deps. */
@Module({
  imports: [AuthModule],
  controllers: [UploadController],
  providers: [{ provide: BLOB_STORAGE, useFactory: createBlobStorage }],
})
export class StorageModule {}
