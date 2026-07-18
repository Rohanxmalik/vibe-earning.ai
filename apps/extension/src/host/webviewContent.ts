import type { ServeResponse } from "@vibearning/shared";

// Single source of truth for the earnings formatter (shared with the status bar).
export { formatEarnings } from "./earnings";

/**
 * Display model for the sidebar "vibearning" card — a vscode-free projection of a served ad so the
 * webview (and its tests) never touch the raw schema or the VS Code API. Strings here are rendered
 * into the DOM via `textContent` (never innerHTML), so ad copy can't inject markup; the only field
 * that reaches CSS is `accent`, which we hard-validate to a hex literal below.
 */
export interface AdView {
  /** Campaign id — lets the line-up mark which card is the live (billed) one. */
  id: string;
  /** Single brand emoji, or null. */
  emoji: string | null;
  /** Paid placements carry the "Sponsored" disclosure; house ads don't. */
  sponsored: boolean;
  /** Headline when structured fields are set, else the legacy copy. */
  title: string;
  /** Secondary line — only when there's a headline AND a tagline. */
  tagline: string | null;
  /** URL host for the "· acme.dev" trailer. */
  host: string;
  /** Validated hex brand tint (accent bar / badge), or the vibearning default. */
  accent: string;
  /** CSP-safe brand logo URL (https/data only), or null to fall back to the emoji. */
  logo: string | null;
}

/** vibearning default accent (lime) when an ad carries no brand color. */
export const DEFAULT_ACCENT = "#84cc16";
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Only ever let a strict hex literal reach the stylesheet; anything else falls back to the default. */
export function safeAccent(hex?: string | null): string {
  return hex && HEX.test(hex.trim()) ? hex.trim() : DEFAULT_ACCENT;
}

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/**
 * Only let an https or data:image URL reach the logo `<img src>` — matches the webview CSP
 * (`img-src ... https: data:`), so a malformed or http/javascript URL can't load (or sneak past
 * the policy); anything else falls back to the emoji. A remote https logo does let the advertiser's
 * server see a load (an IP-level beacon); billing is server-side regardless, so it can't inflate
 * counts — proxy logos through the API later if we want to close even that side channel.
 */
export function safeImageUrl(url?: string | null): string | null {
  if (!url) return null;
  const u = url.trim();
  const httpsOrData = /^https:\/\//i.test(u) || /^data:image\//i.test(u);
  const devLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(u); // dev object storage
  return httpsOrData || devLocal ? u : null;
}

/** Project a served ad onto the sidebar card model (mirrors the status-line body rules). */
export function adViewModel(ad: ServeResponse): AdView {
  const hasHeadline = Boolean(ad.headline && ad.headline.trim());
  return {
    id: ad.campaignId,
    emoji: ad.emoji && ad.emoji.trim() ? ad.emoji.trim() : null,
    sponsored: !ad.isHouseAd,
    title: hasHeadline ? ad.headline!.trim() : ad.copy,
    tagline: hasHeadline && ad.tagline && ad.tagline.trim() ? ad.tagline.trim() : null,
    host: host(ad.url),
    accent: safeAccent(ad.brandColor),
    logo: safeImageUrl(ad.iconUrl),
  };
}

/**
 * The card's state-line copy. The "live" line is auth-honest: it only claims earnings when the dev
 * is actually signed in (anonymous impressions forfeit to the platform, so a signed-out user earns
 * nothing). We never assert "paused" just because the panel is hidden — earnings keep accruing on
 * the always-on status bar regardless, so that would misrepresent reality.
 */
export const LIVE_EARNING = "Live — earning while your AI works";
export const LIVE_SIGNIN = "Live — sign in to start earning from this";
export const IDLE_WAITING = "Waiting for your AI to work…";
export const IDLE_SHOWN = "Ad shown — paused until your AI works again";

/** The live state-line text for the given auth state (signed-out users aren't earning). */
export function liveStateText(signedIn: boolean): string {
  return signedIn ? LIVE_EARNING : LIVE_SIGNIN;
}

/** Build marker shown in the panel's debug line — confirms the loaded webview is the latest bundle. */
export const WEBVIEW_BUILD = "lineup-2";

/**
 * The static webview shell. All dynamic content (the ad card, earnings, idle/live state) is pushed
 * later via `postMessage` and written with `textContent`, so this HTML never interpolates ad data.
 * The CSP is locked to `default-src 'none'`: scripts/styles run only under our per-load `nonce`,
 * and images are restricted to the webview's own resources + https/data (for optional brand logos).
 */
