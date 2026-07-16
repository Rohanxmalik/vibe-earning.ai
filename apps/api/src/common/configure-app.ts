import type { INestApplication } from "@nestjs/common";
import helmet from "helmet";

/**
 * Applies HTTP hardening shared by production bootstrap and the security e2e:
 * helmet security headers + configurable CORS. Kept as a function so both paths
 * exercise the exact same config.
 */
export function configureApp(app: INestApplication): void {
  app.use(helmet());

  const origins = process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean);
  const isProd = process.env.NODE_ENV === "production";
  // Fail CLOSED in production: if CORS_ORIGINS is unset we deny all cross-origin requests
  // rather than reflecting the caller's Origin with credentials (which an unset var used to do).
  // Only local dev reflects the request origin for convenience.
  app.enableCors({
    origin: origins && origins.length > 0 ? origins : isProd ? false : true,
    credentials: true,
  });
}
