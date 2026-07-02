import { describe, it, expect, vi } from "vitest";
import { ClaudeCodeAdapter, detectClaudeCode, type StatusSink } from "./claudeCode";
import { boldText } from "../statusline/compose";
import type { WaitHandlers } from "../core/adapter";
import type { ServeResponse } from "@vibearning/shared";

const paidAd: ServeResponse = {
  adId: "a1", campaignId: "c1", copy: "TurboDB — ship faster", url: "https://turbo.dev", iconUrl: null, isHouseAd: false,
};
const houseAd: ServeResponse = { ...paidAd, campaignId: "house", copy: "Try vibearning", isHouseAd: true };

function fakeSink() {
  const lines: string[] = [];
  let restored = 0;
  const sink: StatusSink = {
    write: (line) => { lines.push(line); },
    restore: () => { restored += 1; },
  };
  return { sink, lines, restoredCount: () => restored, last: () => lines[lines.length - 1] };
}

describe("detectClaudeCode", () => {
  it("is true when CLAUDECODE=1", () => {
    expect(detectClaudeCode({ CLAUDECODE: "1" } as NodeJS.ProcessEnv)).toBe(true);
  });
  it("is true when CLAUDE_CODE_ENTRYPOINT is set", () => {
    expect(detectClaudeCode({ CLAUDE_CODE_ENTRYPOINT: "cli" } as NodeJS.ProcessEnv)).toBe(true);
  });
  it("is false otherwise", () => {
    expect(detectClaudeCode({} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("ClaudeCodeAdapter", () => {
  it("exposes the claude-code-panel surface", () => {
    expect(new ClaudeCodeAdapter().surface).toBe("claude-code-panel");
  });

  it("isAvailable reflects the injected detector", () => {
    expect(new ClaudeCodeAdapter({ detect: () => true }).isAvailable()).toBe(true);
    expect(new ClaudeCodeAdapter({ detect: () => false }).isAvailable()).toBe(false);
  });

  it("is unavailable by default when no Claude Code env markers are present", () => {
    const saved = { code: process.env.CLAUDECODE, entry: process.env.CLAUDE_CODE_ENTRYPOINT };
    delete process.env.CLAUDECODE;
    delete process.env.CLAUDE_CODE_ENTRYPOINT;
    try {
      expect(new ClaudeCodeAdapter().isAvailable()).toBe(false);
    } finally {
      if (saved.code !== undefined) process.env.CLAUDECODE = saved.code;
      if (saved.entry !== undefined) process.env.CLAUDE_CODE_ENTRYPOINT = saved.entry;
    }
  });

  it("never throws from isAvailable even if detection blows up", () => {
    const a = new ClaudeCodeAdapter({ detect: () => { throw new Error("boom"); } });
    expect(a.isAvailable()).toBe(false);
  });

  it("renders a sponsored line into the status sink (bold)", () => {
    const { sink, last } = fakeSink();
    new ClaudeCodeAdapter({ sink }).render(paidAd);
    expect(last()).toBe(boldText("Sponsored: TurboDB — ship faster · turbo.dev"));
  });

  it("renders a house ad without the Sponsored label", () => {
    const { sink, last } = fakeSink();
    new ClaudeCodeAdapter({ sink }).render(houseAd);
    expect(last()).toBe(boldText("Try vibearning · turbo.dev"));
  });

  it("respects a configured maxLen (visible code points)", () => {
    const { sink, last } = fakeSink();
    new ClaudeCodeAdapter({ sink, maxLen: 12 }).render(paidAd);
    expect(Array.from(last() ?? "").length).toBeLessThanOrEqual(12);
  });

  it("clear() restores the stock spinner", () => {
    const { sink, restoredCount } = fakeSink();
    const a = new ClaudeCodeAdapter({ sink });
    a.clear();
    expect(restoredCount()).toBe(1);
  });

  it("start() wires the wait-state handlers and returns the source's dispose", () => {
    let captured: WaitHandlers | null = null;
    const dispose = vi.fn();
    const a = new ClaudeCodeAdapter({ waitSource: (h) => { captured = h; return dispose; } });
    const handlers: WaitHandlers = { onWaitStart: vi.fn(), onWaitEnd: vi.fn(), onTick: vi.fn() };
    const got = a.start(handlers);
    expect(captured).toBe(handlers);
    got();
    expect(dispose).toHaveBeenCalledOnce();
  });

  describe("fail-safe: a broken host never breaks the editor", () => {
    it("render swallows a throwing sink", () => {
      const sink: StatusSink = { write: () => { throw new Error("host down"); }, restore: () => {} };
      expect(() => new ClaudeCodeAdapter({ sink }).render(paidAd)).not.toThrow();
    });
    it("clear swallows a throwing sink", () => {
      const sink: StatusSink = { write: () => {}, restore: () => { throw new Error("host down"); } };
      expect(() => new ClaudeCodeAdapter({ sink }).clear()).not.toThrow();
    });
    it("start swallows a throwing wait source and returns a safe dispose", () => {
      const a = new ClaudeCodeAdapter({ waitSource: () => { throw new Error("host down"); } });
      const handlers: WaitHandlers = { onWaitStart: vi.fn(), onWaitEnd: vi.fn() };
      let dispose: () => void = () => {};
      expect(() => { dispose = a.start(handlers); }).not.toThrow();
      expect(() => dispose()).not.toThrow();
    });
  });

  it("drives the full Orchestrator loop end-to-end against an injected wait source", async () => {
    // Prove the adapter integrates with the Orchestrator: a fake Claude Code wait source fires
    // the lifecycle, the orchestrator serves + renders, and the line lands in the sink.
    const { Orchestrator } = await import("../core/orchestrator");
    const { ViewTracker } = await import("../core/viewTracker");

    let t = 0;
    const now = () => t;
    const { sink, last } = fakeSink();
    let handlers: WaitHandlers | null = null;
    const adapter = new ClaudeCodeAdapter({
      detect: () => true,
      sink,
      waitSource: (h) => { handlers = h; return () => { handlers = null; }; },
    });
    const api = {
      serveMany: vi.fn().mockResolvedValue([paidAd]),
      sendEvent: vi.fn().mockResolvedValue(true),
    };
    const orch = new Orchestrator({
      adapter, api: api as never, tracker: new ViewTracker(now),
      killswitch: { isActive: () => false }, installId: "inst", now, holdMs: 5000,
    });
    orch.start();

    await handlers!.onWaitStart();
    expect(api.serveMany).toHaveBeenCalledWith("claude-code-panel", 3);
    expect(last()).toBe(boldText("Sponsored: TurboDB — ship faster · turbo.dev"));

    t += 6000;
    await handlers!.onWaitEnd();
    expect(api.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: "c1", type: "impression", visibleMs: 6000, surface: "claude-code-panel" }),
    );
  });

  it("passes the ad url to the sink so it can be opened on click", () => {
    let gotUrl: string | undefined;
    const sink: StatusSink = { write: (_line, url) => { gotUrl = url; }, restore: () => {} };
    new ClaudeCodeAdapter({ sink }).render(paidAd);
    expect(gotUrl).toBe("https://turbo.dev");
  });

  it("passes the brand color through to the sink (and undefined when unset)", () => {
    let gotColor: string | undefined;
    const sink: StatusSink = { write: (_l, _u, color) => { gotColor = color; }, restore: () => {} };
    const adapter = new ClaudeCodeAdapter({ sink });
    adapter.render({ ...paidAd, brandColor: "#E23744" });
    expect(gotColor).toBe("#E23744");
    adapter.render(paidAd);
    expect(gotColor).toBeUndefined();
  });
});
