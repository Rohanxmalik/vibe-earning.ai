import { Injectable } from "@nestjs/common";
import { PaymentProvider } from "./payment-provider";
import { StripeProvider } from "./stripe.provider";
import { RazorpayProvider } from "./razorpay.provider";

@Injectable()
export class PaymentRouter {
  constructor(
    private readonly stripe: StripeProvider,
    private readonly razorpay: RazorpayProvider,
  ) {}

  forCountry(country: string | null): PaymentProvider {
    return country === "IN" ? this.razorpay : this.stripe;
  }
}
