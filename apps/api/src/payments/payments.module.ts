import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LedgerModule } from "../ledger/ledger.module";
import { StripeProvider } from "./stripe.provider";
import { RazorpayProvider } from "./razorpay.provider";
import { PaymentRouter } from "./payment-router";
import { PayoutService } from "./payout.service";
import { PayoutsController } from "./payouts.controller";

@Module({
  imports: [AuthModule, LedgerModule],
  controllers: [PayoutsController],
  providers: [StripeProvider, RazorpayProvider, PaymentRouter, PayoutService],
})
export class PaymentsModule {}
