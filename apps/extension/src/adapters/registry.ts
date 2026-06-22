import type { SpinnerAdapter } from "../core/adapter";
import { ClaudeCodeAdapter } from "./claudeCode";
import { CodexAdapter } from "./codex";
import { GeminiCliAdapter } from "./geminiCli";

export function allAdapters(): SpinnerAdapter[] {
  return [new ClaudeCodeAdapter(), new CodexAdapter(), new GeminiCliAdapter()];
}

/** First available real adapter, else the provided fallback (e.g. MockAdapter in dev). */
export function firstAvailable(fallback: SpinnerAdapter): SpinnerAdapter {
  return allAdapters().find((a) => a.isAvailable()) ?? fallback;
}
