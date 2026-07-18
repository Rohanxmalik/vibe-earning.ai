import { defineConfig } from "@playwright/test";

// Opt-in browser E2E for the portal. Run with: pnpm --filter @vibearning/portal test:e2e
// (requires `npx playwright install chromium` once). Not part of `pnpm test`/CI vitest.
const PORT = 3101;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
