import { Module } from "@nestjs/common";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";
import { RateLimitService } from "./rate-limit.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [MetricsController],
  providers: [MetricsService, RateLimitService],
})
export class MetricsModule {}
