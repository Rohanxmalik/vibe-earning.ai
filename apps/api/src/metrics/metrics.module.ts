import { Module } from "@nestjs/common";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";
import { RateLimitService } from "./rate-limit.service";
import { FraudService } from "./fraud.service";
import { AuthModule } from "../auth/auth.module";
import { LedgerModule } from "../ledger/ledger.module";

@Module({
  imports: [AuthModule, LedgerModule],
  controllers: [MetricsController],
  providers: [MetricsService, RateLimitService, FraudService],
})
export class MetricsModule {}
