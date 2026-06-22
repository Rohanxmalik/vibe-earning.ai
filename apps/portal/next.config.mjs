/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@kbi/shared"],
  // Standalone output is opt-in (the Docker build sets NEXT_OUTPUT=standalone).
  // Left off by default because the standalone copy step needs symlink perms that
  // Windows dev machines lack; normal `next build`/`next dev` are unaffected.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};
export default nextConfig;
