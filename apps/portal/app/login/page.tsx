"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PortalApi, ApiError } from "../../lib/api";
import { setToken } from "../../lib/token";
import { Alert, Tabs } from "../../components/ui";
import { PageHeader } from "@/components/ui/PageHeader";

const api = new PortalApi(process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000");

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null); setMsg(null); setBusy(true);
    try {
      const res = mode === "register" ? await api.register(email, password) : await api.login(email, password);
      setToken(res.token);
      router.push("/campaigns");
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      if (!err || err.status === 0) {
        setError("Can't reach the server — make sure the backend API is running (default http://localhost:3000).");
      } else if (mode === "register") {
        setError(err.code === "email_taken"
          ? "That email is already registered — switch to “Log in”."
          : "Could not register — use a valid work email and a password of at least 8 characters.");
      } else {
        setError(err.status === 401
          ? "Login failed — check your email and password."
          : "Could not log in — please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    setError(null); setMsg(null);
    if (!email) { setError("Enter your email above first, then click reset."); return; }
    await api.requestPasswordReset(email, "advertiser").catch(() => undefined);
    setMsg("If that email is registered, a reset link is on its way.");
  }

  return (
    <>
      <PageHeader
        eyebrow="Advertiser portal"
        title="Reach developers at peak focus."
        subtitle="Bid on the most-watched spinner in AI coding — pay only for verified impressions, in INR."
      />
      <main className="bg-[#F4F6FF]">
        <div className="mx-auto max-w-md px-6 py-12 md:py-16">
      <Tabs
        tabs={[{ id: "login", label: "Log in" }, { id: "register", label: "Register" }]}
        active={mode}
        onChange={setMode}
      />

      <div className="card">
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="field">
            <label className="label" htmlFor="email">Work email</label>
            <input id="email" className="input" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">Password</label>
            <input id="password" className="input" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder={mode === "register" ? "at least 8 characters" : "••••••••"} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? "…" : mode === "register" ? "Create advertiser account" : "Log in"}
          </button>
        </form>
        {mode === "login" && (
          <p className="hint" style={{ marginTop: "0.75rem" }}>
            Forgot your password? <a href="#" onClick={(e) => { e.preventDefault(); void forgot(); }}>Email me a reset link</a>.
          </p>
        )}
        {msg && <Alert kind="ok">{msg}</Alert>}
        {error && <Alert kind="error">{error}</Alert>}
      </div>
        </div>
      </main>
    </>
  );
}
