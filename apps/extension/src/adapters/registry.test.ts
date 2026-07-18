import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { allAdapters, firstAvailable } from "./registry";
import { MockAdapter } from "../core/mockAdapter";

// The Claude Code adapter now self-detects via the environment (CLAUDECODE / CLAUDE_CODE_ENTRYPOINT).
// These tests control those vars so selection is deterministic regardless of where the suite runs
// (e.g. vitest launched *by* Claude Code would otherwise inherit CLAUDECODE=1).
describe("adapter registry", () => {
  let saved: { code?: string; entry?: string };
  beforeEach(() => {
    saved = { code: process.env.CLAUDECODE, entry: process.env.CLAUDE_CODE_ENTRYPOINT };
    delete process.env.CLAUDECODE;
    delete process.env.CLAUDE_CODE_ENTRYPOINT;
  });
  afterEach(() => {
    if (saved.code === undefined) delete process.env.CLAUDECODE; else process.env.CLAUDECODE = saved.code;
    if (saved.entry === undefined) delete process.env.CLAUDE_CODE_ENTRYPOINT; else process.env.CLAUDE_CODE_ENTRYPOINT = saved.entry;
  });

  it("lists the three real adapters", () => {
    expect(allAdapters().map((a) => a.surface).sort()).toEqual(
      ["claude-code-panel", "codex-panel", "gemini-cli-terminal"],
    );
  });

  it("falls back to a provided default when no agent is detected", () => {
    const fallback = new MockAdapter();
    expect(firstAvailable(fallback)).toBe(fallback); // Codex/Gemini stubs unavailable; no Claude Code env
  });

  it("selects the Claude Code adapter when running under Claude Code", () => {
    process.env.CLAUDECODE = "1";
    const fallback = new MockAdapter();
    expect(firstAvailable(fallback).surface).toBe("claude-code-panel");
  });
});
