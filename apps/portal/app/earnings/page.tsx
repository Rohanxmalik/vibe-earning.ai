"use client";
import { useEffect, useState } from "react";
import { PortalApi, type LedgerSummary, type Payout, type PayoutDestination } from "../../lib/api";
import { getDevToken, setDevToken, clearDevToken } from "../../lib/token";

const api = new PortalApi(process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000", fetch, getDevToken);
const rupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

export default function EarningsPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [destinations, setDestinations] = useState<PayoutDestination[]>([]);
  const [vpa, setVpa] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const [s, p, d] = await Promise.all([api.ledgerSummary(), api.myPayouts(), api.myPayoutDestinations()]);
      setSummary(s); setPayouts(p); setDestinations(d);
    } catch {
      setError("Could not load earnings — is your token valid?");
    }
  }

  useEffect(() => {
    if (getDevToken()) { setSignedIn(true); void refresh(); }
  }, []);

  function signIn() {
    if (!tokenInput.trim()) return;
    setDevToken(tokenInput.trim());
    setSignedIn(true);
    void refresh();
  }
  function signOut() {
    clearDevToken();
    setSignedIn(false);
    setSummary(null); setPayouts([]); setDestinations([]);
  }

  async function addDestination() {
    setMsg(null); setError(null);
    try {
      await api.setPayoutDestination({ method: "upi", vpa: vpa.trim() });
      setVpa("");
      setMsg("UPI destination added (pending verification).");
      await refresh();
    } catch {
      setError("Could not add destination (check the VPA).");
    }
  }

  async function cashOut() {
    setMsg(null); setError(null);
    try {
      const p = await api.requestPayout();
      setMsg(`Payout ${p.status}: ${rupees(p.amountPaise)}.`);
      await refresh();
    } catch {
      setError("Payout failed — need a verified destination and balance above the minimum.");
    }
  }

  if (!signedIn) {
    return (
      <main>
        <h1>Developer earnings</h1>
        <p>Paste your Kickbacks session token (from the VS Code extension: “Kickbacks: Sign in”).</p>
        <input style={{ width: "min(100%, 520px)" }} placeholder="paste token" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} />
        <div><button onClick={signIn}>View earnings</button></div>
      </main>
    );
  }

  return (
    <main>
      <h1>Developer earnings</h1>
      <button onClick={signOut}>Sign out</button>

      <section>
        <h2>Balance</h2>
        {summary ? (
          <p>
            <strong>{rupees(summary.balancePaise)}</strong> withdrawable · {summary.validImpressions} valid impressions
          </p>
        ) : <p>—</p>}
        <button onClick={cashOut}>Cash out</button>
      </section>

      <section>
        <h2>Payout destination</h2>
        <input placeholder="you@upi" value={vpa} onChange={(e) => setVpa(e.target.value)} />
        <button onClick={addDestination}>Add UPI</button>
        <ul>
          {destinations.map((d) => (
            <li key={d.id}>{d.method.toUpperCase()} {d.vpa ?? d.accountNumber} — <em>{d.status}</em></li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Payout history</h2>
        <ul>
          {payouts.map((p) => (
            <li key={p.id}>{rupees(p.amountPaise)} via {p.provider} — <em>{p.status}</em></li>
          ))}
        </ul>
      </section>

      {msg && <p style={{ color: "green" }}>{msg}</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}
