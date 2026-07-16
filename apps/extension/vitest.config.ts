import { defineConfig } from "vitest/config";
export default defineConfig({
  // Inline (empty) PostCSS config so Vite doesn't walk parent/HOME dirs looking for one — these are
  // node-only unit tests with no CSS, and an unrelated postcss.config up the tree would crash them.
  css: { postcss: { plugins: [] } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
