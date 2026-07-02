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
 * Derive the current state line from raw transcript JSONL: a turn is "in progress" when the
 * latest user prompt occurs AFTER the latest assistant `end_turn`. We compare positions rather
 * than reading the physically-last line because, mid-turn, the prompt is followed by assistant
 * `tool_use` / `tool_result` lines (and Claude Code's bookkeeping lines), so the last line is
 * rarely the prompt itself. Returns the prompt line while thinking, the `end_turn` line once the
 * turn has finished, or null if neither is present. Unparseable lines are skipped (fail-safe).
 */
export function currentStateLine(raw: string): TranscriptLine | null {
  const lines = raw.split("\n");
  let promptLine: TranscriptLine | null = null;
  let promptIdx = -1;
  let endLine: TranscriptLine | null = null;
  let endIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].trim();
    if (!s) continue;
    let obj: TranscriptLine;
    try {
      obj = JSON.parse(s) as TranscriptLine;
    } catch {
      continue;
    }
    if (isPrompt(obj)) {
      promptLine = obj;
      promptIdx = i;
    } else if (isEndTurn(obj)) {
      endLine = obj;
      endIdx = i;
    }
  }
  if (promptLine && promptIdx > endIdx) return promptLine; // a turn is in progress
  if (endLine) return endLine; // the last turn has finished
  return promptLine; // a prompt with no end_turn seen yet
}

/**
 * The state line to act on, accounting for STALENESS. Claude Code does not always write an
 * explicit `end_turn` (interrupted/abandoned turns), and it sometimes leaves a trailing
 * `user` text line — so the content heuristic alone can latch "in progress" forever. When the
 * transcript hasn't been appended within `activityWindowMs`, we treat the turn as ended (the
 * session is idle) and return a synthetic `end_turn`, so the ad doesn't linger while idle. The
 * window must exceed the longest gap between writes during a live turn (tool calls run silently
 * for a while), so it is generous; a cleanly-finished turn still hides immediately via its real
 * `end_turn` line. 60s: a single web search / long tool call can run well over 12s with no
 * transcript write, and the old 12s window flipped the panel to idle mid-turn (it read the gap as
 * "ended"). 60s covers typical tool-call gaps; an abandoned turn (no `end_turn`) clears within 60s.
 */
export function stateLineWithStaleness(
  raw: string,
  mtimeMs: number,
  nowMs: number,
  activityWindowMs = 60_000,
): TranscriptLine | null {
  if (nowMs - mtimeMs > activityWindowMs) {
    return { type: "assistant", message: { stop_reason: "end_turn" } };
  }
  return currentStateLine(raw);
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
      if (thinking) lastActivity = deps.now(); // observing live state keeps the turn alive
      if (isPrompt(line)) { startTurn(); return; }
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
