"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalApi, type Campaign, type DailySpend } from "../../lib/api";
import { getToken, clearToken } from "../../lib/token";
import { Alert, Spinner, ConfirmButton, SpendChart } from "../../components/ui";
import { PageHeader } from "@/components/ui/PageHeader";

const api = new PortalApi(process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000", fetch, getToken);
const rupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

function statusBadge(status?: string) {
  const cls = status === "active" ? "badge-active" : status === "pending" ? "badge-pending" : "badge-paused";
  return <span className={`badge ${cls}`}>{status ?? "unknown"}</span>;
}

export default function CampaignsPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [copy, setCopy] = useState("");
  const [url, setUrl] = useState("https://");
  const [bid, setBid] = useState(20000);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editCopy, setEditCopy] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editBid, setEditBid] = useState(20000);
  const [statsId, setStatsId] = useState<string | null>(null);
  const [spend, setSpend] = useState<DailySpend[]>([]);

  async function refresh() {
    setLoading(true);
    try { setCampaigns(await api.listCampaigns()); setAuthed(true); }
    catch { setAuthed(false); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  async function create() {
    setMsg(null); setErr(null);
    try {
      await api.createCampaign({ copy, url, surface: "codex-panel", bidPerBlockPaise: Number(bid) });
      setCopy(""); setMsg("Campaign created — it goes live once an admin approves it."); await refresh();
    } catch { setErr("Create failed — check the copy (3–60 chars), a valid URL, and your bid."); }
  }
  async function buy(id: string) {
    setMsg(null); setErr(null);
    try { const p = await api.buyBlocks(id, 5); setMsg(`Topped up 5 blocks (${rupees(p.amountPaise)}, ${p.status}).`); await refresh(); }
    catch { setErr("Top-up failed."); }
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

  function startEdit(c: Campaign) { setMsg(null); setErr(null); setEditId(c.id); setEditCopy(c.copy); setEditUrl(c.url); setEditBid(20000); }
  function cancelEdit() { setEditId(null); }
  async function saveEdit(id: string) {
    setMsg(null); setErr(null);
    try {
      const c = await api.editCampaign(id, { copy: editCopy, url: editUrl, bidPerBlockPaise: Number(editBid) });
      setEditId(null);
      setMsg(c.status === "pending" ? "Saved — creative changes need admin re-approval." : "Campaign updated.");
      await refresh();
    } catch { setErr("Update failed — check the copy (3–60 chars), URL, and bid."); }
  }

  async function toggleStats(id: string) {
    if (statsId === id) { setStatsId(null); return; }
    setErr(null);
    try { setSpend(await api.campaignDailySpend(id)); setStatsId(id); }
    catch { setErr("Could not load spend."); }
  }

  function logout() { clearToken(); router.push("/login"); }

  if (!authed) {
    return (
      <>
        <PageHeader
          eyebrow="Advertiser portal"
          title="My campaigns"
          subtitle="Sign in to create and manage campaigns."
        />
        <main className="bg-[#F4F6FF]">
          <div className="mx-auto max-w-lg px-6 py-12 md:py-16">
            <div className="card">
              <p className="muted">You need to sign in to manage campaigns.</p>
              <button className="btn btn-primary" onClick={() => router.push("/login")}>Go to sign in</button>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Advertiser portal"
        title="My campaigns"
        subtitle="Surface: codex-panel · paid per verified impression, second-price auction."
        actions={<button className="rounded-full border border-white/40 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10" onClick={logout}>Log out</button>}
      />
      <main className="bg-[#F4F6FF]">
        <div className="mx-auto max-w-4xl px-6 py-12 md:py-16">
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

      {msg && <Alert kind="ok">{msg}</Alert>}
      {err && <Alert kind="error">{err}</Alert>}

      <div className="card">
        <h2>Your campaigns ({campaigns.length})</h2>
        {loading ? <Spinner label="Loading campaigns…" /> : campaigns.length === 0 ? (
          <p className="empty">No campaigns yet. Create one above to get started.</p>
        ) : (
          <ul className="list">
            {campaigns.map((c) => (
              <li key={c.id} className="list-item" style={editId === c.id || statsId === c.id ? { display: "block" } : undefined}>
                {editId === c.id ? (
                  <div className="stack" style={{ width: "100%" }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">Ad copy</label>
                      <input className="input" maxLength={60} value={editCopy} onChange={(e) => setEditCopy(e.target.value)} />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">Landing URL</label>
                      <input className="input" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">New bid per block (paise)</label>
                      <input className="input" type="number" value={editBid} onChange={(e) => setEditBid(Number(e.target.value))} />
                      <div className="hint">{editBid} paise = {rupees(editBid)} per block</div>
                    </div>
                    <div className="row">
                      <button className="btn btn-primary btn-sm" onClick={() => saveEdit(c.id)}>Save</button>
                      <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="row-between">
                      <div className="item-main">
                        <div className="item-copy">{c.copy}</div>
                        <div className="item-sub">{c.url}</div>
                      </div>
                      <div className="row">
                        {statusBadge(c.status)}
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleStats(c.id)}>{statsId === c.id ? "Hide" : "Stats"}</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(c)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => buy(c.id)}>Top up 5</button>
                        {c.status === "active" && <ConfirmButton message="Pause this campaign? It stops serving until resumed." className="btn btn-ghost btn-sm" onConfirm={() => pause(c.id)}>Pause</ConfirmButton>}
                        {c.status === "paused" && <button className="btn btn-ghost btn-sm" onClick={() => resume(c.id)}>Resume</button>}
                      </div>
                    </div>
                    {statsId === c.id && (
                      <div style={{ marginTop: "0.9rem" }}>
                        <div className="stat-label">Daily spend</div>
                        <SpendChart data={spend} />
                      </div>
                    )}
                  </>
                )}
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
