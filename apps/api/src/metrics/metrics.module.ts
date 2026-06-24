import { Module } from "@nestjs/common";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";
import { RateLimitService } from "./rate-limit.service";
import { FraudService } from "./fraud.service";
import { FraudSweepService } from "./fraud-sweep.service";
import { UsageService } from "./usage.service";
import { UsageController } from "./usage.controller";
import { AuthModule } from "../auth/auth.module";
import { LedgerModule } from "../ledger/ledger.module";

@Module({
  imports: [AuthModule, LedgerModule],
  controllers: [MetricsController, UsageController],
  providers: [MetricsService, RateLimitService, FraudService, FraudSweepService, UsageService],
  exports: [FraudService, FraudSweepService],
})
export class MetricsModule {}
