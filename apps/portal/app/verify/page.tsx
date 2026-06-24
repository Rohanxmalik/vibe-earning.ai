"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PortalApi } from "../../lib/api";
import { Alert, Spinner } from "../../components/ui";
import { PageHeader } from "@/components/ui/PageHeader";

const api = new PortalApi(process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000");

function VerifyInner() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"working" | "ok" | "error">("working");

  useEffect(() => {
    if (!token) { setState("error"); return; }
    api.verifyEmail(token).then(() => setState("ok")).catch(() => setState("error"));
  }, [token]);

  return (
    <>
      <PageHeader
        title="Email verification"
        subtitle="Confirming your email address."
      />
      <main className="bg-[#F4F6FF]">
        <div className="mx-auto max-w-md px-6 py-12 md:py-16">
      <div className="card">
        {state === "working" && <Spinner label="Verifying your email…" />}
        {state === "ok" && <Alert kind="ok">Your email is verified. Thanks!</Alert>}
        {state === "error" && <Alert kind="error">This verification link is invalid or expired.</Alert>}
        <p style={{ marginTop: "0.75rem" }}><Link href="/">Back to home</Link></p>
      </div>
        </div>
      </main>
    </>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<PageHeader title="Email verification" />}>
      <VerifyInner />
    </Suspense>
  );
}
