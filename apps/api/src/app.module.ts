import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
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
    PrismaModule, RedisModule, RankingModule, ServeModule, AdminModule, MetricsModule, AuthModule, LedgerModule, PaymentsModule, AdvertiserModule, ConfigModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
