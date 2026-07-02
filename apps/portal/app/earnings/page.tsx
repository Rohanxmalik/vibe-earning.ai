"use client";
import { useEffect, useState } from "react";
import {
  PortalApi, ApiError,
  type LedgerSummary, type LedgerStats, type Payout, type PayoutDestination,
  type UsageInfo, type Eligibility, type ActivityPoint, type ActivityWindow, type LedgerEvent,
} from "../../lib/api";
import { getDevToken, setDevToken, clearDevToken } from "../../lib/token";
import { Alert, Tabs, Spinner, ConfirmButton } from "../../components/ui";
import { StatCard } from "../../components/StatCard";
import { MetricChart } from "../../components/MetricChart";
import { EarningLimitMeter } from "../../components/EarningLimitMeter";
import { LedgerTable } from "../../components/LedgerTable";
import { GeoBanner } from "../../components/GeoBanner";
import { PageHeader } from "@/components/ui/PageHeader";
import { rupees, rupeesShort, compactInt } from "../../lib/format";

const api = new PortalApi(process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000", fetch, getDevToken);

type AuthMode = "register" | "login" | "token";
type Metric = "earned" | "impressions";

export default function EarningsPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<AuthMode>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tokenInput, setTokenInput] = useState("");

  // dashboard data
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [stats, setStats] = useState<LedgerStats | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [elig, setElig] = useState<Eligibility | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [destinations, setDestinations] = useState<PayoutDestination[]>([]);
  const [account, setAccount] = useState<{ id: string; email: string | null; type: string } | null>(null);

  // activity chart
  const [window, setWindow] = useState<ActivityWindow>("7d");
  const [metric, setMetric] = useState<Metric>("earned");
  const [activity, setActivity] = useState<Record<string, ActivityPoint[]>>({});

  // activity ledger
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [ledgerLoaded, setLedgerLoaded] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [vpa, setVpa] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setError(null); setLoading(true);
    try {
      const [s, st, u, e, p, d, acc, act] = await Promise.all([
        api.ledgerSummary(), api.ledgerStats(), api.usage(), api.eligibility(),
        api.myPayouts(), api.myPayoutDestinations(), api.me().catch(() => null), api.ledgerActivity("7d"),
      ]);
      setSummary(s); setStats(st); setUsage(u); setElig(e);
      setPayouts(p); setDestinations(d); setAccount(acc); setActivity({ "7d": act }); setWindow("7d");
    } catch {
      setError("Could not load earnings — your session may have expired.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (getDevToken()) { setSignedIn(true); void refresh(); } }, []);

  async function changeWindow(w: ActivityWindow) {
    setWindow(w);
    if (activity[w]) return;
    try { const act = await api.ledgerActivity(w); setActivity((prev) => ({ ...prev, [w]: act })); } catch { /* keep old */ }
  }

  async function retrieveLedger() {
    setLedgerLoading(true); setError(null);
    try { setEvents(await api.ledgerEvents(500)); setLedgerLoaded(true); }
    catch { setError("Could not retrieve activity."); }
    finally { setLedgerLoading(false); }
  }

  async function authSubmit() {
    setError(null); setBusy(true);
    try {
      const res = mode === "register" ? await api.devRegister(email, password) : await api.devLogin(email, password);
      setDevToken(res.token); setSignedIn(true); await refresh();
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      if (!err || err.status === 0) {
        setError("Can't reach the server — make sure the backend API is running (default http://localhost:3000).");
      } else if (mode === "register") {
        setError(err.code === "email_taken"
          ? "That email is already registered — switch to “Log in” above."
          : "Could not register — use a valid email and a password of at least 8 characters.");
      } else {
        setError(err.status === 401
          ? "Login failed — check your email and password."
          : "Could not log in — please try again.");
      }
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
    clearDevToken(); setSignedIn(false);
    setSummary(null); setStats(null); setUsage(null); setElig(null);
    setPayouts([]); setDestinations([]); setAccount(null); setActivity({}); setEvents([]); setLedgerLoaded(false);
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
      const a = document.createElement("a"); a.href = url; a.download = "vibearning-my-data.json"; a.click();
      URL.revokeObjectURL(url);
    } catch { setError("Could not export your data."); }
  }
  async function deleteAccount() {
    setMsg(null); setError(null);
    try { await api.deleteMyAccount(); signOut(); }
    catch { setError("Could not delete the account."); }
  }

  // ---------- Signed-out: auth ----------
  if (!signedIn) {
    return (
      <>
        <PageHeader
          eyebrow="Developer earnings portal"
          title="Get paid for the line you already watch."
          subtitle="Sign in to see credited events, your balance, and payout status from the extension."
        />
        <main className="bg-[#F4F6FF]">
          <div className="mx-auto max-w-lg px-6 py-12 md:py-16">
            <Tabs
              tabs={[{ id: "register", label: "Sign up" }, { id: "login", label: "Log in" }, { id: "token", label: "Extension token" }]}
              active={mode}
              onChange={setMode}
            />

            {mode === "token" ? (
          <div className="card">
            <p className="muted small">Already signed in inside VS Code? Paste the token from “vibearning: Sign in”.</p>
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
        </main>
      </>
    );
  }

  // ---------- Signed-in: dashboard ----------
  const minPaise = elig?.payoutMinPaise ?? 1000;
  const balance = summary?.balancePaise ?? 0;
  const toGo = Math.max(0, minPaise - balance);
  const payoutPct = Math.min(100, Math.round((balance / minPaise) * 100));
  const series = activity[window] ?? [];
  const points = series.map((p) => ({ label: p.bucket, value: metric === "earned" ? p.earnedPaise : p.impressions }));
  const totalEarned = series.reduce((s, p) => s + p.earnedPaise, 0);
  const totalImps = series.reduce((s, p) => s + p.impressions, 0);

  return (
    <>
      <PageHeader
        eyebrow="Developer earnings"
        title="Your earnings, in INR."
        subtitle="Your impressions, balance, and payouts — paid to UPI."
        actions={<button className="rounded-full border border-white/40 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10" onClick={signOut}>Sign out</button>}
      />
      <main className="bg-[#F4F6FF]">
        <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
          {loading && <Spinner label="Loading your earnings…" />}

      <GeoBanner eligibility={elig} />

      {/* Stat cards */}
      <div className="stat-grid" style={{ marginBottom: "1.25rem" }}>
        <StatCard tone="money" kicker="Today" value={stats ? rupees(stats.todayPaise) : "—"} foot="credited today" />
        <StatCard tone="money" kicker="This month" value={stats ? rupees(stats.monthPaise) : "—"} foot="month-to-date" />
        <StatCard tone="money" kicker="Lifetime" value={stats ? rupees(stats.lifetimePaise) : "—"} foot={stats ? `${stats.validImpressions.toLocaleString("en-IN")} valid impressions` : "all-time credit"} title={stats ? `${stats.lifetimePaise} paise precise` : undefined} />
        <StatCard tone="gold" kicker="Earning limits">
          {usage ? (
            <EarningLimitMeter rows={[
              { name: "Hourly", count: usage.hourly.count, cap: usage.hourly.cap, resetAt: usage.hourly.resetAt },
              { name: "Daily", count: usage.daily.count, cap: usage.daily.cap, resetAt: usage.daily.resetAt },
            ]} />
          ) : <div className="stat-foot">—</div>}
        </StatCard>
      </div>

      {msg && <Alert kind="ok">{msg}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <div className="grid-2">
        {/* Activity chart */}
        <div className="card card-pad-lg">
          <div className="row-between" style={{ marginBottom: "0.9rem" }}>
            <div>
              <h2 style={{ margin: 0 }}>Activity</h2>
              <p className="muted small" style={{ margin: 0 }}>Earnings and ad impressions over the selected window.</p>
            </div>
            <div className="seg" role="group" aria-label="Metric">
              <button className={`seg-btn ${metric === "earned" ? "active" : ""}`} onClick={() => setMetric("earned")}>₹ Earned</button>
              <button className={`seg-btn ${metric === "impressions" ? "active" : ""}`} onClick={() => setMetric("impressions")}>Impressions</button>
            </div>
          </div>
          <div className="row-between" style={{ marginBottom: "0.75rem" }}>
            <div className="seg" role="group" aria-label="Window">
              {(["24h", "7d", "30d"] as ActivityWindow[]).map((w) => (
                <button key={w} className={`seg-btn ${window === w ? "active" : ""}`} onClick={() => void changeWindow(w)}>{w}</button>
              ))}
            </div>
          </div>
          <MetricChart
            points={points}
            color={metric === "earned" ? "var(--brand)" : "var(--money)"}
            valueFmt={(n) => (metric === "earned" ? rupees(n) : `${Math.round(n)} imp`)}
            ariaLabel={metric === "earned" ? "Earnings over time" : "Impressions over time"}
          />
          <div className="chart-foot">{rupeesShort(totalEarned)} across {compactInt(totalImps)} impressions</div>
        </div>

        {/* Payouts */}
        <div className="card card-pad-lg">
          <h2 style={{ marginTop: 0 }}>Payouts</h2>
          <div className="stat-big money">{rupees(balance)}</div>
          <div className="stat-foot">withdrawable balance</div>

          <div className="meter-track" style={{ marginTop: "0.9rem" }} aria-label="Payout threshold progress">
            <div className="meter-fill" style={{ width: `${payoutPct}%`, background: "linear-gradient(90deg, var(--money), #0a8a5f)" }} />
          </div>
          <p className="hint" style={{ marginTop: "0.4rem" }}>
            {toGo > 0 ? <>Minimum payout is <strong>{rupees(minPaise)}</strong> — {rupees(toGo)} to go.</> : <>You&apos;re over the {rupees(minPaise)} minimum. Cash out anytime.</>}
          </p>

          <div className="field" style={{ marginTop: "0.75rem" }}>
            <label className="label" htmlFor="vpa">UPI VPA</label>
            <div className="row">
              <input id="vpa" className="input" style={{ maxWidth: 240 }} placeholder="you@okaxis" value={vpa} onChange={(e) => setVpa(e.target.value)} />
              <button className="btn btn-ghost" onClick={addDestination}>Add UPI</button>
            </div>
          </div>
          {destinations.length === 0 ? (
            <p className="empty">No payout method yet. Add a UPI to cash out.</p>
          ) : (
            <ul className="list">
              {destinations.map((d) => (
                <li key={d.id} className="list-item">
                  <span>{d.method.toUpperCase()} · {d.vpa ?? d.accountNumber}</span>
                  <span className={`badge ${d.status === "verified" ? "badge-verified" : "badge-pending"}`}>{d.status}</span>
                </li>
              ))}
            </ul>
          )}
          <button className="btn btn-primary btn-block" style={{ marginTop: "0.75rem" }} onClick={cashOut} disabled={balance < minPaise}>Cash out {rupees(balance)}</button>
          <p className="hint" style={{ marginTop: "0.6rem" }}>⚠ Every payout is <strong>manually reviewed for fraud</strong>. Click-farm and bot earnings won&apos;t be paid — it keeps the revenue split honest for everyone.</p>
        </div>
      </div>

      {/* Activity ledger */}
      <div className="card card-pad-lg">
        <div className="card-title" style={{ marginBottom: "0.4rem" }}>
          <h2 style={{ margin: 0 }}>Activity ledger</h2>
          <span className="badge badge-muted">{ledgerLoaded ? `${events.length} loaded` : "Not retrieved"}</span>
        </div>
        <p className="muted small">Credited events from this account, retrieved on demand. Search and filter happen locally.</p>
        <LedgerTable rows={events} loaded={ledgerLoaded} loading={ledgerLoading} onRetrieve={retrieveLedger} />
      </div>

      {/* Payout history */}
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

      {/* Account & privacy */}
      <div className="card">
        <h2>Account &amp; privacy</h2>
        {account && (
          <ul className="list" style={{ marginBottom: "0.75rem" }}>
            <li className="list-item"><span className="muted small">Email</span><span className="mono small">{account.email ?? "—"}</span></li>
            <li className="list-item"><span className="muted small">User ID</span><span className="mono small">{account.id}</span></li>
            <li className="list-item"><span className="muted small">Account type</span><span className="mono small">{account.type}</span></li>
          </ul>
        )}
        <p className="muted small">Verify your email, export everything we hold about you, or delete your account.</p>
        <div className="row">
          <button className="btn btn-ghost btn-sm" onClick={verifyEmail}>Verify email</button>
          <button className="btn btn-ghost btn-sm" onClick={exportData}>Download my data</button>
          <ConfirmButton message="Delete your account? This erases your personal data and signs you out. Financial records are retained as required by law." onConfirm={deleteAccount}>
            Delete account
          </ConfirmButton>
        </div>
      </div>
        </div>
      </main>
    </>
  );
}
