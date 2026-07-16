import { defineConfig } from "vitest/config";
// Inline empty PostCSS config so Vite doesn't load an unrelated one from a parent/HOME directory.
export default defineConfig({ css: { postcss: { plugins: [] } }, test: { environment: "node" } });