export function webviewHtml(opts: { nonce: string; cspSource: string }): string {
  const { nonce, cspSource } = opts;
  const csp = [
    `default-src 'none'`,
    // https + data (brand logos) + the API's localhost origin (dev object storage).
    `img-src ${cspSource} https: http://localhost:* http://127.0.0.1:* data:`,
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${cspSource}`,
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style nonce="${nonce}">
  :root { --accent: ${DEFAULT_ACCENT}; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 12px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
  }
  .header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
  .brand { display: flex; align-items: center; gap: 6px; font-weight: 600; letter-spacing: .2px; }
  .brand .bolt { color: var(--accent); }
  .earn {
    cursor: pointer; border: 1px solid var(--vscode-panel-border);
    border-radius: 999px; padding: 3px 10px; font-variant-numeric: tabular-nums;
    background: var(--vscode-editor-background); white-space: nowrap;
  }
  .earn:hover { border-color: var(--accent); }
  .earn-delta { color: var(--accent); margin-left: 6px; font-size: .9em; font-weight: 600; }
  .card {
    position: relative; border: 1px solid var(--vscode-panel-border);
    border-left: 3px solid var(--accent); border-radius: 10px;
    padding: 12px 12px 12px 13px; cursor: pointer; transition: border-color .15s ease;
    background: var(--vscode-editor-background);
  }
  .card:hover { border-color: var(--accent); border-left-color: var(--accent); }
  .card-row { display: flex; gap: 10px; align-items: flex-start; }
  .card-body { min-width: 0; flex: 1; } /* min-width:0 lets long text wrap instead of overflow */
  .logo {
    width: 34px; height: 34px; border-radius: 7px; object-fit: contain; flex-shrink: 0;
    background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border);
  }
  .badge {
    display: inline-block; font-size: 10px; text-transform: uppercase; letter-spacing: .6px;
    color: var(--accent); border: 1px solid var(--accent); border-radius: 4px;
    padding: 1px 6px; margin-bottom: 8px; opacity: .9;
  }
  .title { font-weight: 700; font-size: 1.05em; line-height: 1.25; word-break: break-word; }
  .title .emoji { margin-right: 5px; }
  .tagline { margin-top: 3px; opacity: .85; word-break: break-word; }
  .host { margin-top: 8px; font-size: .85em; opacity: .6; }
  .lineup { margin-top: 12px; }
  .lineup-label { font-size: 10px; text-transform: uppercase; letter-spacing: .6px; opacity: .5; margin: 0 2px 6px; }
  .lineup-row { display: flex; align-items: center; gap: 8px; padding: 4px 2px; opacity: .62; }
  .lineup-row .mark {
    width: 20px; height: 20px; flex: 0 0 20px; border-radius: 5px; object-fit: contain;
    display: flex; align-items: center; justify-content: center; font-size: 12px; overflow: hidden;
    background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border);
  }
  .lineup-row .name { font-size: .9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .state { display: flex; align-items: center; gap: 7px; margin: 12px 2px 0; font-size: .85em; opacity: .8; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--vscode-descriptionForeground); }
  .state.live .dot { background: var(--accent); animation: pulse 1.4s ease-in-out infinite; }
  body.offscreen .state.live .dot { animation: none; opacity: .5; } /* not on screen → no live pulse */
  @keyframes pulse { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
  .footer { margin-top: 16px; }
  .btn {
    width: 100%; cursor: pointer; border: none; border-radius: 6px; padding: 7px 10px;
    font-family: inherit; font-size: inherit;
    color: var(--vscode-button-foreground); background: var(--vscode-button-background);
  }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .btn.secondary {
    color: var(--vscode-foreground); background: transparent;
    border: 1px solid var(--vscode-panel-border);
  }
  .hidden { display: none !important; }
  .dbg { margin-top: 12px; font-size: 10px; opacity: .4; font-family: var(--vscode-editor-font-family, monospace); word-break: break-all; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand"><span class="bolt">⚡</span> vibearning</div>
    <div class="earn" id="earn" title="Open your earnings dashboard"><span id="earnLifetime">—</span><span class="earn-delta hidden" id="earnSession"></span></div>
  </div>

  <div class="card hidden" id="card">
    <div class="card-row">
      <img class="logo hidden" id="logo" alt="" />
      <div class="card-body">
        <span class="badge hidden" id="badge">Sponsored</span>
        <div class="title"><span class="emoji hidden" id="emoji"></span><span id="title"></span></div>
        <div class="tagline hidden" id="tagline"></div>
        <div class="host hidden" id="host"></div>
      </div>
    </div>
  </div>

  <div class="lineup hidden" id="lineup">
    <div class="lineup-label">In rotation · up next</div>
    <div id="lineupRows"></div>
  </div>

  <div class="state" id="state"><span class="dot"></span><span id="stateText">${IDLE_WAITING}</span></div>

  <div class="footer">
    <button class="btn" id="auth">Sign in to earn</button>
  </div>

  <div class="dbg" id="dbg">build ${WEBVIEW_BUILD} · loaded</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const T = ${JSON.stringify({ earning: LIVE_EARNING, signin: LIVE_SIGNIN, waiting: IDLE_WAITING, shown: IDLE_SHOWN })};
  const BUILD = ${JSON.stringify(WEBVIEW_BUILD)};
  function dbg(s) { const el = $("dbg"); if (el) el.textContent = "build " + BUILD + " · " + s; }

  let signedIn = false;  // anonymous impressions forfeit — the live line must not claim earnings
  let adShown = false;   // has an ad been shown this session (drives the idle copy)
  let lastEmoji = null;  // stashed so we can fall back to it if the logo image fails to load

  function liveText() { return signedIn ? T.earning : T.signin; }
  function setText(el, text) { el.textContent = text || ""; el.classList.toggle("hidden", !text); }

  function renderActive(v) {
    root.style.setProperty("--accent", v.accent || "${DEFAULT_ACCENT}");
    $("badge").classList.toggle("hidden", !v.sponsored);
    lastEmoji = v.emoji;
    const logo = $("logo");
    if (v.logo) {
      // Logo supersedes the emoji; on a load error, drop back to the emoji so the brand mark is
      // never just a broken-image icon.
      logo.onerror = () => { logo.classList.add("hidden"); setText($("emoji"), lastEmoji); };
      logo.src = v.logo;
      logo.classList.remove("hidden");
      $("emoji").classList.add("hidden");
    } else {
      logo.classList.add("hidden");
      logo.removeAttribute("src");
      setText($("emoji"), lastEmoji);
    }
    $("title").textContent = v.title || "";
    setText($("tagline"), v.tagline);
    setText($("host"), v.host ? "· " + v.host : "");
    $("card").classList.remove("hidden");
  }

  function markFor(v) {
    if (v.logo) {
      const img = document.createElement("img");
      img.className = "mark"; img.alt = ""; img.src = v.logo;
      img.onerror = () => { const s = document.createElement("span"); s.className = "mark"; s.textContent = v.emoji || (v.title ? v.title[0] : "•"); img.replaceWith(s); };
      return img;
    }
    const s = document.createElement("span");
    s.className = "mark"; s.textContent = v.emoji || (v.title ? v.title[0] : "•");
    return s;
  }

  function renderLineup(items) {
    const wrap = $("lineupRows");
    while (wrap.firstChild) wrap.removeChild(wrap.firstChild); // clear (no innerHTML)
    for (const v of items) {
      const row = document.createElement("div");
      row.className = "lineup-row";
      row.title = v.title || "";
      const name = document.createElement("div");
      name.className = "name"; name.textContent = v.title || "";
      row.appendChild(markFor(v));
      row.appendChild(name);
      wrap.appendChild(row);
    }
    $("lineup").classList.toggle("hidden", items.length === 0);
  }

  // Show the whole line-up: the winner as the big "live" card, the rest as dimmed "up next" rows.
  function showAd(activeId, lineup) {
    const list = Array.isArray(lineup) ? lineup : [];
    const active = list.find((a) => a.id === activeId) || list[0];
    if (!active) return;
    renderActive(active);
    renderLineup(list.filter((a) => a.id !== active.id));
    adShown = true;
    $("state").classList.add("live");
    $("stateText").textContent = liveText();
  }

  function idle() {
    $("state").classList.remove("live");
    $("stateText").textContent = adShown ? T.shown : T.waiting;
  }

  function setEarnings(text, isIn, session) {
    signedIn = Boolean(isIn);
    $("earnLifetime").textContent = text;
    setText($("earnSession"), session ? "▲ " + session : "");
    $("earn").title = signedIn
      ? "Lifetime " + text + (session ? " · This session ▲" + session : "") + " — open dashboard"
      : "Open your earnings dashboard";
    const auth = $("auth");
    auth.textContent = signedIn ? "Sign out" : "Sign in to earn";
    auth.className = signedIn ? "btn secondary" : "btn";
    auth.dataset.mode = signedIn ? "signOut" : "signIn";
    // If an ad is live, re-sync its claim so signing in/out updates the earning line immediately.
    if ($("state").classList.contains("live")) $("stateText").textContent = liveText();
  }

  $("card").addEventListener("click", () => vscode.postMessage({ type: "openSponsor" }));
  $("earn").addEventListener("click", () => vscode.postMessage({ type: "openDashboard" }));
  $("auth").addEventListener("click", (e) => vscode.postMessage({ type: e.currentTarget.dataset.mode || "signIn" }));

  window.addEventListener("message", (e) => {
    const m = e.data || {};
    if (m.type === "ad") {
      const n = Array.isArray(m.lineup) ? m.lineup.length : 0;
      showAd(m.activeId, m.lineup);
      dbg("live · " + n + " ad" + (n === 1 ? "" : "s") + " · active=" + (m.activeId || "?"));
    } else if (m.type === "idle") {
      idle();
      dbg("idle");
    } else if (m.type === "earnings") {
      setEarnings(m.text, m.signedIn, m.session);
    } else if (m.type === "visibility") {
      document.body.classList.toggle("offscreen", !m.visible);
    }
  });
</script>
</body>
</html>`;
}
