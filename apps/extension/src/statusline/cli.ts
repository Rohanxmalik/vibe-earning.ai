#!/usr/bin/env node
/**
 * Claude Code status-line integration (PROTOTYPE — verify against a live Claude Code).
 *
 * Claude Code renders a custom status line by running a command and showing its stdout
 * (configured under `statusLine` in ~/.claude/settings.json). On each refresh this script:
 *   1. asks the API for the top ad on the `claude-code-terminal` surface,
 *   2. decides — conservatively — whether this shown window has earned an impression,
 *   3. if so, posts an authenticated /events impression (credited to the signed-in dev),
 *   4. prints one sponsored line.
 *
 * It NEVER throws or hangs the agent: any error → prints whatever line it had (or nothing).
 * See docs/extension/claude-code-statusline.md.
 */
import { composeStatusLine } from "./compose";
import { tickRotation } from "./billing";
import { loadToken, loadState, saveState } from "./store";
import type { ServeResponse } from "@kbi/shared";

const API = process.env.KICKBACKS_API ?? "http://localhost:3000";
const SURFACE = "claude-code-terminal";
const ROTATION_COUNT = 3; // request the top-N ads and rotate through them
const TIMEOUT_MS = 800; // keep the status line snappy

function authHeaders(token: string | undefined): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function main(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const token = loadToken();
  try {
    const res = await fetch(`${API}/serve?surface=${SURFACE}&count=${ROTATION_COUNT}`, { signal: controller.signal, headers: authHeaders(token) });
    if (!res.ok) return;
    const ads = ((await res.json()) as { ads?: ServeResponse[]; ad: ServeResponse | null }).ads ?? [];

    // Rotate through the top-N ads (each held, then advanced), with conservative
    // per-window billing. Attribution requires a signed-in dev (token); anonymous
    // impressions would forfeit to the platform, so we only bill when authenticated.
    const state = loadState();
    const { nextState, bill, ad } = tickRotation(state, ads, Date.now());
    if (bill && token) {
      await fetch(`${API}/events`, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({ installId: bill.installId, campaignId: bill.campaignId, surface: SURFACE, type: bill.type, nonce: bill.nonce, visibleMs: bill.visibleMs }),
      }).catch(() => undefined);
    }
    saveState(nextState);

    const line = composeStatusLine(ad);
    if (line) process.stdout.write(line);
  } catch {
    // swallow — never break the user's status line
  } finally {
    clearTimeout(timer);
  }
}

void main();
