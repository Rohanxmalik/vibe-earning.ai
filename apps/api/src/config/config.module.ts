import { Module } from "@nestjs/common";
import { AdvertiserModule } from "../advertiser/advertiser.module";
import { PaymentsModule } from "../payments/payments.module";
import { MetricsModule } from "../metrics/metrics.module";
import { AuthModule } from "../auth/auth.module";
import { KillswitchService } from "./killswitch.service";
import { AuditService } from "./audit.service";
import { ConfigController } from "./config.controller";
import { AdminConfigController } from "./admin-config.controller";

@Module({
  imports: [AdvertiserModule, PaymentsModule, MetricsModule, AuthModule],
  controllers: [ConfigController, AdminConfigController],
  providers: [KillswitchService, AuditService],
})
export class ConfigModule {}
