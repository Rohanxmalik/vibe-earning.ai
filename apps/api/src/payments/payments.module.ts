import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LedgerModule } from "../ledger/ledger.module";
import { StripeProvider } from "./stripe.provider";
import { RazorpayProvider } from "./razorpay.provider";
import { PaymentRouter } from "./payment-router";
import { PayoutService } from "./payout.service";
import { PayoutsController } from "./payouts.controller";
import { WebhookService } from "./webhook.service";
import { WebhookController } from "./webhook.controller";

@Module({
  imports: [AuthModule, LedgerModule],
  controllers: [PayoutsController, WebhookController],
  providers: [StripeProvider, RazorpayProvider, PaymentRouter, PayoutService, WebhookService],
  exports: [PaymentRouter],
})
export class PaymentsModule {}
