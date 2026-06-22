"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PortalApi } from "../../lib/api";
import { setToken } from "../../lib/token";

const api = new PortalApi(process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000");

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(mode: "login" | "register") {
    setError(null);
    try {
      const res = mode === "register" ? await api.register(email, password) : await api.login(email, password);
      setToken(res.token);
      router.push("/campaigns");
    } catch {
      setError(`${mode} failed`);
    }
  }

  return (
    <main>
      <h1>Advertiser sign in</h1>
      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <div>
        <button onClick={() => submit("login")}>Log in</button>
        <button onClick={() => submit("register")}>Register</button>
      </div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}
