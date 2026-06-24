"use client";
import { useEffect, useState } from "react";
import { PortalApi, type LedgerSummary, type Payout, type PayoutDestination } from "../../lib/api";
import { getDevToken, setDevToken, clearDevToken } from "../../lib/token";
import { Alert, Tabs, Spinner, ConfirmButton } from "../../components/ui";

const api = new PortalApi(process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000", fetch, getDevToken);
const rupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

type AuthMode = "register" | "login" | "token";

export default function EarningsPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<AuthMode>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [destinations, setDestinations] = useState<PayoutDestination[]>([]);
  const [vpa, setVpa] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setError(null); setLoading(true);
    try {
      const [s, p, d] = await Promise.all([api.ledgerSummary(), api.myPayouts(), api.myPayoutDestinations()]);
      setSummary(s); setPayouts(p); setDestinations(d);
    } catch {
      setError("Could not load earnings — your session may have expired.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (getDevToken()) { setSignedIn(true); void refresh(); } }, []);

  async function authSubmit() {
    setError(null); setBusy(true);
    try {
      const res = mode === "register" ? await api.devRegister(email, password) : await api.devLogin(email, password);
      setDevToken(res.token); setSignedIn(true); await refresh();
    } catch {
      setError(mode === "register" ? "Could not register — email may already be in use." : "Login failed — check your credentials.");
    } finally { setBusy(false); }
  }
  async function forgot() {
    if (!email) { setError("Enter your email above first."); return; }
    await api.requestPasswordReset(email, "dev").catch(() => undefined);
    setMsg("If that email is registered, a reset link is on its way.");
  }
  function useExtensionToken() {
    if (!tokenInput.trim()) return;
    setDevToken(tokenInput.trim()); setSignedIn(true); void refresh();
  }
  function signOut() {
    clearDevToken(); setSignedIn(false); setSummary(null); setPayouts([]); setDestinations([]);
  }

  async function verifyEmail() {
    setMsg(null); setError(null);
    try { await api.requestEmailVerification(); setMsg("Verification email sent — check your inbox."); }
    catch { setError("Could not send the verification email."); }
  }
  async function addDestination() {
    setMsg(null); setError(null);
    try { await api.setPayoutDestination({ method: "upi", vpa: vpa.trim() }); setVpa(""); setMsg("UPI added — pending verification."); await refresh(); }
    catch { setError("Could not add destination (check the VPA, e.g. you@okaxis)."); }
  }
  async function cashOut() {
    setMsg(null); setError(null);
    try { const p = await api.requestPayout(); setMsg(`Payout ${p.status}: ${rupees(p.amountPaise)}.`); await refresh(); }
    catch { setError("Payout failed — you need a verified UPI and a balance above the minimum."); }
  }
  async function exportData() {
    setMsg(null); setError(null);
    try {
      const data = await api.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "kickbacks-my-data.json"; a.click();
      URL.revokeObjectURL(url);
    } catch { setError("Could not export your data."); }
  }
  async function deleteAccount() {
    setMsg(null); setError(null);
    try { await api.deleteMyAccount(); signOut(); }
    catch { setError("Could not delete the account."); }
  }

  if (!signedIn) {
    return (
      <div className="narrow">
        <h1>Developer earnings</h1>
        <p className="muted">Get paid for the sponsored line you already see in your AI coding agent.</p>

        <Tabs
          tabs={[{ id: "register", label: "Sign up" }, { id: "login", label: "Log in" }, { id: "token", label: "Extension token" }]}
          active={mode}
          onChange={setMode}
        />

        {mode === "token" ? (
          <div className="card">
            <p className="muted small">Already signed in inside VS Code? Paste the token from “Kickbacks: Sign in”.</p>
            <div className="field">
              <label className="label" htmlFor="token">Session token</label>
              <input id="token" className="input" placeholder="paste token" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-block" onClick={useExtensionToken}>View earnings</button>
          </div>
        ) : (
          <div className="card">
            <form onSubmit={(e) => { e.preventDefault(); void authSubmit(); }}>
              <div className="field">
                <label className="label" htmlFor="email">Email</label>
                <input id="email" className="input" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="field">
                <label className="label" htmlFor="password">Password</label>
                <input id="password" className="input" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder={mode === "register" ? "at least 8 characters" : "••••••••"} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
                {busy ? "…" : mode === "register" ? "Create developer account" : "Log in"}
              </button>
            </form>
            {mode === "login" && (
              <p className="hint" style={{ marginTop: "0.75rem" }}>
                Forgot your password? <a href="#" onClick={(e) => { e.preventDefault(); void forgot(); }}>Email me a reset link</a>.
              </p>
            )}
            <p className="hint">After signing up, paste your token into the VS Code extension so your impressions are credited to you.</p>
          </div>
        )}
        {msg && <Alert kind="ok">{msg}</Alert>}
        {error && <Alert kind="error">{error}</Alert>}
      </div>
    );
  }

  return (
    <>
      <div className="row-between">
        <div>
          <h1>Developer earnings</h1>
          <p className="muted">Your impressions, balance, and payouts.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
      </div>

      {loading && <Spinner label="Loading your earnings…" />}

      <div className="grid">
        <div className="card">
          <div className="stat-label">Withdrawable balance</div>
          <div className="stat-value money">{summary ? rupees(summary.balancePaise) : "—"}</div>
          <button className="btn btn-primary btn-sm" style={{ marginTop: "0.75rem" }} onClick={cashOut}>Cash out</button>
        </div>
        <div className="card">
          <div className="stat-label">Valid impressions</div>
          <div className="stat-value">{summary ? summary.validImpressions : "—"}</div>
          <div className="hint">Counted after fraud checks.</div>
        </div>
      </div>

      {msg && <Alert kind="ok">{msg}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <div className="card">
        <h2>Payout destination</h2>
        <div className="row">
          <input className="input" style={{ maxWidth: 280 }} placeholder="you@okaxis" value={vpa} onChange={(e) => setVpa(e.target.value)} />
          <button className="btn btn-ghost" onClick={addDestination}>Add UPI</button>
        </div>
        {destinations.length === 0 ? (
          <p className="empty" style={{ marginTop: "0.75rem" }}>No payout method yet. Add a UPI to cash out.</p>
        ) : (
          <ul className="list" style={{ marginTop: "0.5rem" }}>
            {destinations.map((d) => (
              <li key={d.id} className="list-item">
                <span>{d.method.toUpperCase()} · {d.vpa ?? d.accountNumber}</span>
                <span className={`badge ${d.status === "verified" ? "badge-verified" : "badge-pending"}`}>{d.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Payout history</h2>
        {payouts.length === 0 ? <p className="empty">No payouts yet.</p> : (
          <ul className="list">
            {payouts.map((p) => (
              <li key={p.id} className="list-item">
                <span>{rupees(p.amountPaise)} · via {p.provider}</span>
                <span className={`badge ${p.status === "paid" ? "badge-active" : "badge-pending"}`}>{p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Account & privacy</h2>
        <p className="muted small">Verify your email, export everything we hold about you, or delete your account.</p>
        <div className="row">
          <button className="btn btn-ghost btn-sm" onClick={verifyEmail}>Verify email</button>
          <button className="btn btn-ghost btn-sm" onClick={exportData}>Download my data</button>
          <ConfirmButton message="Delete your account? This erases your personal data and signs you out. Financial records are retained as required by law." onConfirm={deleteAccount}>
            Delete account
          </ConfirmButton>
        </div>
      </div>
    </>
  );
}
