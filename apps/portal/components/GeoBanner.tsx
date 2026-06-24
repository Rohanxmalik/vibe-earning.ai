import Link from "next/link";

export interface Eligibility {
  country: string | null;
  inIndia: boolean;
  canPayout: boolean;
  reason?: string;
  payoutMinPaise: number;
}

/**
 * India-positive payout banner. For our home market (India) it reassures that
 * earnings pay out in INR via UPI. For other regions it explains the limitation.
 */
export function GeoBanner({ eligibility }: { eligibility: Eligibility | null }) {
  if (!eligibility) return null;

  if (eligibility.inIndia || eligibility.canPayout) {
    return (
      <div className="geo geo-ok" role="status">
        <span className="geo-icon" aria-hidden="true">🇮🇳</span>
        <div>
          <p className="geo-title">You&apos;re set up to get paid in India.</p>
          <p className="geo-body">
            Earnings are paid in <strong>INR straight to your UPI</strong> after a one-time KYC. No bank-account juggling, no currency conversion — built for India&apos;s developers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="geo geo-warn" role="status">
      <span className="geo-icon" aria-hidden="true">🌍</span>
      <div>
        <p className="geo-title">UPI payouts are India-only for now{eligibility.country ? ` — we detected ${eligibility.country}` : ""}.</p>
        <p className="geo-body">
          <strong>Your credit is safe and keeps accruing.</strong> Kickbacks-India pays out over UPI, so we can settle balances to Indian developers today. If your region looks wrong, it&apos;s inferred from your sign-in location — <Link href="/faq#payouts">read the payout FAQ</Link> or contact support.
        </p>
        <div className="geo-flags">
          <span className="geo-flag">IN India ✓</span>
          <span className="geo-flag">Other regions — coming later</span>
        </div>
      </div>
    </div>
  );
}
