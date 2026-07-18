import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { ui, displayFont } from "@/components/ui/kit";
import { rupees } from "@/lib/format";

export const metadata = { title: "Transparency" };
// Always read fresh, never cache a money figure.
export const dynamic = "force-dynamic";

interface PayoutProof { handle: string; amountPaise: number; method: string; at: string }
interface Transparency {
  totalPaidOutPaise: number;
  totalEarnedPaise: number;
  developersPaid: number;
  currentRatePer1kPaise: number;
  recentPayouts: PayoutProof[];
  currency: string;
}

const EMPTY: Transparency = {
  totalPaidOutPaise: 0, totalEarnedPaise: 0, developersPaid: 0,
  currentRatePer1kPaise: 0, recentPayouts: [], currency: "INR",
};

async function getTransparency(): Promise<Transparency> {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000";
  try {
    const res = await fetch(`${base}/stats/transparency`, { cache: "no-store" });
    if (!res.ok) return EMPTY;
    return { ...EMPTY, ...((await res.json()) as Partial<Transparency>) };
  } catch {
    return EMPTY;
  }
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-[#DBD9CF] bg-white p-6">
      <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#15171E]/50">{label}</div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight text-[#15171E]" style={{ fontFamily: displayFont }}>{value}</div>
      <div className="mt-1 text-sm font-medium text-black/55">{sub}</div>
    </div>
  );
}

export default async function TransparencyPage() {
  const t = await getTransparency();
  const hasPayouts = t.recentPayouts.length > 0;
  return (
    <>
      <PageHeader
        eyebrow="Transparency"
        title="Every rupee, in the open."
        subtitle="Real numbers, straight from the ledger — no marketing math. When there's nothing yet, this page says so."
      />

      <section className="bg-[#F2F1EB] py-14 md:py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="kbi-tw grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Paid to developers" value={rupees(t.totalPaidOutPaise)} sub="settled payouts, lifetime" />
            <Stat label="Earned (accrued)" value={rupees(t.totalEarnedPaise)} sub="credited to dev balances" />
            <Stat label="Developers paid" value={`${t.developersPaid}`} sub="distinct UPI/bank payouts" />
            <Stat
              label="Current rate"
              value={t.currentRatePer1kPaise > 0 ? rupees(t.currentRatePer1kPaise) : "—"}
              sub="blended, per 1,000 impressions"
            />
          </div>

          <div className="kbi-tw mt-12">
            <h2 className="text-2xl font-bold tracking-tight text-[#15171E]" style={{ fontFamily: displayFont }}>
              Payout proof
            </h2>
            <p className="mt-2 text-sm font-medium text-black/55">
              The most recent settled payouts, identities masked. This is what the ledger actually paid.
            </p>

            {hasPayouts ? (
              <div className="mt-6 overflow-hidden rounded-2xl border border-[#DBD9CF] bg-white">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#DBD9CF] font-mono text-[11px] uppercase tracking-[0.14em] text-[#15171E]/50">
                      <th className="px-5 py-3 font-semibold">Developer</th>
                      <th className="px-5 py-3 font-semibold">Method</th>
                      <th className="px-5 py-3 font-semibold">Date</th>
                      <th className="px-5 py-3 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.recentPayouts.map((p, i) => (
                      <tr key={i} className="border-b border-[#DBD9CF]/60 last:border-0">
                        <td className="px-5 py-3 font-mono text-[13px] text-[#15171E]">{p.handle}</td>
                        <td className="px-5 py-3 uppercase text-black/60">{p.method}</td>
                        <td className="px-5 py-3 text-black/60">{p.at}</td>
                        <td className="px-5 py-3 text-right font-semibold text-[#1E7A4F]">{rupees(p.amountPaise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-[#DBD9CF] bg-white p-10 text-center">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#15171E]/45">
                  No payouts yet
                </p>
                <p className="mx-auto mt-3 max-w-md text-sm font-medium text-black/60">
                  No developer has been paid yet — we won't pretend otherwise. Install the extension, keep
                  coding, and the first real UPI payout shows up here.
                </p>
                <div className="mt-6 flex justify-center">
                  <Link href="/earnings" className={ui.btnLime}>Start earning</Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
