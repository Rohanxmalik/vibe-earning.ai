"use client";
import { useEffect, useState } from "react";
import { PortalApi, type Campaign, type PayoutDestination, type AuditEntry } from "../../lib/api";
import { getAdminToken, setAdminToken, clearAdminToken } from "../../lib/token";
import { Alert, Spinner, ConfirmButton } from "../../components/ui";
import { PageHeader } from "@/components/ui/PageHeader";

const api = new PortalApi(process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000");

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [destinations, setDestinations] = useState<PayoutDestination[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const token = () => getAdminToken() ?? "";

  async function refresh() {
    setError(null); setLoading(true);
    try {
      const [c, d, a] = await Promise.all([api.adminPendingCampaigns(token()), api.adminPendingDestinations(token()), api.adminAudit(token())]);
      setCampaigns(c); setDestinations(d); setAudit(a);
    } catch {
      setError("Could not load — your admin session may have expired.");
    } finally { setLoading(false); }
  }

  useEffect(() => { if (getAdminToken()) { setAuthed(true); void refresh(); } }, []);

  async function signIn() {
    setError(null); setBusy(true);
    try { const res = await api.adminLogin(email, password); setAdminToken(res.token); setAuthed(true); await refresh(); }
    catch { setError("Login failed — check the admin email and password."); }
    finally { setBusy(false); }
  }
  function signOut() { clearAdminToken(); setAuthed(false); setCampaigns([]); setDestinations([]); setAudit([]); }

  async function approve(id: string) {
    setMsg(null); setError(null);
    try { await api.adminApproveCampaign(token(), id); setMsg("Campaign approved."); await refresh(); }
    catch { setError("Approve failed."); }
  }
  async function verify(id: string) {
    setMsg(null); setError(null);
    try { await api.adminVerifyDestination(token(), id); setMsg("Destination verified."); await refresh(); }
    catch { setError("Verify failed."); }
  }
  async function killswitch(active: boolean) {
    setMsg(null); setError(null);
    try { await api.adminSetKillswitch(token(), active); setMsg(`Killswitch ${active ? "ON" : "OFF"}.`); await refresh(); }
    catch { setError("Killswitch toggle failed."); }
  }

  if (!authed) {
    return (
      <>
        <PageHeader
          eyebrow="Operations · staff only"
          title="Operations console"
          subtitle="Approve campaigns, verify KYC, and control the global killswitch."
        />
        <main className="bg-[#F4F6FF]">
          <div className="mx-auto max-w-md px-6 py-12 md:py-16">
            <div className="card">
              <form onSubmit={(e) => { e.preventDefault(); void signIn(); }}>
                <div className="field">
                  <label className="label" htmlFor="email">Admin email</label>
                  <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="password">Password</label>
                  <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? "…" : "Sign in"}</button>
              </form>
              {error && <Alert kind="error">{error}</Alert>}
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Operations · staff only"
        title="Operations console"
        actions={<><button className="rounded-full border border-white/40 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10" onClick={() => void refresh()}>Refresh</button><button className="rounded-full border border-white/40 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10" onClick={signOut}>Sign out</button></>}
      />
      <main className="bg-[#F4F6FF]">
        <div className="mx-auto max-w-5xl px-6 py-12 md:py-16">
          {loading && <Spinner label="Loading console…" />}
          {msg && <Alert kind="ok">{msg}</Alert>}
          {error && <Alert kind="error">{error}</Alert>}

          <div className="card">
            <div className="card-title"><h2 style={{ margin: 0 }}>Killswitch</h2></div>
            <p className="muted small">Globally stop or resume ad serving.</p>
            <div className="row">
              <ConfirmButton message="Disable ALL ad serving platform-wide?" onConfirm={() => killswitch(true)}>Disable serving</ConfirmButton>
              <button className="btn btn-ghost" onClick={() => killswitch(false)}>Resume serving</button>
            </div>
          </div>

          <div className="card">
            <h2>Pending campaigns ({campaigns.length})</h2>
            {campaigns.length === 0 ? <p className="empty">Nothing awaiting review.</p> : (
              <ul className="list">
                {campaigns.map((c) => (
                  <li key={c.id} className="list-item">
                    <div className="item-main">
                      <div className="item-copy">{c.copy}</div>
                      <div className="item-sub">{c.url}</div>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => approve(c.id)}>Approve</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h2>Pending payout destinations ({destinations.length})</h2>
            {destinations.length === 0 ? <p className="empty">Nothing awaiting KYC.</p> : (
              <ul className="list">
                {destinations.map((d) => (
                  <li key={d.id} className="list-item">
                    <span>{d.method.toUpperCase()} · {d.vpa ?? d.accountNumber}</span>
                    <button className="btn btn-primary btn-sm" onClick={() => verify(d.id)}>Verify (KYC)</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h2>Audit log</h2>
            {audit.length === 0 ? <p className="empty">No admin actions recorded.</p> : (
              <ul className="list">
                {audit.slice(0, 20).map((a) => (
                  <li key={a.id} className="list-item">
                    <div className="item-main">
                      <div className="item-copy">{a.action}{a.target ? ` · ${a.target}` : ""}</div>
                      <div className="item-sub">{a.actor} · {new Date(a.createdAt).toLocaleString()}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
