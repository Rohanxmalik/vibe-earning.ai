import { build } from "esbuild";
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
