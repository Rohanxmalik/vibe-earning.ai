#!/usr/bin/env node
/**
 * Claude Code status-line integration — the OFFICIAL extension point (per
 * docs/extension/claude-code-statusline.md). Claude Code renders a custom status line by
 * running a command and showing its stdout (configured under `statusLine` in
 * ~/.claude/settings.json). On each refresh this script:
 *   1. asks the API for the top-N ads on the configured surface (default claude-code-terminal),
 *   2. rotates through them (each held, then advanced) with conservative per-window billing,
 *   3. if a window has earned an impression AND the dev is signed in, posts an authenticated
 *      /events impression (credited to the signed-in dev, idempotent per nonce),
 *   4. prints one sponsored line into Claude Code's status line.
 *
 * It NEVER throws or hangs the agent: any error / slow network → prints nothing (or the line it
 * already had), so it can never break or hang the agent.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { composeStatusLine } from "./compose";
import { tickRotation, type BillingState } from "./billing";
import { loadToken, loadState, saveState } from "./store";
import { resolveSurface } from "./surface";
import type { ServeResponse, Surface } from "@vibearning/shared";

// Prod default; set VIBEARNING_API=http://localhost:3000 in the statusLine command for local dev.
const API = process.env.VIBEARNING_API ?? "https://api.vibearning.in";
const SURFACE = resolveSurface(process.env.VIBEARNING_SURFACE); // claude-code-terminal | codex-panel | gemini-cli-terminal | ...
const ROTATION_COUNT = 3; // request the top-N ads and rotate through them
// Per-request budget. 800ms was too aggressive: at session start Claude Code fires the statusLine
// alongside a swarm of hooks, and a cold spawn + fetch under that CPU spike could abort before the
// API answered (heartbeat showed "(no ad served)"). 1500ms keeps it snappy but tolerant of spikes.
const TIMEOUT_MS = 1500;

interface KillswitchProbe {
  active?: boolean;
}

/** Everything the run depends on, injected so the whole flow is unit-testable. */
export interface StatusLineDeps {
  api: string;
  surface: Surface;
  token: string | undefined;
  fetchFn: typeof fetch;
  now: () => number;
  loadState: () => BillingState;
  saveState: (state: BillingState) => void;
  /** Writes the composed line to stdout (Claude Code reads this). */
  write: (line: string) => void;
  rotationCount?: number;
  timeoutMs?: number;
  /** Optional kill flag from a prior /config probe; when true, serve/bill nothing. */
  killActive?: boolean;
  /** Diagnostics: called once with why this run rendered (or didn't) — for the heartbeat file. */
  onDiagnostic?: (reason: string) => void;
}

function authHeaders(token: string | undefined): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * Style text for Claude Code's status line with real ANSI: **bold** always, plus the brand color
 * (24-bit truecolor) when a valid hex is given. Terminals render ANSI bold using their own font —
 * cleaner and copy-paste-safe vs. Unicode math-bold glyphs (which the VS Code editor status bar
 * needs instead, since it can't render ANSI). So compose plain here and bold via ANSI.
 */
export function ansiStyle(text: string, hex?: string | null): string {
  const codes = [1]; // SGR 1 = bold
  const m = hex ? /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex) : null;
  if (m) codes.push(38, 2, parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)); // truecolor fg
  return `\x1b[${codes.join(";")}m${text}\x1b[0m`;
}

/**
 * Pure-ish runner for one status-line refresh. Returns the line it wrote (or "" if nothing),
 * which makes assertions easy. Mirrors the in-editor Orchestrator loop but for the official
 * status-line surface:
 *   - killswitch active → render nothing, bill nothing;
 *   - fetch top-N ads (authenticated when a token is present so /serve is attributed);
 *   - rotate + decide billing conservatively (one impression per window, after the view threshold);
 *   - post the impression ONLY when signed in (anonymous impressions forfeit to the platform);
 *   - persist window state so the nonce is stable across refreshes (server dedupes replays);
 *   - swallow every error — the agent's own status line shows through unchanged.
 */
