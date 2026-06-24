# Kickbacks-India

Earn for the single sponsored line shown while your AI coding agent (Claude Code, Codex, Gemini) is thinking. Paid to Indian developers via UPI.

## How it works

1. Install the extension and sign in.
2. While your AI agent works, one tasteful **Sponsored** line appears in its spinner/status line.
3. You earn a share of the ad revenue for each verified, viewable impression — withdraw to UPI once you pass the minimum.

No ads while you type. One line, only during the agent's wait. A global killswitch can disable serving instantly.

## Status-line integration (Claude Code / Codex / Gemini)

The extension ships a standalone status-line script (`dist/statusline.js`) that plugs into each agent's **official** status-line hook — no UI hacking. See [`docs/extension/claude-code-statusline.md`](../../docs/extension/claude-code-statusline.md) for setup. Set `KICKBACKS_SURFACE` to target Codex/Gemini with the same script.

## Build

```bash
pnpm --filter @kbi/extension build   # → dist/extension.js + dist/statusline.js
pnpm --filter @kbi/extension test    # unit tests (core is fully tested)
```

## Publishing to the VS Code Marketplace

The package is publish-ready except for three steps that need your accounts/assets:

1. **Create a Microsoft/Azure DevOps publisher** and set `"publisher"` in `package.json` (currently `"kickbacks"` placeholder).
2. **Rename for the marketplace:** the workspace name is scoped (`@kbi/extension`); vsce needs an unscoped `"name"` (e.g. `"kickbacks-india"`). Change it at publish time (and drop `"private": true`).
3. **Add a 128×128 PNG icon** at `media/icon.png` and set `"icon": "media/icon.png"` (a brand SVG is at `apps/portal/app/icon.svg` to export from).

Then:

```bash
npx @vscode/vsce package    # produces a .vsix
npx @vscode/vsce publish    # needs the publisher PAT
```

`.vscodeignore` already excludes sources/tests so only `dist/` ships.
