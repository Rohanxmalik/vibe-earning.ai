import Link from "next/link";
import { displayFont } from "@/components/ui/kit";
import { ShareActions } from "@/components/ShareActions";

export const metadata = {
  title: "I earned while my AI was thinking",
  description: "Developers earn from the sponsored line their AI coding agent shows while it works — paid in INR over UPI.",
};

/** Parse a non-negative integer paise value from a query param (defends against junk/negatives). */
function paise(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function rupees(p: number): string {
  return `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Shareable earnings card. The amount comes from the developer's OWN dashboard (real
 * stats.lifetimePaise passed as ?amt=), so sharing it is honest self-reporting. Zero renders a
 * "just getting started" variant instead of a fake number.
 */
export default async function SharePage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const amt = paise(sp.amt);
  const imps = paise(sp.imp);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vibearning.in";
  const caption = amt > 0
    ? `I earned ${rupees(amt)} on vibearning — just from the sponsored line my AI coding agent shows while it thinks. Paid in INR, straight to UPI.`
    : `My AI coding agent's "thinking…" spinner now pays me — in INR, straight to UPI. Earning with vibearning.`;

  return (
    <section className="kbi-tw flex min-h-[70vh] items-center justify-center bg-[#F2F1EB] px-6 py-16">
      <div className="w-full max-w-xl">
        <div className="overflow-hidden rounded-3xl border border-[#DBD9CF] bg-white">
          <div className="bg-[#15171E] px-8 py-6">
            <span className="flex items-baseline gap-1 text-lg font-bold tracking-tight text-white" style={{ fontFamily: displayFont }}>
              vibearning
              <span aria-hidden className="inline-block h-[0.8em] w-[0.4em] translate-y-[0.06em] bg-[#FFB300]" />
            </span>
          </div>
          <div className="px-8 py-10 text-center">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[#15171E]/50">
              {amt > 0 ? "Earned while my AI was thinking" : "Getting paid while my AI thinks"}
            </p>
            <div className="mt-4 text-[clamp(2.5rem,10vw,4.5rem)] font-extrabold leading-none tracking-tight text-[#15171E]" style={{ fontFamily: displayFont }}>
              {amt > 0 ? rupees(amt) : "₹—"}
            </div>
            <p className="mt-4 text-sm font-medium text-black/60">
              {amt > 0 ? (
                <>from one tasteful sponsored line in the spinner{imps > 0 ? ` · ${imps.toLocaleString("en-IN")} verified impressions` : ""} — paid over UPI.</>
              ) : (
                <>The &ldquo;thinking…&rdquo; spinner shows one sponsored line, and I keep 50% — paid in INR.</>
              )}
            </p>
          </div>
        </div>

        <ShareActions caption={caption} url={site} />

        <p className="mt-8 text-center text-sm text-black/55">
          Want your own?{" "}
          <Link href="/earnings" className="font-semibold text-[#15171E] underline decoration-[#FFB300] decoration-2 underline-offset-2">
            Start earning →
          </Link>
        </p>
      </div>
    </section>
  );
}
