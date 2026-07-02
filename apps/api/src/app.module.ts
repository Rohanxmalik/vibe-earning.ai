import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { RedisService } from "./redis/redis.service";
import { RedisThrottlerStorage } from "./common/redis-throttler.storage";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { RankingModule } from "./ranking/ranking.module";
import { ServeModule } from "./serve/serve.module";
import { AdminModule } from "./admin/admin.module";
import { MetricsModule } from "./metrics/metrics.module";
import { AuthModule } from "./auth/auth.module";
import { LedgerModule } from "./ledger/ledger.module";
import { PaymentsModule } from "./payments/payments.module";
import { AdvertiserModule } from "./advertiser/advertiser.module";
import { ConfigModule } from "./config/config.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { MeModule } from "./me/me.module";
import { ObservabilityModule } from "./observability/observability.module";
import { StatsModule } from "./stats/stats.module";
import { StorageModule } from "./storage/storage.module";

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        // Never log credentials/signatures.
        redact: [
          "req.headers.authorization",
          'req.headers["x-admin-key"]',
          'req.headers["x-razorpay-signature"]',
          'req.headers["stripe-signature"]',
        ],
      },
    }),
    // Redis-backed storage so per-IP limits are shared across all API instances.
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        throttlers: [{ ttl: 60000, limit: Number(process.env.THROTTLE_LIMIT ?? 300) }], // per-IP requests/min
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    PrismaModule, RedisModule, RankingModule, ServeModule, AdminModule, MetricsModule, AuthModule, LedgerModule, PaymentsModule, AdvertiserModule, ConfigModule, NotificationsModule, MeModule, ObservabilityModule, StatsModule, StorageModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
