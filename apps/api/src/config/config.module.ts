import { Module } from "@nestjs/common";
import { AdvertiserModule } from "../advertiser/advertiser.module";
import { PaymentsModule } from "../payments/payments.module";
import { KillswitchService } from "./killswitch.service";
import { ConfigController } from "./config.controller";
import { AdminConfigController } from "./admin-config.controller";

@Module({
  imports: [AdvertiserModule, PaymentsModule],
  controllers: [ConfigController, AdminConfigController],
  providers: [KillswitchService],
})
export class ConfigModule {}
