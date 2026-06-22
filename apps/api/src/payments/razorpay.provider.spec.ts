import { RazorpayProvider, RazorpayClient } from "./razorpay.provider";

describe("RazorpayProvider", () => {
  it("collect creates an order and returns it as pending (paid on webhook)", async () => {
    const create = jest.fn().mockResolvedValue({ id: "order_1", status: "created" });
    const p = new RazorpayProvider();
    p.setClient({ orders: { create } } as unknown as RazorpayClient);
    const r = await p.collect({ amountPaise: 50000, currency: "INR", description: "blocks:c1" });
    expect(create).toHaveBeenCalledWith({ amount: 50000, currency: "INR", notes: { description: "blocks:c1" } });
    expect(r).toEqual({ providerRef: "order_1", status: "pending" });
  });

  it("payout is not enabled until RazorpayX is wired", async () => {
    const p = new RazorpayProvider();
    p.setClient({ orders: { create: jest.fn() } } as unknown as RazorpayClient);
    await expect(p.payout({ payeeRef: "x", amountPaise: 1, currency: "INR" })).rejects.toThrow("razorpayx_not_configured");
  });

  it("throws a clear error when credentials are not configured", async () => {
    const prevId = process.env.RAZORPAY_KEY_ID;
    const prevSecret = process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    try {
      await expect(new RazorpayProvider().collect({ amountPaise: 1, currency: "INR" })).rejects.toThrow("razorpay_not_configured");
    } finally {
      if (prevId !== undefined) process.env.RAZORPAY_KEY_ID = prevId;
      if (prevSecret !== undefined) process.env.RAZORPAY_KEY_SECRET = prevSecret;
    }
  });
});
