import { Module } from "@nestjs/common";
import { KillswitchService } from "./killswitch.service";
import { ConfigController } from "./config.controller";
import { AdminConfigController } from "./admin-config.controller";

@Module({
  controllers: [ConfigController, AdminConfigController],
  providers: [KillswitchService],
})
export class ConfigModule {}
