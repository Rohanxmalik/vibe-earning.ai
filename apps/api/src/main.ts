import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { configureApp } from "./common/configure-app";

async function bootstrap() {
  // rawBody:true preserves the unparsed request body so webhook HMAC signatures
  // can be verified against the exact bytes the PSP signed.
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  app.useLogger(app.get(Logger)); // structured JSON logging via pino
  configureApp(app); // helmet + CORS
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
