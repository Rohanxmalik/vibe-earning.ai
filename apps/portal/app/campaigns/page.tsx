"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalApi, type Campaign } from "../../lib/api";
import { getToken, clearToken } from "../../lib/token";

const api = new PortalApi(process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000", fetch, getToken);

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [copy, setCopy] = useState("");
  const [url, setUrl] = useState("https://");
  const [bid, setBid] = useState(20000);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    try {
      setCampaigns(await api.listCampaigns());
    } catch {
      setMsg("Sign in first.");
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function create() {
    setMsg(null);
    try {
      await api.createCampaign({ copy, url, surface: "codex-panel", bidPerBlockPaise: Number(bid) });
      setCopy("");
      await refresh();
    } catch {
      setMsg("Create failed (check fields / sign in).");
    }
  }

  async function buy(id: string) {
    try {
      const p = await api.buyBlocks(id, 5);
      setMsg(`Topped up 5 blocks (₹${(p.amountPaise / 100).toFixed(2)}, ${p.status}).`);
      await refresh();
    } catch {
      setMsg("Top-up failed.");
    }
  }

  async function pause(id: string) {
    try { await api.pauseCampaign(id); setMsg("Campaign paused."); await refresh(); }
    catch { setMsg("Pause failed (only active campaigns can be paused)."); }
  }
  async function resume(id: string) {
    try { await api.resumeCampaign(id); setMsg("Campaign resumed."); await refresh(); }
    catch { setMsg("Resume failed."); }
  }

  function logout() {
    clearToken();
    router.push("/login");
  }

  return (
    <main>
      <h1>My campaigns</h1>
      <button onClick={logout}>Log out</button>
      <section>
        <h2>New campaign (codex-panel)</h2>
        <input placeholder="ad copy (≤60)" value={copy} onChange={(e) => setCopy(e.target.value)} maxLength={60} />
        <input placeholder="https://landing" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input type="number" value={bid} onChange={(e) => setBid(Number(e.target.value))} /> <span>paise / block</span>
        <button onClick={create}>Create</button>
      </section>
      {msg && <p>{msg}</p>}
      <ul>
        {campaigns.map((c) => (
          <li key={c.id}>
            <strong>{c.copy}</strong> — {c.url} <em>[{c.status ?? "?"}]</em>{" "}
            <button onClick={() => buy(c.id)}>Top up 5 blocks</button>{" "}
            {c.status === "active" && <button onClick={() => pause(c.id)}>Pause</button>}
            {c.status === "paused" && <button onClick={() => resume(c.id)}>Resume</button>}
          </li>
        ))}
      </ul>
    </main>
  );
}
