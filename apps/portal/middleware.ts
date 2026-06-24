import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy with a per-request nonce.
 *
 * Next.js injects inline bootstrap/flight scripts; a static `script-src 'self'`
 * blocks them and breaks hydration. In production we issue a nonce and let Next
 * apply it (`'strict-dynamic'` then trusts the chunks those scripts load). In dev
 * we relax to `'unsafe-eval' 'unsafe-inline'` so HMR works.
 */
export function middleware(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000";
  const nonce = btoa(crypto.randomUUID());

  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    scriptSrc,
    `connect-src 'self' ${apiBase}${isDev ? " ws: wss:" : ""}`,
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  // Next reads the nonce from this request header and applies it to its scripts.
  requestHeaders.set("content-security-policy", csp);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Run on pages, not on Next's own static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
