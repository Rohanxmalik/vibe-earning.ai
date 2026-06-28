import type { WaitSource } from "../adapters/claudeCode";
import type { WaitHandlers } from "../core/adapter";

/** The subset of a transcript JSONL line we care about. */
export interface TranscriptLine {
  type?: string;
  message?: { content?: unknown; stop_reason?: string | null };
}

export interface ThinkingDeps {
  /** Subscribe to transcript changes; return a dispose. Called once per WaitSource. */
  watch(onChange: () => void): () => void;
  /** Parse the newest transcript's last line (null on any error/empty). */
  readLastLine(): TranscriptLine | null;
  now(): number;
  /** Tick cadence while thinking (default 1000ms). */
  tickMs?: number;
  /** Force-end a turn after this much inactivity (default 90000ms). */
  idleTimeoutMs?: number;
}

function isPrompt(line: TranscriptLine): boolean {
  return line.type === "user" && typeof line.message?.content === "string";
}
function isEndTurn(line: TranscriptLine): boolean {
  return line.type === "assistant" && line.message?.stop_reason === "end_turn";
}

/**
 * A WaitSource that infers Claude Code's "thinking" window from its session transcript:
 * a real user prompt opens the window; an assistant `end_turn` (or an idle-timeout) closes it.
 * The window spans the whole request→response, including tool-call gaps. Fail-safe: any
 * read/parse error is swallowed so a broken host can never break the editor.
 */
export function createThinkingWaitSource(deps: ThinkingDeps): WaitSource {
  const tickMs = deps.tickMs ?? 1000;
  const idleMs = deps.idleTimeoutMs ?? 90_000;

  return (handlers: WaitHandlers) => {
    let thinking = false;
    let lastActivity = deps.now();
    let timer: ReturnType<typeof setInterval> | null = null;

    const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };

    const endTurn = () => {
      if (!thinking) return;
      thinking = false;
      stopTimer();
      try { handlers.onWaitEnd(); } catch { /* never break the editor */ }
    };

    const startTurn = () => {
      if (thinking) return;
      thinking = true;
      lastActivity = deps.now();
      try { handlers.onWaitStart(); } catch { /* never break the editor */ }
      timer = setInterval(() => {
        if (!thinking) return;
        if (deps.now() - lastActivity > idleMs) { endTurn(); return; }
        try { handlers.onTick?.(); } catch { /* swallow */ }
      }, tickMs);
    };

    const onChange = () => {
      let line: TranscriptLine | null = null;
      try { line = deps.readLastLine(); } catch { line = null; }
      if (!line) return;
      if (isPrompt(line)) { startTurn(); return; }
      if (thinking) lastActivity = deps.now();
      if (isEndTurn(line)) endTurn();
    };

    let disposeWatch: () => void = () => {};
    try { disposeWatch = deps.watch(onChange); } catch { disposeWatch = () => {}; }

    return () => {
      stopTimer();
      try { disposeWatch(); } catch { /* swallow */ }
    };
  };
}
