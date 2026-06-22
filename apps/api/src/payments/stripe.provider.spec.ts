import { StripeProvider, StripeClient } from "./stripe.provider";

describe("StripeProvider", () => {
  it("collect creates a PaymentIntent and maps status (succeeded→paid, else pending)", async () => {
    const create = jest.fn().mockResolvedValue({ id: "pi_1", status: "requires_payment_method" });
    const p = new StripeProvider();
    p.setClient({ paymentIntents: { create }, transfers: { create: jest.fn() } } as unknown as StripeClient);
    const r = await p.collect({ amountPaise: 50000, currency: "INR", description: "blocks:c1" });
    expect(create).toHaveBeenCalledWith({ amount: 50000, currency: "inr", description: "blocks:c1" });
    expect(r).toEqual({ providerRef: "pi_1", status: "pending" });

    create.mockResolvedValue({ id: "pi_2", status: "succeeded" });
    expect(await p.collect({ amountPaise: 1, currency: "USD" })).toEqual({ providerRef: "pi_2", status: "paid" });
  });

  it("payout creates a Connect transfer to the payee", async () => {
    const create = jest.fn().mockResolvedValue({ id: "tr_1" });
    const p = new StripeProvider();
    p.setClient({ paymentIntents: { create: jest.fn() }, transfers: { create } } as unknown as StripeClient);
    const r = await p.payout({ payeeRef: "acct_dev", amountPaise: 20000, currency: "INR" });
    expect(create).toHaveBeenCalledWith({ amount: 20000, currency: "inr", destination: "acct_dev" });
    expect(r).toEqual({ providerRef: "tr_1", status: "paid" });
  });

  it("throws a clear error when STRIPE_SECRET_KEY is not configured", async () => {
    const prev = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      await expect(new StripeProvider().collect({ amountPaise: 1, currency: "INR" })).rejects.toThrow("stripe_not_configured");
    } finally {
      if (prev !== undefined) process.env.STRIPE_SECRET_KEY = prev;
    }
  });
});
