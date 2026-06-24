"use client";
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PortalApi } from "../../lib/api";
import { Alert } from "../../components/ui";
import { PageHeader } from "@/components/ui/PageHeader";

const api = new PortalApi(process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000");

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null); setBusy(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch {
      setError("Reset failed — the link may have expired. Request a new one.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Set a new password"
        subtitle="Choose a new password for your account."
      />
      <main className="bg-[#F4F6FF]">
        <div className="mx-auto max-w-md px-6 py-12 md:py-16">
      {!token && <Alert kind="error">Missing or invalid reset link.</Alert>}
      {done ? (
        <div className="card">
          <Alert kind="ok">Password updated. You can log in now.</Alert>
          <button className="btn btn-primary" onClick={() => router.push("/login")}>Go to login</button>
        </div>
      ) : (
        <div className="card">
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <div className="field">
              <label className="label" htmlFor="pw">New password</label>
              <input id="pw" className="input" type="password" autoComplete="new-password" placeholder="at least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-block" type="submit" disabled={busy || !token}>{busy ? "…" : "Update password"}</button>
          </form>
          {error && <Alert kind="error">{error}</Alert>}
        </div>
      )}
        </div>
      </main>
    </>
  );
}

export default function ResetPage() {
  return (
    <Suspense fallback={<PageHeader title="Set a new password" />}>
      <ResetForm />
    </Suspense>
  );
}
