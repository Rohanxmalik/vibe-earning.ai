import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = {
  title: "FAQ & Fraud Ground Rules",
  description: "How earnings work on Kickbacks-India, UPI payouts, and the rules that keep every payout honest.",
};

const TOC = [
  ["s1", "How do I earn?"],
  ["s2", "What counts as a real impression?"],
  ["payouts", "When & how do I get paid? (UPI)"],
  ["fix", "Troubleshooting — ads, earnings & sign-in"],
  ["platforms", "Editors, CLIs & platforms"],
  ["account", "Managing & uninstalling"],
  ["s4", "Fraud ground rules"],
  ["s5", "How fraud detection works"],
  ["s6", "If an account is flagged"],
  ["s7", "What we collect (and never do)"],
  ["s8", "Advertisers & refunds"],
  ["s9", "Appeals & contact"],
] as const;

export default function FaqPage() {
  return (
    <>
      <PageHeader
        eyebrow="FAQ & fraud ground rules"
        title="How earnings work — and the rules that keep payouts honest."
        subtitle="Last updated: June 24, 2026 · paid in INR over UPI."
      />
      <main className="bg-white">
        <div className="measure mx-auto max-w-3xl px-6 py-12 md:py-16">
      <p>
        Kickbacks-India pays real developers a share of ad revenue for the line shown in their coding
        assistant&apos;s “thinking…” spinner. That only works if the impressions are real. Here&apos;s how
        earnings are calculated, how UPI payouts work, and the ground rules our fraud systems enforce.
      </p>

      <div className="card">
        <div className="acc-group-label" style={{ marginTop: 0 }}>Most common questions</div>
        <ul className="list">
          <li className="list-item"><Link href="#payouts">How do payouts work, and when do I get paid?</Link></li>
          <li className="list-item"><Link href="#payouts">I&apos;m in India — can I get paid? (Yes, via UPI)</Link></li>
          <li className="list-item"><Link href="#fix">I installed it but no ads show</Link></li>
          <li className="list-item"><Link href="#fix">Ads show but my earnings aren&apos;t going up</Link></li>
          <li className="list-item"><Link href="#platforms">Will it work in my editor / terminal?</Link></li>
          <li className="list-item"><Link href="#account">How do I uninstall it?</Link></li>
        </ul>
      </div>

      <nav className="card" aria-label="Table of contents">
        <div className="acc-group-label" style={{ marginTop: 0 }}>Contents</div>
        <ol className="list" style={{ counterReset: "toc" }}>
          {TOC.map(([id, label], i) => (
            <li key={id} className="list-item"><Link href={`#${id}`}>{i + 1}. {label}</Link></li>
          ))}
        </ol>
      </nav>

      <section id="s1" className="section" style={{ scrollMarginTop: "5rem" }}>
        <h2 className="section-title">1. How do I earn?</h2>
        <p>
          Install the extension, sign in, and keep coding as normal. When your AI assistant is working, the
          “thinking…” verb is replaced by a short sponsored line. You accrue credit for the time that line is
          genuinely on screen, plus any clicks. The current split is an estimated <strong>50% of the net ad
          revenue</strong> attributable to your impressions — paid in INR. There&apos;s nothing to click,
          refresh, or run on a schedule.
        </p>
        <h3>Which editors and assistants are supported?</h3>
        <p>
          The <strong>Claude Code</strong> VS Code extension and CLI are supported today. <strong>Codex</strong> is
          experimental; <strong>Cursor</strong> and <strong>OpenCode</strong> are coming. Sign in once and your
          earnings follow your account across every supported surface.
        </p>
      </section>

      <section id="s2" className="section" style={{ scrollMarginTop: "5rem" }}>
        <h2 className="section-title">2. What counts as a real impression?</h2>
        <p>An impression earns only when all of the following are true:</p>
        <ul className="col-list col-check">
          <li><span className="mark">✓</span> The ad was actually visible for at least five seconds during a live wait-state.</li>
          <li><span className="mark">✓</span> The wait came from real, human-initiated work — not a script, bot, or loop.</li>
          <li><span className="mark">✓</span> The extension is properly installed, signed in, and connected.</li>
          <li><span className="mark">✓</span> You&apos;re within the applicable per-user spacing rules and hourly/daily caps.</li>
          <li><span className="mark">✓</span> The activity isn&apos;t excluded by our fraud systems.</li>
        </ul>
        <p className="muted">We don&apos;t publish exact cap values — they move with abuse patterns — but ordinary, genuine coding never comes close to them.</p>
      </section>

      <section id="payouts" className="section" style={{ scrollMarginTop: "5rem" }}>
        <h2 className="section-title">3. When &amp; how do I get paid? (UPI)</h2>
        <p>
          Earnings accrue to your balance and are paid out over <strong>UPI</strong> once your balance crosses the
          minimum payout (currently ₹100) and you&apos;ve completed a one-time KYC. Balances are estimates until
          reconciled, and payouts can be held during a fraud review.
        </p>
        <h3 id="regions" style={{ scrollMarginTop: "5rem" }}>I&apos;m in India — can I get paid?</h3>
        <p>
          <strong>Yes — that&apos;s exactly who this is built for.</strong> Where the global Kickbacks can&apos;t pay out
          to India over Stripe, Kickbacks-India settles directly to your UPI in INR. Add your VPA, pass KYC, and cash
          out once you&apos;re over the minimum. If you&apos;re detected outside India, your credit is still safe and
          keeps accruing — we&apos;re expanding payout regions over time.
        </p>
        <p className="muted">Every payout is manually reviewed for fraud. Click-farm and bot earnings won&apos;t be paid — it keeps the split honest for everyone.</p>
      </section>

      <section id="fix" className="section" style={{ scrollMarginTop: "5rem" }}>
        <h2 className="section-title">4. Troubleshooting — ads, earnings &amp; sign-in</h2>
        <p>The single most useful first step: run <strong>“Kickbacks: Diagnose”</strong> from the command palette. It self-checks whether you&apos;re signed in, whether it found a compatible target to patch, and whether ads are serving.</p>
        <h3>I don&apos;t see any ads</h3>
        <ul>
          <li>Confirm the Claude Code (or Codex) extension is installed — Kickbacks patches it, so it must be present.</li>
          <li>Make sure you&apos;re signed in (run “Kickbacks: Sign in”). You only <em>earn</em> while signed in.</li>
          <li>The ad only replaces the verb during a genuine wait-state — if a turn finishes instantly, there&apos;s no spinner to sponsor.</li>
          <li>Reload the window after a VS Code or Claude Code update.</li>
        </ul>
        <h3>My earnings aren&apos;t moving</h3>
        <p>Usually display lag, not lost money. Your dashboard can trail live serving by a few minutes, and credit is counted in five-second view-ticks — so it moves in steps. Reload your <Link href="/earnings">dashboard</Link>; if it&apos;s genuinely flat during an active session, run Diagnose and contact support.</p>
      </section>

      <section id="platforms" className="section" style={{ scrollMarginTop: "5rem" }}>
        <h2 className="section-title">5. Editors, CLIs &amp; platforms</h2>
        <p>Kickbacks runs in two places — the editor panel and the terminal — across Claude Code (fully supported) and Codex (experimental). The VS Code build also loads over Remote-SSH, WSL, and devcontainers; install the extension in <em>that</em> host. The VS Code extension is currently required even to earn from the terminal CLI, since it&apos;s the piece that reports impressions.</p>
      </section>

      <section id="account" className="section" style={{ scrollMarginTop: "5rem" }}>
        <h2 className="section-title">6. Managing &amp; uninstalling</h2>
        <ul>
          <li><strong>Pause it.</strong> Click the Kickbacks status-bar item and choose <em>Disable</em> — the spinner returns to normal.</li>
          <li><strong>Fully revert.</strong> Run “Kickbacks: Restore Claude Code” to undo every edit byte-for-byte.</li>
          <li><strong>Uninstall.</strong> Restore first, then remove the extension like any other.</li>
        </ul>
        <p>To delete your account and data, use <strong>Delete account</strong> on your <Link href="/earnings">dashboard</Link>, or email support. We erase your personal data; financial records are retained as required by law.</p>
      </section>

      <section id="s4" className="section" style={{ scrollMarginTop: "5rem" }}>
        <h2 className="section-title">7. Fraud ground rules</h2>
        <p>These lines, if crossed, make activity non-billable and can get an account blocked. They protect the honest majority — every fake impression dilutes a real developer&apos;s share and overcharges an advertiser.</p>
        <ul>
          <li><strong>One account per person.</strong> Multiple earning accounts — alone or coordinated — are prohibited.</li>
          <li><strong>Real usage only.</strong> No automated clicking, scripted prompts, bots, or click farms.</li>
          <li><strong>No collusion or account networks.</strong> Pooling devices or identities to aggregate earnings is prohibited.</li>
          <li><strong>No tampering.</strong> Don&apos;t modify, spoof, or replay the telemetry the extension reports.</li>
          <li><strong>No circumvention.</strong> Don&apos;t evade caps or controls — including by rotating networks or devices.</li>
        </ul>
      </section>

      <section id="s5" className="section" style={{ scrollMarginTop: "5rem" }}>
        <h2 className="section-title">8. How fraud detection works</h2>
        <p>We run automated, continuously-tuned systems alongside human review. They look at the <em>shape</em> of activity, not the content of your work, and catch coordinated abuse in both directions: many accounts behind one network, and one account spread across many networks (proxy/VPN rotation). We don&apos;t publish exact thresholds. Honest use stays comfortably inside every limit; established accounts are routed to a human rather than auto-actioned.</p>
      </section>

      <section id="s6" className="section" style={{ scrollMarginTop: "5rem" }}>
        <h2 className="section-title">9. If an account is flagged</h2>
        <p>Depending on confidence, our systems flag an account for human review or block it automatically. A blocked account stops earning immediately, and credit from abusive activity is voided. Where money has already been paid out on fraudulent activity, we reserve the right to recover it.</p>
      </section>

      <section id="s7" className="section" style={{ scrollMarginTop: "5rem" }}>
        <h2 className="section-title">10. What we collect (and never do)</h2>
        <p>We collect only what&apos;s needed to credit earnings, bill advertisers, and stop fraud: ad/event identifiers, on-screen visibility metrics, a per-install ID, extension/host versions, and — for signed-in users — an account ID. For abuse detection we process your IP but store only a <strong>salted, one-way hash</strong>, never the raw IP. We do <strong>not</strong> collect your code, prompts, AI responses, files, or project contents.</p>
      </section>

      <section id="s8" className="section" style={{ scrollMarginTop: "5rem" }}>
        <h2 className="section-title">11. Advertisers &amp; refunds</h2>
        <p>Advertisers buy blocks of impressions and bid for placement priority. Because we aggressively exclude fraudulent traffic, you&apos;re billed for delivery to real developers. If impressions weren&apos;t delivered as intended — or were tainted by fraud we caught after the fact — we can issue a credit or refund. <Link href="/campaigns">Run a campaign →</Link></p>
      </section>

      <section id="s9" className="section" style={{ scrollMarginTop: "5rem" }}>
        <h2 className="section-title">12. Appeals &amp; contact</h2>
        <p>If you believe your account was flagged in error, contact us — a human will review it in good faith. Email <a href="mailto:support@kickbacks.ai">support@kickbacks.ai</a>.</p>
        <p className="muted small"><Link href="/">← Back to Kickbacks-India</Link></p>
      </section>
        </div>
      </main>
    </>
  );
}
