import { RazorpayProvider, RazorpayClient, mapRazorpayXPayoutStatus } from "./razorpay.provider";

function withEnv(vars: Record<string, string>, fn: () => Promise<void>) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) { prev[k] = process.env[k]; process.env[k] = vars[k]; }
  return fn().finally(() => {
    for (const k of Object.keys(vars)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; }
  });
}

describe("RazorpayProvider", () => {
  it("collect creates an order and returns it as pending (paid on webhook)", async () => {
    const create = jest.fn().mockResolvedValue({ id: "order_1", status: "created" });
    const p = new RazorpayProvider();
    p.setClient({ orders: { create } } as unknown as RazorpayClient);
    const r = await p.collect({ amountPaise: 50000, currency: "INR", description: "blocks:c1" });
    expect(create).toHaveBeenCalledWith({ amount: 50000, currency: "INR", notes: { description: "blocks:c1" } });
    expect(r).toEqual({ providerRef: "order_1", status: "pending" });
  });

  it("maps the RazorpayX payout lifecycle to our 3-state result", () => {
    expect(mapRazorpayXPayoutStatus("processed")).toBe("paid");
    expect(mapRazorpayXPayoutStatus("queued")).toBe("pending");
    expect(mapRazorpayXPayoutStatus("processing")).toBe("pending");
    expect(mapRazorpayXPayoutStatus("failed")).toBe("failed");
    expect(mapRazorpayXPayoutStatus("reversed")).toBe("failed");
  });

  it("payout calls the RazorpayX REST API and returns the mapped status", async () => {
    await withEnv({ RAZORPAY_KEY_ID: "rzp_k", RAZORPAY_KEY_SECRET: "rzp_s", RAZORPAYX_ACCOUNT_NUMBER: "409200001" }, async () => {
      const http = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "pout_1", status: "queued" }) });
      const p = new RazorpayProvider();
      p.setHttp(http);
      const r = await p.payout({ payeeRef: "fa_dev", amountPaise: 15000, currency: "INR" });
      expect(http).toHaveBeenCalledWith("https://api.razorpay.com/v1/payouts", expect.objectContaining({ method: "POST" }));
      const sent = JSON.parse(http.mock.calls[0][1].body);
      expect(sent).toMatchObject({ account_number: "409200001", fund_account_id: "fa_dev", amount: 15000, currency: "INR" });
      expect(r).toEqual({ providerRef: "pout_1", status: "pending" });
    });
  });

  it("payout throws razorpayx_not_configured when RazorpayX env is missing", async () => {
    const prevId = process.env.RAZORPAY_KEY_ID, prevSecret = process.env.RAZORPAY_KEY_SECRET, prevAcct = process.env.RAZORPAYX_ACCOUNT_NUMBER;
    delete process.env.RAZORPAY_KEY_ID; delete process.env.RAZORPAY_KEY_SECRET; delete process.env.RAZORPAYX_ACCOUNT_NUMBER;
    try {
      await expect(new RazorpayProvider().payout({ payeeRef: "x", amountPaise: 1, currency: "INR" })).rejects.toThrow("razorpayx_not_configured");
    } finally {
      if (prevId !== undefined) process.env.RAZORPAY_KEY_ID = prevId;
      if (prevSecret !== undefined) process.env.RAZORPAY_KEY_SECRET = prevSecret;
      if (prevAcct !== undefined) process.env.RAZORPAYX_ACCOUNT_NUMBER = prevAcct;
    }
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
