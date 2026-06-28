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

/**
 * A real user prompt: a `user` line whose content is text the human typed. Claude Code
 * writes the prompt as a content ARRAY of blocks (`[{type:"text",...}]`), not a bare string,
 * so we accept either. A `user` line carrying a `tool_result` block is the agent feeding a
 * tool's output back to itself — NOT a new turn — so it is excluded.
 */
function isPrompt(line: TranscriptLine): boolean {
  if (line.type !== "user") return false;
  const c = line.message?.content;
  if (typeof c === "string") return c.trim().length > 0;
  if (Array.isArray(c)) {
    const blocks = c as Array<{ type?: string }>;
    return blocks.some((b) => b?.type === "text") && !blocks.some((b) => b?.type === "tool_result");
  }
  return false;
}
function isEndTurn(line: TranscriptLine): boolean {
  return line.type === "assistant" && line.message?.stop_reason === "end_turn";
}

/**
 * From raw transcript JSONL text, return the last STATE-DETERMINING line — a `user` or
 * `assistant` message — scanning from the end and skipping Claude Code's bookkeeping lines
 * (`attachment`, `file-history-snapshot`, `last-prompt`, `ai-title`, `queue-operation`, …)
 * and any unparseable line. The newest prompt line is quickly buried under such bookkeeping,
 * so reading only the physically-last line misses it; this finds the real signal. Returns
 * null if there is no user/assistant line.
 */
export function lastMeaningfulLine(raw: string): TranscriptLine | null {
  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const s = lines[i].trim();
    if (!s) continue;
    let obj: TranscriptLine;
    try {
      obj = JSON.parse(s) as TranscriptLine;
    } catch {
      continue;
    }
    if (obj.type === "user" || obj.type === "assistant") return obj;
  }
  return null;
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
