"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PortalApi } from "../../lib/api";
import { setToken } from "../../lib/token";

const api = new PortalApi(process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000");

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = mode === "register" ? await api.register(email, password) : await api.login(email, password);
      setToken(res.token);
      router.push("/campaigns");
    } catch {
      setError(mode === "register" ? "Could not register — email may already be in use." : "Login failed — check your email and password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <h1>Advertiser access</h1>
      <p className="muted">Run sponsored lines across AI coding agents.</p>

      <div className="tabs" role="tablist">
        <button className={`tab ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>Log in</button>
        <button className={`tab ${mode === "register" ? "active" : ""}`} onClick={() => setMode("register")}>Register</button>
      </div>

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
        {error && <div className="alert alert-error">{error}</div>}
      </div>
    </div>
  );
}
