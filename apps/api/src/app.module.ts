import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { RankingModule } from "./ranking/ranking.module";

@Module({
  imports: [PrismaModule, RedisModule, RankingModule],
  controllers: [HealthController],
})
export class AppModule {}
