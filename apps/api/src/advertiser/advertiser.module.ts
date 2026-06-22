import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LedgerModule } from "../ledger/ledger.module";
import { PaymentsModule } from "../payments/payments.module";
import { AdvertiserAuthService } from "./advertiser-auth.service";
import { AdvertiserAuthController } from "./advertiser-auth.controller";
import { CampaignService } from "./campaign.service";
import { BlockPurchaseService } from "./block-purchase.service";
import { CampaignStatsService } from "./campaign-stats.service";
import { AdvertiserController } from "./advertiser.controller";

@Module({
  imports: [AuthModule, LedgerModule, PaymentsModule],
  controllers: [AdvertiserAuthController, AdvertiserController],
  providers: [AdvertiserAuthService, CampaignService, BlockPurchaseService, CampaignStatsService],
  exports: [CampaignService],
})
export class AdvertiserModule {}
