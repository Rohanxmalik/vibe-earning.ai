import { build } from "esbuild";

// The VS Code extension.
await build({
  entryPoints: ["src/host/extension.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
  outfile: "dist/extension.js",
  sourcemap: true,
});

// Standalone Claude Code status-line script (run by Claude Code via the `statusLine`
// setting — see docs/extension/claude-code-statusline.md). No VS Code dependency.
await build({
  entryPoints: ["src/statusline/cli.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: "dist/statusline.js",
  sourcemap: true,
});
