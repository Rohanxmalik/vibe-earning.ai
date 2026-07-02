// Security headers for the portal (helmet only covers the API). The Content-Security-Policy
// is set per-request in middleware.ts so it can carry a nonce for Next's inline scripts.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@vibearning/shared"],
  // Standalone output is opt-in (the Docker build sets NEXT_OUTPUT=standalone).
  // Left off by default because the standalone copy step needs symlink perms that
  // Windows dev machines lack; normal `next build`/`next dev` are unaffected.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
