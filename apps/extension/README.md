# vibearning — earn while your AI thinks

**vibearning** pays you for the single, tasteful **Sponsored** line shown while your AI coding agent (Claude Code today; Codex & Gemini next) is thinking. Developers earn a share of the ad revenue for every verified, viewable impression — cashed out to **UPI** for developers in India.

No ads while you type. One line, only during the agent's wait. A global killswitch can turn serving off instantly.

---

## How it works

1. **Install** the extension and **sign in** (email + password — the same account as the web dashboard).
2. While your AI agent works, one **Sponsored** line appears in its status/spinner area — e.g.
   `⚡ 🍔 Sponsored: Zomato — Delivering Happiness · zomato.com`
3. You **earn** a share of the revenue for each impression that was actually on‑screen long enough to count. Withdraw to UPI once you pass the minimum.

## What you'll see

- **Sidebar panel** (⚡ vibearning in the Activity Bar): a branded ad card — logo, headline, tagline, brand‑color accent — plus your **live earnings** and a ▲ "this session" ticker. When several ads are in rotation, the winner shows big with the rest listed under **"In rotation · up next"**.
- **Status‑bar line**: the same sponsored line, always‑on at the bottom while the agent works.
- **Live earnings**: your lifetime total updates as impressions bill; click it to open your dashboard.

## Supported agents

| Agent | In‑editor ad | Official status‑line |
|---|---|---|
| **Claude Code** | ✅ | ✅ |
| **Codex** | 🔜 (ad inventory is ready) | ✅ via `VIBEARNING_SURFACE=codex-panel` |
| **Gemini CLI** | 🔜 | ✅ |

The extension ships a standalone status‑line script (`dist/statusline.js`) that plugs into each agent's **official** status‑line hook — no UI hacking. See `docs/extension/claude-code-statusline.md` for setup.

## Privacy

vibearning is built to be minimal and honest about data:

- It reads your local AI‑agent session transcript files **only to detect when the agent is thinking** (so the ad shows at the right moment). **Your prompts, code, and transcript contents never leave your machine.**
- When you're **signed in**, it sends impression events — *which* ad was shown and for *how long*, tied to your account — so you get paid. Signed out, nothing is attributed and nothing is billed.
- A per‑install anonymous id is used for basic anti‑fraud. See the full Privacy Policy and Terms of Service before use.

## Configuration

| Setting | Default | Purpose |
|---|---|---|
| `vibearning.apiUrl` | `https://api.vibearning.in` | vibearning API base (change only if self‑hosting). |
| `vibearning.portalUrl` | `https://vibearning.in` | Web dashboard opened by the earnings item. |

Environment variables `VIBEARNING_API` / `VIBEARNING_PORTAL` override the settings (handy for local development).

## Commands

- **vibearning: Sign in** / **Sign out**
- **vibearning: Open the current sponsor**
- **vibearning: Open your earnings dashboard**

---

## For contributors

```bash
pnpm --filter vibearning build   # → dist/extension.js + dist/statusline.js
pnpm --filter vibearning test    # unit tests
pnpm --filter vibearning package # → vibearning.vsix
```

`.vscodeignore` excludes sources/tests, so only `dist/` + `media/` ship in the `.vsix`.

## License

Proprietary — see [LICENSE](LICENSE). © 2026 vibearning. All rights reserved.
