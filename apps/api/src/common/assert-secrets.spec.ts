import { collectSecretProblems, assertProductionSecrets } from "./assert-secrets";

const goodProd = (): NodeJS.ProcessEnv => ({
  NODE_ENV: "production",
  AUTH_JWT_SECRET: "a-strong-unique-jwt-secret",
  ADMIN_API_KEY: "a-strong-unique-admin-key",
  FRAUD_IP_SALT: "a-strong-unique-salt",
});

describe("assert-secrets (C4)", () => {
  it("passes when all required secrets are strong and no PSP is configured", () => {
    expect(collectSecretProblems(goodProd())).toEqual([]);
    expect(() => assertProductionSecrets(goodProd())).not.toThrow();
  });

  it("flags an unset required secret", () => {
    const env = goodProd();
    delete env.AUTH_JWT_SECRET;
    expect(collectSecretProblems(env)).toContain("AUTH_JWT_SECRET is not set");
  });

  it("flags a known insecure default", () => {
    const env = { ...goodProd(), ADMIN_API_KEY: "dev-admin-key-local" };
    expect(collectSecretProblems(env)).toContain("ADMIN_API_KEY is set to a known insecure default");
  });

  it("requires the Razorpay webhook secret only when Razorpay is configured", () => {
    const withRzp = { ...goodProd(), RAZORPAY_KEY_ID: "rzp_live_x" };
    expect(collectSecretProblems(withRzp)).toContain("RAZORPAY_WEBHOOK_SECRET is not set");
    // With a strong secret set, no problem.
    expect(collectSecretProblems({ ...withRzp, RAZORPAY_WEBHOOK_SECRET: "strong-rzp-wh" })).toEqual([]);
  });

  it("requires the Stripe webhook secret only when Stripe is configured", () => {
    const withStripe = { ...goodProd(), STRIPE_SECRET_KEY: "sk_live_x" };
    expect(collectSecretProblems(withStripe)).toContain("STRIPE_WEBHOOK_SECRET is not set");
  });

  it("does not require PSP webhook secrets when no PSP is configured (India-only can skip Stripe)", () => {
    expect(collectSecretProblems(goodProd())).toEqual([]);
  });

  it("is a no-op outside production", () => {
    expect(() => assertProductionSecrets({ NODE_ENV: "development" })).not.toThrow();
    expect(() => assertProductionSecrets({})).not.toThrow();
  });

  it("throws with all problems listed in production", () => {
    expect(() => assertProductionSecrets({ NODE_ENV: "production" })).toThrow(/Refusing to start/);
  });
});
