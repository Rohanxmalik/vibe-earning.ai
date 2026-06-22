import { PaymentRouter } from "./payment-router";

const stripe = { name: "stripe" } as any;
const razorpay = { name: "razorpay" } as any;

describe("PaymentRouter", () => {
  const router = new PaymentRouter(stripe, razorpay);
  it("routes India to Razorpay", () => {
    expect(router.forCountry("IN").name).toBe("razorpay");
  });
  it("routes other countries to Stripe", () => {
    expect(router.forCountry("US").name).toBe("stripe");
  });
  it("defaults unknown/null country to Stripe", () => {
    expect(router.forCountry(null).name).toBe("stripe");
  });
});
