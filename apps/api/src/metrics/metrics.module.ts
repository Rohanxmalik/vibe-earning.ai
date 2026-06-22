import { Module } from "@nestjs/common";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";
import { RateLimitService } from "./rate-limit.service";

@Module({ controllers: [MetricsController], providers: [MetricsService, RateLimitService] })
export class MetricsModule {}
