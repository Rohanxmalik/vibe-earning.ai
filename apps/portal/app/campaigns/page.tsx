"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalApi, type Campaign } from "../../lib/api";
import { getToken, clearToken } from "../../lib/token";

const api = new PortalApi(process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000", fetch, getToken);
const rupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

function statusBadge(status?: string) {
  const cls = status === "active" ? "badge-active" : status === "pending" ? "badge-pending" : "badge-paused";
  return <span className={`badge ${cls}`}>{status ?? "unknown"}</span>;
}

export default function CampaignsPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [copy, setCopy] = useState("");
  const [url, setUrl] = useState("https://");
  const [bid, setBid] = useState(20000);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      setCampaigns(await api.listCampaigns());
      setAuthed(true);
    } catch {
      setAuthed(false);
    }
  }
  useEffect(() => { void refresh(); }, []);

  async function create() {
    setMsg(null); setErr(null);
    try {
      await api.createCampaign({ copy, url, surface: "codex-panel", bidPerBlockPaise: Number(bid) });
      setCopy("");
      setMsg("Campaign created — it goes live once an admin approves it.");
      await refresh();
    } catch {
      setErr("Create failed — check the copy (3–60 chars), a valid URL, and your bid.");
    }
  }
  async function buy(id: string) {
    setMsg(null); setErr(null);
    try {
      const p = await api.buyBlocks(id, 5);
      setMsg(`Topped up 5 blocks (${rupees(p.amountPaise)}, ${p.status}).`);
      await refresh();
    } catch { setErr("Top-up failed."); }
  }
  async function pause(id: string) {
    setMsg(null); setErr(null);
    try { await api.pauseCampaign(id); setMsg("Campaign paused."); await refresh(); }
    catch { setErr("Pause failed (only active campaigns can be paused)."); }
  }
  async function resume(id: string) {
    setMsg(null); setErr(null);
    try { await api.resumeCampaign(id); setMsg("Campaign resumed."); await refresh(); }
    catch { setErr("Resume failed."); }
  }
  function logout() { clearToken(); router.push("/login"); }

  if (!authed) {
    return (
      <div className="narrow">
        <h1>My campaigns</h1>
        <div className="card">
          <p className="muted">You need to sign in to manage campaigns.</p>
          <button className="btn btn-primary" onClick={() => router.push("/login")}>Go to sign in</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="row-between">
        <div>
          <h1>My campaigns</h1>
          <p className="muted">Surface: codex-panel · paid per verified impression (second-price).</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={logout}>Log out</button>
      </div>

      <div className="card">
        <h2>New campaign</h2>
        <div className="field">
          <label className="label" htmlFor="copy">Ad copy</label>
          <input id="copy" className="input" placeholder="One tasteful line (3–60 chars)" value={copy} maxLength={60} onChange={(e) => setCopy(e.target.value)} />
          <div className="hint">{copy.length}/60 characters</div>
        </div>
        <div className="field">
          <label className="label" htmlFor="url">Landing URL</label>
          <input id="url" className="input" placeholder="https://landing.example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="bid">Bid per block</label>
          <input id="bid" className="input" type="number" value={bid} onChange={(e) => setBid(Number(e.target.value))} />
          <div className="hint">{bid} paise = {rupees(bid)} per block of impressions</div>
        </div>
        <button className="btn btn-primary" onClick={create}>Create campaign</button>
      </div>

      {msg && <div className="alert alert-ok">{msg}</div>}
      {err && <div className="alert alert-error">{err}</div>}

      <div className="card">
        <h2>Your campaigns ({campaigns.length})</h2>
        {campaigns.length === 0 ? (
          <p className="empty">No campaigns yet. Create one above to get started.</p>
        ) : (
          <ul className="list">
            {campaigns.map((c) => (
              <li key={c.id} className="list-item">
                <div className="item-main">
                  <div className="item-copy">{c.copy}</div>
                  <div className="item-sub">{c.url}</div>
                </div>
                <div className="row">
                  {statusBadge(c.status)}
                  <button className="btn btn-ghost btn-sm" onClick={() => buy(c.id)}>Top up 5</button>
                  {c.status === "active" && <button className="btn btn-ghost btn-sm" onClick={() => pause(c.id)}>Pause</button>}
                  {c.status === "paused" && <button className="btn btn-ghost btn-sm" onClick={() => resume(c.id)}>Resume</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
