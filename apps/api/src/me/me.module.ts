import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccountDataService } from "./account-data.service";
import { MeController } from "./me.controller";

@Module({
  imports: [AuthModule],
  controllers: [MeController],
  providers: [AccountDataService],
})
export class MeModule {}
