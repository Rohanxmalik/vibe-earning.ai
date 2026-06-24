const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000";

// Security headers for the portal (helmet only covers the API). CSP allows the app's
// own assets + XHR to the API origin; inline styles are permitted (we use style attrs).
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'" + (process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"),
  `connect-src 'self' ${apiBase}`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@kbi/shared"],
  // Standalone output is opt-in (the Docker build sets NEXT_OUTPUT=standalone).
  // Left off by default because the standalone copy step needs symlink perms that
  // Windows dev machines lack; normal `next build`/`next dev` are unaffected.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
