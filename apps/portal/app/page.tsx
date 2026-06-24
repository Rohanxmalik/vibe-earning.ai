import Link from "next/link";

export default function Home() {
  return (
    <>
      <section className="hero">
        <span className="eyebrow">Ad marketplace for AI coding agents</span>
        <h1>Get paid while your AI thinks.</h1>
        <p className="lede">
          Kickbacks-India places one tasteful sponsored line in the spinner of AI coding
          agents — Claude Code, Codex, Gemini — and pays the developers who see it, straight
          to their UPI. Advertisers reach developers at their most focused moment.
        </p>
        <div className="row" style={{ marginTop: "1.25rem" }}>
          <Link href="/earnings" className="btn btn-primary">Earn as a developer</Link>
          <Link href="/login" className="btn btn-ghost">Advertise with us</Link>
        </div>
      </section>

      <section className="section">
        <div className="section-title">How it works</div>
        <p className="section-sub">No ads while you type. One line, only while the agent is busy — and a global killswitch can stop serving instantly.</p>
        <div className="steps">
          <div className="step">
            <div className="step-num">1</div>
            <h3>Install &amp; sign in</h3>
            <p>Add the extension (or status-line script) and create a free developer account.</p>
          </div>
          <div className="step">
            <div className="step-num">2</div>
            <h3>Your AI works, you earn</h3>
            <p>While the agent is thinking, one sponsored line shows. Verified, viewable impressions earn you a share of the revenue.</p>
          </div>
          <div className="step">
            <div className="step-num">3</div>
            <h3>Cash out to UPI</h3>
            <p>Link your UPI, pass a quick KYC, and withdraw your balance once you cross the minimum.</p>
          </div>
        </div>
      </section>

      <div className="grid">
        <div className="card">
          <h2>For developers</h2>
          <p className="muted small">
            Turn idle spinner time into income. Fair, second-price pricing means advertisers
            compete for your attention — and you keep a real share. Built for India: paid in INR.
          </p>
          <Link href="/earnings" className="btn btn-ghost btn-sm">View earnings →</Link>
        </div>
        <div className="card">
          <h2>For advertisers</h2>
          <p className="muted small">
            Reach developers at peak focus. Set a bid, fund a campaign, pay only for verified
            impressions. Top bidders rotate in the spinner; creative is moderated before it serves.
          </p>
          <Link href="/login" className="btn btn-ghost btn-sm">Sign in / Register →</Link>
        </div>
      </div>

      <section className="section">
        <div className="section-title">Questions</div>
        <div className="card">
          <div className="faq-item">
            <div className="faq-q">Will this slow down or clutter my editor?</div>
            <div className="faq-a">No. It shows a single line only while your agent is already waiting — never while you type — and falls back to nothing on any error.</div>
          </div>
          <div className="faq-item">
            <div className="faq-q">How do I get paid?</div>
            <div className="faq-a">Earnings accrue per verified impression and are withdrawable to UPI after a one-time KYC, once you pass the minimum payout.</div>
          </div>
          <div className="faq-item">
            <div className="faq-q">Is my data safe?</div>
            <div className="faq-a">We store the minimum needed to run the marketplace and prevent fraud (we hash IPs, never store them raw). You can export or delete your data anytime.</div>
          </div>
        </div>
      </section>

      <div className="cta-band">
        <h2>Start earning while your AI thinks.</h2>
        <p className="muted">Free for developers. Two minutes to set up.</p>
        <div className="row" style={{ justifyContent: "center", marginTop: "0.75rem" }}>
          <Link href="/earnings" className="btn btn-primary">Create a developer account</Link>
        </div>
      </div>

      <p className="muted small" style={{ marginTop: "1rem" }}>
        Staff: <Link href="/admin">open the operations console</Link>.
      </p>
    </>
  );
}
