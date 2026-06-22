import { Module } from "@nestjs/common";
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

@Module({
  imports: [PrismaModule, RedisModule, RankingModule, ServeModule, AdminModule, MetricsModule, AuthModule, LedgerModule, PaymentsModule],
  controllers: [HealthController],
})
export class AppModule {}
