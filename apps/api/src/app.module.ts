import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { RankingModule } from "./ranking/ranking.module";
import { ServeModule } from "./serve/serve.module";
import { AdminModule } from "./admin/admin.module";
import { MetricsModule } from "./metrics/metrics.module";

@Module({
  imports: [PrismaModule, RedisModule, RankingModule, ServeModule, AdminModule, MetricsModule],
  controllers: [HealthController],
})
export class AppModule {}
