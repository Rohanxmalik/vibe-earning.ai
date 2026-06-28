import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createThinkingWaitSource, lastMeaningfulLine, type TranscriptLine } from "./thinkingWaitSource";
import type { WaitHandlers } from "../core/adapter";

const prompt: TranscriptLine = { type: "user", message: { content: "do a thing" } };
// Real Claude Code writes the prompt as a content ARRAY of blocks, not a string.
const promptBlocks: TranscriptLine = { type: "user", message: { content: [{ type: "text", text: "hi" }] } };
const toolResult: TranscriptLine = { type: "user", message: { content: [{ type: "tool_result" }] } };
const endTurn: TranscriptLine = { type: "assistant", message: { stop_reason: "end_turn" } };
const midTurn: TranscriptLine = { type: "assistant", message: { stop_reason: "tool_use" } };

function setup(opts: { lines?: TranscriptLine[] } = {}) {
  let onChange: () => void = () => {};
  let nextLine: TranscriptLine | null = null;
  let t = 0;
  const handlers: WaitHandlers = { onWaitStart: vi.fn(), onWaitEnd: vi.fn(), onTick: vi.fn() };
  const watchDispose = vi.fn();
  const source = createThinkingWaitSource({
    watch: (cb) => { onChange = cb; return watchDispose; },
    readLastLine: () => nextLine,
    now: () => t,
  });
  const dispose = source(handlers);
  return {
    handlers, watchDispose, dispose,
    emit: (line: TranscriptLine | null) => { nextLine = line; onChange(); },
    advance: (ms: number) => { t += ms; },
  };
}

describe("createThinkingWaitSource", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires onWaitStart when a real user prompt is appended", () => {
    const { handlers, emit } = setup();
    emit(prompt);
    expect(handlers.onWaitStart).toHaveBeenCalledOnce();
  });

  it("fires onWaitStart when the prompt content is a block array (real CC format)", () => {
    const { handlers, emit } = setup();
    emit(promptBlocks);
    expect(handlers.onWaitStart).toHaveBeenCalledOnce();
  });

  it("does NOT treat a tool_result as a new turn start", () => {
    const { handlers, emit } = setup();
    emit(toolResult);
    expect(handlers.onWaitStart).not.toHaveBeenCalled();
  });

  it("does not start a second turn while already thinking", () => {
    const { handlers, emit } = setup();
    emit(prompt);
    emit(prompt);
    expect(handlers.onWaitStart).toHaveBeenCalledOnce();
  });

  it("fires onWaitEnd on an assistant end_turn line", () => {
    const { handlers, emit } = setup();
    emit(prompt);
    emit(endTurn);
    expect(handlers.onWaitEnd).toHaveBeenCalledOnce();
  });

  it("does NOT end the turn on a non-end_turn assistant line (tool_use)", () => {
    const { handlers, emit } = setup();
    emit(prompt);
    emit(midTurn);
    expect(handlers.onWaitEnd).not.toHaveBeenCalled();
  });

  it("fires onTick on the interval while thinking", () => {
    const { handlers, emit } = setup();
    emit(prompt);
    vi.advanceTimersByTime(3000); // 3 ticks at 1s
    expect((handlers.onTick as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("stops ticking after the turn ends", () => {
    const { handlers, emit } = setup();
    emit(prompt);
    emit(endTurn);
    (handlers.onTick as ReturnType<typeof vi.fn>).mockClear();
    vi.advanceTimersByTime(3000);
    expect(handlers.onTick).not.toHaveBeenCalled();
  });

  it("force-ends a stuck turn after the idle timeout", () => {
    const { handlers, emit, advance } = setup();
    emit(prompt);
    advance(91_000);             // clock jumps past 90s with no new activity
    vi.advanceTimersByTime(1000); // next tick observes the gap and ends
    expect(handlers.onWaitEnd).toHaveBeenCalledOnce();
  });

  it("swallows a throwing readLastLine (never breaks the editor)", () => {
    let onChange: () => void = () => {};
    const source = createThinkingWaitSource({
      watch: (cb) => { onChange = cb; return () => {}; },
      readLastLine: () => { throw new Error("fs blew up"); },
      now: () => 0,
    });
    source({ onWaitStart: vi.fn(), onWaitEnd: vi.fn(), onTick: vi.fn() });
    expect(() => onChange()).not.toThrow();
  });

  it("dispose tears down the watcher and timers", () => {
    const { watchDispose, dispose, handlers, emit } = setup();
    emit(prompt);
    dispose();
    expect(watchDispose).toHaveBeenCalledOnce();
    (handlers.onTick as ReturnType<typeof vi.fn>).mockClear();
    vi.advanceTimersByTime(3000);
    expect(handlers.onTick).not.toHaveBeenCalled();
  });
});

describe("lastMeaningfulLine", () => {
  const userLine = JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "write a haiku" }] } });
  const attach = JSON.stringify({ type: "attachment", attachment: {} });
  const snapshot = JSON.stringify({ type: "file-history-snapshot" });
  const asstEnd = JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text" }], stop_reason: "end_turn" } });

  it("returns the user prompt even when bookkeeping lines were written after it", () => {
    // The real lifecycle: a user line, then several attachment/snapshot lines on top.
    const raw = [userLine, attach, attach, snapshot].join("\n") + "\n";
    const line = lastMeaningfulLine(raw);
    expect(line?.type).toBe("user");
  });

  it("returns the assistant end_turn line when it is the latest meaningful line", () => {
    const raw = [userLine, attach, asstEnd, snapshot].join("\n");
    const line = lastMeaningfulLine(raw);
    expect(line?.type).toBe("assistant");
    expect(line?.message?.stop_reason).toBe("end_turn");
  });

  it("skips unparseable/blank lines and returns null when no user/assistant line exists", () => {
    const raw = [attach, "not json", "", snapshot].join("\n");
    expect(lastMeaningfulLine(raw)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(lastMeaningfulLine("")).toBeNull();
  });
});
