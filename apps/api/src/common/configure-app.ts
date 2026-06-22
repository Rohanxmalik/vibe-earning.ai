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
  app.enableCors({
    origin: origins && origins.length > 0 ? origins : true, // reflect request origin if unset (dev)
    credentials: true,
  });
}
