/**
 * Fail-fast production secret validation (C4).
 *
 * In production the app REFUSES TO BOOT if any security-critical secret is unset or still equal to
 * a known dev/example default. Without this, an operator who forgets to set (say)
 * `RAZORPAY_WEBHOOK_SECRET` would run production verifying webhook HMACs against a secret that is
 * committed to the source tree — letting anyone forge an `order.paid` (funds escrow) or
 * `payout.processed` (settles a payout). Dev and tests are unaffected: the checks only run when
 * `NODE_ENV === "production"`.
 *
 * Webhook-secret checks are CONDITIONAL on the matching PSP being configured, so an India-only
 * deploy (Razorpay/UPI, no Stripe) isn't forced to set Stripe secrets it never uses.
 */
export interface SecretSpec {
  name: string;
  /** Known insecure values (dev/example/test defaults) that must never appear in production. */
  insecure: string[];
  /** If set, this secret is only required when `requiredWhen(env)` is true. */
  requiredWhen?: (env: NodeJS.ProcessEnv) => boolean;
}

export const REQUIRED_PROD_SECRETS: SecretSpec[] = [
  { name: "AUTH_JWT_SECRET", insecure: ["dev-jwt-secret-change-in-prod"] },
  { name: "ADMIN_API_KEY", insecure: ["dev-admin-key-local", "dev-admin-key-change-me", "test-key"] },
  { name: "FRAUD_IP_SALT", insecure: ["kbi-dev-ip-salt-change-me"] },
  {
    name: "RAZORPAY_WEBHOOK_SECRET",
    insecure: ["dev-razorpay-webhook-secret"],
    requiredWhen: (env) => Boolean(env.RAZORPAY_KEY_ID),
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    insecure: ["dev-stripe-webhook-secret"],
    requiredWhen: (env) => Boolean(env.STRIPE_SECRET_KEY),
  },
];

/** Returns a human-readable list of misconfigured secrets (empty === all good). */
export function collectSecretProblems(
  env: NodeJS.ProcessEnv = process.env,
  specs: SecretSpec[] = REQUIRED_PROD_SECRETS,
): string[] {
  const problems: string[] = [];
  for (const spec of specs) {
    if (spec.requiredWhen && !spec.requiredWhen(env)) continue; // PSP not configured — secret not needed
    const v = env[spec.name];
    if (!v || v.trim() === "") problems.push(`${spec.name} is not set`);
    else if (spec.insecure.includes(v)) problems.push(`${spec.name} is set to a known insecure default`);
  }
  return problems;
}

/** Throws in production if any required secret is unset or a known default. No-op otherwise. */
export function assertProductionSecrets(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  const problems = collectSecretProblems(env);
  if (problems.length > 0) {
    throw new Error(
      `Refusing to start: insecure production configuration —\n  - ${problems.join("\n  - ")}\n` +
        `Set these to strong, unique secrets (see .env.prod.example).`,
    );
  }
}
