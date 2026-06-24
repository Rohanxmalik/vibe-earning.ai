import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { configureApp } from "./common/configure-app";
import { initSentry, flushSentry } from "./common/sentry";

initSentry(); // early, before the app boots (no-op without SENTRY_DSN)

async function bootstrap() {
  // rawBody:true preserves the unparsed request body so webhook HMAC signatures
  // can be verified against the exact bytes the PSP signed.
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  app.useLogger(app.get(Logger)); // structured JSON logging via pino
  configureApp(app); // helmet + CORS

  // Graceful shutdown: on SIGTERM/SIGINT (every deploy/restart) Nest fires module
  // destroy hooks (Prisma/Redis disconnect) and we flush Sentry before exiting, so
  // in-flight work drains and the last errors aren't lost.
  app.enableShutdownHooks();
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      void (async () => {
        await app.close();
        await flushSentry();
        process.exit(0);
      })();
    });
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
