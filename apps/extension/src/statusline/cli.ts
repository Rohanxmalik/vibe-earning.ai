#!/usr/bin/env node
/**
 * Claude Code status-line integration (PROTOTYPE — verify against a live Claude Code).
 *
 * Claude Code can render a custom status line by running a command and showing its
 * stdout (configured under `statusLine` in ~/.claude/settings.json). This script asks
 * our API for the current top ad on the `claude-code-terminal` surface and prints one
 * sponsored line. It NEVER throws or hangs the agent: any error → prints nothing.
 *
 * This is the *official, non-adversarial* injection point (no UI hacking). Billing for a
 * status-line impression is intentionally NOT done here — the status line refreshes on a
 * timer with no reliable view-time, so impression/▼ accounting stays in the extension
 * pipeline. See docs/extension/claude-code-statusline.md.
 */
import { composeStatusLine } from "./compose";
import type { ServeResponse } from "@kbi/shared";

const API = process.env.KICKBACKS_API ?? "http://localhost:3000";
const SURFACE = "claude-code-terminal";
const TIMEOUT_MS = 800; // keep the status line snappy; bail fast on a slow network

async function main(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/serve?surface=${SURFACE}&count=1`, { signal: controller.signal });
    if (!res.ok) return;
    const body = (await res.json()) as { ad: ServeResponse | null };
    const line = composeStatusLine(body.ad ?? null);
    if (line) process.stdout.write(line);
  } catch {
    // swallow — never break the user's status line
  } finally {
    clearTimeout(timer);
  }
}

void main();
