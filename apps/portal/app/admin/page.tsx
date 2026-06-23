"use client";
import { useEffect, useState } from "react";
import { PortalApi, type Campaign, type PayoutDestination } from "../../lib/api";
import { getAdminKey, setAdminKey, clearAdminKey } from "../../lib/token";

const api = new PortalApi(process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000");

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [destinations, setDestinations] = useState<PayoutDestination[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function key(): string {
    return getAdminKey() ?? "";
  }

  async function refresh() {
    setError(null);
    try {
      const [c, d] = await Promise.all([api.adminPendingCampaigns(key()), api.adminPendingDestinations(key())]);
      setCampaigns(c); setDestinations(d);
    } catch {
      setError("Could not load — is the admin key correct?");
    }
  }

  useEffect(() => {
    if (getAdminKey()) { setAuthed(true); void refresh(); }
  }, []);

  function signIn() {
    if (!keyInput.trim()) return;
    setAdminKey(keyInput.trim());
    setAuthed(true);
    void refresh();
  }
  function signOut() {
    clearAdminKey();
    setAuthed(false);
    setCampaigns([]); setDestinations([]);
  }

  async function approve(id: string) {
    setMsg(null); setError(null);
    try { await api.adminApproveCampaign(key(), id); setMsg("Campaign approved."); await refresh(); }
    catch { setError("Approve failed."); }
  }
  async function verify(id: string) {
    setMsg(null); setError(null);
    try { await api.adminVerifyDestination(key(), id); setMsg("Destination verified."); await refresh(); }
    catch { setError("Verify failed."); }
  }
  async function killswitch(active: boolean) {
    setMsg(null); setError(null);
    try { await api.adminSetKillswitch(key(), active); setMsg(`Killswitch ${active ? "ON" : "OFF"}.`); }
    catch { setError("Killswitch toggle failed."); }
  }

  if (!authed) {
    return (
      <main>
        <h1>Admin console</h1>
        <p>Enter the admin API key.</p>
        <input type="password" placeholder="x-admin-key" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
        <div><button onClick={signIn}>Enter</button></div>
      </main>
    );
  }

  return (
    <main>
      <h1>Admin console</h1>
      <button onClick={signOut}>Sign out</button>
      <button onClick={() => void refresh()}>Refresh</button>

      <section>
        <h2>Killswitch</h2>
        <button onClick={() => killswitch(true)}>Disable serving</button>
        <button onClick={() => killswitch(false)}>Resume serving</button>
      </section>

      <section>
        <h2>Pending campaigns ({campaigns.length})</h2>
        <ul>
          {campaigns.map((c) => (
            <li key={c.id}>
              <strong>{c.copy}</strong> — {c.url} <button onClick={() => approve(c.id)}>Approve</button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Pending payout destinations ({destinations.length})</h2>
        <ul>
          {destinations.map((d) => (
            <li key={d.id}>
              {d.method.toUpperCase()} {d.vpa ?? d.accountNumber} <button onClick={() => verify(d.id)}>Verify (KYC)</button>
            </li>
          ))}
        </ul>
      </section>

      {msg && <p style={{ color: "green" }}>{msg}</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}
