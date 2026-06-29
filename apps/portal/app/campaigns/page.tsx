"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalApi, type Campaign, type DailySpend } from "../../lib/api";
import { getToken, clearToken } from "../../lib/token";
import { Alert, Spinner, ConfirmButton, SpendChart } from "../../components/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { HEADLINE_MAX, TAGLINE_MAX } from "@kbi/shared";
import { brandPreview, firstEmoji, lowContrastWarning } from "../../lib/brand";

const api = new PortalApi(process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000", fetch, getToken);
const rupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
const DEFAULT_BRAND_COLOR = "#2563EB"; // portal blue; advertisers can override

function statusBadge(status?: string) {
  const cls = status === "active" ? "badge-active" : status === "pending" ? "badge-pending" : "badge-paused";
  return <span className={`badge ${cls}`}>{status ?? "unknown"}</span>;
}

export default function CampaignsPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [headline, setHeadline] = useState("");
  const [tagline, setTagline] = useState("");
  const [emoji, setEmoji] = useState("");
  const [brandColor, setBrandColor] = useState(DEFAULT_BRAND_COLOR);
  const [url, setUrl] = useState("https://");
  const [bid, setBid] = useState(20000);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editHeadline, setEditHeadline] = useState("");
  const [editTagline, setEditTagline] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const [editColor, setEditColor] = useState(DEFAULT_BRAND_COLOR);
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
      await api.createCampaign({
        // No `copy`: the server derives the legacy single-line from headline+tagline.
        headline: headline.trim(),
        tagline: tagline.trim() || undefined,
        emoji: emoji || undefined,
        brandColor,
        url,
        surface: "codex-panel",
        bidPerBlockPaise: Number(bid),
      });
      setHeadline(""); setTagline(""); setEmoji(""); setBrandColor(DEFAULT_BRAND_COLOR);
      setMsg("Campaign created — it goes live once an admin approves it."); await refresh();
    } catch { setErr("Create failed — check the brand name (1–20 chars), a valid URL, and your bid."); }
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

  function startEdit(c: Campaign) {
    setMsg(null); setErr(null); setEditId(c.id);
    // Fall back to the legacy copy as the headline for campaigns created before structured fields.
    setEditHeadline(c.headline ?? c.copy);
    setEditTagline(c.tagline ?? "");
    setEditEmoji(c.emoji ?? "");
    setEditColor(c.brandColor ?? DEFAULT_BRAND_COLOR);
    setEditUrl(c.url); setEditBid(20000);
  }
  function cancelEdit() { setEditId(null); }
  async function saveEdit(id: string) {
    setMsg(null); setErr(null);
    try {
      const c = await api.editCampaign(id, {
        // No `copy`: the server re-derives it from the structured fields.
        headline: editHeadline.trim(),
        tagline: editTagline.trim() || null,
        emoji: editEmoji || null,
        brandColor: editColor,
        url: editUrl,
        bidPerBlockPaise: Number(editBid),
      });
      setEditId(null);
      setMsg(c.status === "pending" ? "Saved — creative changes need admin re-approval." : "Campaign updated.");
      await refresh();
    } catch { setErr("Update failed — check the brand name (1–20 chars), URL, and bid."); }
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
        <div className="row" style={{ gap: "0.75rem", alignItems: "flex-start" }}>
          <div className="field" style={{ flex: "0 0 5.5rem" }}>
            <label className="label" htmlFor="emoji">Emoji</label>
            <input id="emoji" className="input" placeholder="🍔" value={emoji} onChange={(e) => setEmoji(firstEmoji(e.target.value))} style={{ textAlign: "center" }} />
            <div className="hint">1 emoji</div>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="headline">Brand name</label>
            <input id="headline" className="input" placeholder="Zomato" value={headline} maxLength={HEADLINE_MAX} onChange={(e) => setHeadline(e.target.value)} />
            <div className="hint">{headline.length}/{HEADLINE_MAX} characters</div>
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="tagline">Tagline</label>
          <input id="tagline" className="input" placeholder="Delivering Happiness" value={tagline} maxLength={TAGLINE_MAX} onChange={(e) => setTagline(e.target.value)} />
          <div className="hint">{tagline.length}/{TAGLINE_MAX} characters — always shown next to your brand name</div>
        </div>
        <div className="field">
          <label className="label" htmlFor="brandColor">Brand color</label>
          <div className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
            <input id="brandColor" type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} style={{ width: "2.75rem", height: "2.5rem", padding: 0, border: "none", background: "none" }} />
            <input className="input" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} style={{ maxWidth: "9rem", fontFamily: "monospace" }} />
          </div>
          <div className="hint">Tints your sponsored line in the editor status bar</div>
          {lowContrastWarning(brandColor) && <div className="hint" style={{ color: "#B45309" }}>⚠ {lowContrastWarning(brandColor)}</div>}
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
        <div className="field">
          <span className="label">Preview</span>
          <div className="input" style={{ display: "flex", alignItems: "center", color: brandColor, fontWeight: 600 }}>
            <span style={{ opacity: 0.6, marginRight: "0.4rem" }}>✨ Sponsored:</span>
            {brandPreview({ emoji, headline, tagline, url }) || <span style={{ opacity: 0.5, fontWeight: 400 }}>Your brand name appears here</span>}
          </div>
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
                    <div className="row" style={{ gap: "0.75rem", alignItems: "flex-start" }}>
                      <div className="field" style={{ margin: 0, flex: "0 0 5rem" }}>
                        <label className="label">Emoji</label>
                        <input className="input" placeholder="🍔" value={editEmoji} onChange={(e) => setEditEmoji(firstEmoji(e.target.value))} style={{ textAlign: "center" }} />
                      </div>
                      <div className="field" style={{ margin: 0, flex: 1 }}>
                        <label className="label">Brand name</label>
                        <input className="input" maxLength={HEADLINE_MAX} value={editHeadline} onChange={(e) => setEditHeadline(e.target.value)} />
                      </div>
                      <div className="field" style={{ margin: 0, flex: "0 0 3.5rem" }}>
                        <label className="label">Color</label>
                        <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} style={{ width: "2.75rem", height: "2.5rem", padding: 0, border: "none", background: "none" }} />
                      </div>
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">Tagline</label>
                      <input className="input" maxLength={TAGLINE_MAX} value={editTagline} onChange={(e) => setEditTagline(e.target.value)} />
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
                        <div className="item-copy" style={c.brandColor ? { color: c.brandColor } : undefined}>
                          {c.brandColor && <span aria-hidden style={{ display: "inline-block", width: "0.6rem", height: "0.6rem", borderRadius: "50%", background: c.brandColor, marginRight: "0.4rem" }} />}
                          {brandPreview({ emoji: c.emoji ?? undefined, headline: c.headline ?? undefined, tagline: c.tagline ?? undefined, copy: c.copy })}
                        </div>
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
