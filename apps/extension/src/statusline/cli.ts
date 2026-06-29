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
import { composeStatusLine } from "./compose";
import { tickRotation, type BillingState } from "./billing";
import { loadToken, loadState, saveState } from "./store";
import { resolveSurface } from "./surface";
import type { ServeResponse, Surface } from "@kbi/shared";

const API = process.env.KICKBACKS_API ?? "http://localhost:3000";
const SURFACE = resolveSurface(process.env.KICKBACKS_SURFACE); // claude-code-terminal | codex-panel | gemini-cli-terminal | ...
const ROTATION_COUNT = 3; // request the top-N ads and rotate through them
const TIMEOUT_MS = 800; // keep the status line snappy

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
}

function authHeaders(token: string | undefined): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * Wrap text in a 24-bit ANSI truecolor sequence so the brand color shows in Claude Code's status
 * line (which renders ANSI). VS Code's editor status bar can't render ANSI — it tints via
 * `item.color` instead — so this lives only in the terminal/status-line path, not in `compose`.
 * No-op on a malformed hex.
 */
export function ansiBrand(hex: string | null | undefined, text: string): string {
  const m = hex ? /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex) : null;
  if (!m) return text;
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
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
  if (deps.killActive) return "";

  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  const rotationCount = deps.rotationCount ?? ROTATION_COUNT;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await deps.fetchFn(
      `${deps.api}/serve?surface=${deps.surface}&count=${rotationCount}`,
      { signal: controller.signal, headers: authHeaders(deps.token) },
    );
    if (!res.ok) return "";
    const ads = ((await res.json()) as { ads?: ServeResponse[]; ad?: ServeResponse | null }).ads ?? [];

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

    const line = composeStatusLine(ad);
    // Tint with the brand color in the terminal (ANSI); the returned value stays plain so callers
    // and tests see the composed text unchanged.
    if (line) deps.write(ansiBrand(ad?.brandColor, line));
    return line;
  } catch {
    // swallow — never break the user's status line
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

async function main(): Promise<void> {
  const token = loadToken();
  const killActive = await probeKillswitch(API, fetch, TIMEOUT_MS);
  await runStatusLine({
    api: API,
    surface: SURFACE,
    token,
    fetchFn: fetch,
    now: () => Date.now(),
    loadState,
    saveState,
    write: (line) => process.stdout.write(line),
    killActive,
  });
}

// Only auto-run when executed as a script, not when imported by a test.
if (require.main === module) {
  void main();
}
