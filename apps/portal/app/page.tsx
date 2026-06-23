import Link from "next/link";

export default function Home() {
  return (
    <>
      <section className="hero">
        <span className="eyebrow">Ad marketplace for AI coding agents</span>
        <h1>Sponsor the line developers watch while their AI thinks.</h1>
        <p className="lede">
          Kickbacks-India places one tasteful sponsored line in the spinner of AI coding
          agents — and pays the developers who see it, straight to their UPI.
        </p>
        <div className="row" style={{ marginTop: "1.25rem" }}>
          <Link href="/login" className="btn btn-primary">Advertise with us</Link>
          <Link href="/earnings" className="btn btn-ghost">Earn as a developer</Link>
        </div>
      </section>

      <div className="grid">
        <div className="card">
          <h2>For advertisers</h2>
          <p className="muted small">
            Reach developers at their most focused moment. Set your bid, fund a campaign,
            and pay only for verified, viewable impressions. Top bidders rotate in the spinner.
          </p>
          <Link href="/login" className="btn btn-ghost btn-sm">Sign in / Register →</Link>
        </div>

        <div className="card">
          <h2>For developers</h2>
          <p className="muted small">
            Already use Claude Code, Codex, or Gemini? Get paid for the sponsored line you
            already see. Create an account, link your UPI, and cash out.
          </p>
          <Link href="/earnings" className="btn btn-ghost btn-sm">View earnings →</Link>
        </div>
      </div>

      <p className="muted small" style={{ marginTop: "1.5rem" }}>
        Staff: <Link href="/admin">open the operations console</Link>.
      </p>
    </>
  );
}