export async function runStatusLine(deps: StatusLineDeps): Promise<string> {
  // Killswitch: serve/bill nothing, leave the agent's own status line untouched.
  if (deps.killActive) {
    deps.onDiagnostic?.("killswitch");
    return "";
  }

  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  const rotationCount = deps.rotationCount ?? ROTATION_COUNT;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await deps.fetchFn(
      `${deps.api}/serve?surface=${deps.surface}&count=${rotationCount}`,
      { signal: controller.signal, headers: authHeaders(deps.token) },
    );
    if (!res.ok) {
      deps.onDiagnostic?.(`serve_http_${res.status}`);
      return "";
    }
    const ads = ((await res.json()) as { ads?: ServeResponse[]; ad?: ServeResponse | null }).ads ?? [];
    if (ads.length === 0) deps.onDiagnostic?.("no_inventory");

    // Rotate through the top-N ads with conservative per-window billing. Attribution requires a
    // signed-in dev (token); anonymous impressions would forfeit to the platform, so we only post
    // the /events impression when authenticated.
    const state = deps.loadState();
    const { nextState, bill, ad } = tickRotation(state, ads, deps.now());
    if (bill && deps.token) {
      await deps
        .fetchFn(`${deps.api}/events`, {
          method: "POST",
          signal: controller.signal,
          headers: { "content-type": "application/json", ...authHeaders(deps.token) },
          body: JSON.stringify({
            installId: bill.installId,
            campaignId: bill.campaignId,
            surface: deps.surface,
            type: bill.type,
            nonce: bill.nonce,
            visibleMs: bill.visibleMs,
          }),
        })
        .catch(() => undefined); // a failed impression must never break the status line
    }
    deps.saveState(nextState);

    // Compose PLAIN (no Unicode math-bold) for the terminal, then apply real ANSI bold + brand
    // color. The returned value stays plain so callers and the heartbeat read clean text.
    const line = composeStatusLine(ad, { bold: false });
    if (line) deps.write(ansiStyle(line, ad?.brandColor));
    if (line) deps.onDiagnostic?.("ok");
    else if (ads.length > 0) deps.onDiagnostic?.("empty_line");
    return line;
  } catch {
    // swallow — never break the user's status line
    deps.onDiagnostic?.("error_or_timeout");
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/** Best-effort, bounded killswitch probe. Any error/timeout → not active (fail open: keep serving). */
async function probeKillswitch(api: string, fetchFn: typeof fetch, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(`${api}/config`, { signal: controller.signal });
    if (!res.ok) return false;
    const body = (await res.json()) as KillswitchProbe;
    return Boolean(body.active);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Diagnostics breadcrumb: overwrite a single small file each run so you can confirm Claude Code is
 * actually invoking this status-line command (a fresh timestamp = it ran). Bounded (no growth),
 * fail-safe — never affects the rendered line.
 */
function writeHeartbeat(line: string, surface: string, token: string | undefined, reason: string): void {
  try {
    const dir = join(homedir(), ".vibearning");
    mkdirSync(dir, { recursive: true });
    const signedIn = token ? "signed-in" : "anonymous";
    writeFileSync(
      join(dir, "statusline-last.txt"),
      `${new Date().toISOString()}  [${surface}] [${signedIn}] [${reason}]  ${line || "(no line)"}\n`,
    );
  } catch {
    /* diagnostics only */
  }
}

async function main(): Promise<void> {
  const token = loadToken();
  const killActive = await probeKillswitch(API, fetch, TIMEOUT_MS);
  let reason = "ok";
  const line = await runStatusLine({
    api: API,
    surface: SURFACE,
    token,
    fetchFn: fetch,
    now: () => Date.now(),
    loadState,
    saveState,
    write: (l) => process.stdout.write(l),
    killActive,
    onDiagnostic: (r) => { reason = r; },
  });
  writeHeartbeat(line, SURFACE, token, reason);
}

// Only auto-run when executed as a script, not when imported by a test.
if (require.main === module) {
  void main();
}
