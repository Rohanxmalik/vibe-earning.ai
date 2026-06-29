import { describe, it, expect, vi } from "vitest";
import { runStatusLine, ansiStyle, type StatusLineDeps } from "./cli";
import type { BillingState } from "./billing";
import type { ServeResponse } from "@kbi/shared";

const ad = (campaignId: string, over: Partial<ServeResponse> = {}): ServeResponse => ({
  adId: `ad_${campaignId}`, campaignId, copy: `copy ${campaignId}`, url: "https://x.dev", iconUrl: null, isHouseAd: false, ...over,
});

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}
function notOk(): Response {
  return { ok: false, status: 500, json: async () => ({}) } as Response;
}

/** A mutable in-memory billing store so a sequence of refreshes shares one window. */
function memStore(installId = "inst1") {
  let state: BillingState = { installId, current: null };
  return {
    loadState: () => state,
    saveState: (s: BillingState) => { state = s; },
    get current() { return state.current; },
  };
}

function baseDeps(over: Partial<StatusLineDeps> = {}): StatusLineDeps {
  const store = memStore();
  return {
    api: "http://api",
    surface: "claude-code-terminal",
    token: "dev-token",
    fetchFn: vi.fn(),
    now: () => 1000,
    loadState: store.loadState,
    saveState: store.saveState,
    write: vi.fn(),
    ...over,
  };
}

describe("runStatusLine (official Claude Code status-line integration)", () => {
  // 1. wait-state → fetch top-N ads → render the sponsored line
  it("fetches the top-N ads and writes the sponsored line", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ ads: [ad("c1"), ad("c2"), ad("c3")] }));
    const write = vi.fn();
    const line = await runStatusLine(baseDeps({ fetchFn, write }));

    expect(fetchFn).toHaveBeenCalledWith(
      "http://api/serve?surface=claude-code-terminal&count=3",
      expect.objectContaining({ headers: { authorization: "Bearer dev-token" } }),
    );
    expect(line).toBe("Sponsored: copy c1 · x.dev"); // returned value is plain (terminal bolds via ANSI)
    expect(write).toHaveBeenCalledWith(ansiStyle("Sponsored: copy c1 · x.dev")); // bold ANSI, no color
  });

  it("writes ANSI bold + brand color (truecolor) when a brand color is present", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ ads: [ad("c1", { brandColor: "#E23744" })] }));
    const write = vi.fn();
    const line = await runStatusLine(baseDeps({ fetchFn, write }));
    expect(line).toBe("Sponsored: copy c1 · x.dev"); // returned plain
    expect(write).toHaveBeenCalledWith(ansiStyle("Sponsored: copy c1 · x.dev", "#E23744"));
    expect(write.mock.calls[0][0]).toContain("\x1b[1;38;2;226;55;68m"); // bold + truecolor
  });

  it("reports a diagnostic reason: 'ok' on render, 'no_inventory' when empty", async () => {
    const okReasons: string[] = [];
    await runStatusLine(baseDeps({ fetchFn: vi.fn().mockResolvedValue(ok({ ads: [ad("c1")] })), onDiagnostic: (r) => okReasons.push(r) }));
    expect(okReasons).toContain("ok");

    const emptyReasons: string[] = [];
    await runStatusLine(baseDeps({ fetchFn: vi.fn().mockResolvedValue(ok({ ads: [] })), onDiagnostic: (r) => emptyReasons.push(r) }));
    expect(emptyReasons).toContain("no_inventory");
  });

  it("reports 'error_or_timeout' when the fetch rejects", async () => {
    const reasons: string[] = [];
    await runStatusLine(baseDeps({ fetchFn: vi.fn().mockRejectedValue(new Error("aborted")), onDiagnostic: (r) => reasons.push(r) }));
    expect(reasons).toContain("error_or_timeout");
  });

  it("ansiStyle always bolds; adds truecolor only for a valid hex", () => {
    expect(ansiStyle("x")).toBe("\x1b[1mx\x1b[0m"); // bold only
    expect(ansiStyle("x", "nope")).toBe("\x1b[1mx\x1b[0m"); // invalid hex → bold only
    expect(ansiStyle("x", "#8B2CF5")).toBe("\x1b[1;38;2;139;44;245mx\x1b[0m"); // bold + color
  });

  it("serves anonymously (no auth header) when signed out but still renders", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ ads: [ad("c1")] }));
    const line = await runStatusLine(baseDeps({ fetchFn, token: undefined }));
    expect(fetchFn).toHaveBeenCalledWith(
      "http://api/serve?surface=claude-code-terminal&count=3",
      expect.objectContaining({ headers: {} }),
    );
    expect(line).toBe("Sponsored: copy c1 · x.dev");
  });

  // 4. impression posted exactly once per nonce, after the visible-time threshold, attributed
  it("posts an authenticated impression exactly once per nonce after the view threshold", async () => {
    const store = memStore();
    const events: unknown[] = [];
    const fetchFn = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/events")) { events.push(JSON.parse(String(init?.body))); return Promise.resolve(ok({ valid: true })); }
      return Promise.resolve(ok({ ads: [ad("c1")] }));
    });
    const deps = baseDeps({ fetchFn, loadState: store.loadState, saveState: store.saveState });

    // t=1000: first sight → opens the window, no bill yet.
    await runStatusLine({ ...deps, now: () => 1000 });
    expect(events).toHaveLength(0);
    const nonce = store.current?.nonce;
    expect(nonce).toBeTruthy();

    // t=4000 (<5s): still under threshold → no bill.
    await runStatusLine({ ...deps, now: () => 4000 });
    expect(events).toHaveLength(0);

    // t=6000 (>=5s): bill exactly one impression, with the stable nonce.
    await runStatusLine({ ...deps, now: () => 6000 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      campaignId: "c1", type: "impression", surface: "claude-code-terminal", nonce, visibleMs: 5000,
    });
    const eventsCall = fetchFn.mock.calls.find((c) => String(c[0]).includes("/events"));
    expect((eventsCall![1] as RequestInit).headers).toMatchObject({ authorization: "Bearer dev-token" });

    // t=9000: same window already billed → never double-billed.
    await runStatusLine({ ...deps, now: () => 9000 });
    expect(events).toHaveLength(1);
  });

  // 5a. nothing billed when signed out (but ads still show)
  it("never posts an impression when signed out, even past the view threshold", async () => {
    const store = memStore();
    const fetchFn = vi.fn().mockResolvedValue(ok({ ads: [ad("c1")] }));
    const deps = baseDeps({ fetchFn, token: undefined, loadState: store.loadState, saveState: store.saveState });

    await runStatusLine({ ...deps, now: () => 1000 });
    await runStatusLine({ ...deps, now: () => 6000 }); // past threshold
    expect(fetchFn.mock.calls.some((c) => String(c[0]).includes("/events"))).toBe(false);
  });

  // 5b. nothing served/billed when the killswitch is active
  it("serves and bills nothing when the killswitch is active", async () => {
    const fetchFn = vi.fn();
    const write = vi.fn();
    const line = await runStatusLine(baseDeps({ fetchFn, write, killActive: true }));
    expect(fetchFn).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(line).toBe("");
  });

  // 3. rotation to ad #2 on a long wait
  it("rotates to the next ad after the hold window and opens a fresh billable window", async () => {
    const store = memStore();
    const events: Record<string, unknown>[] = [];
    const fetchFn = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/events")) { events.push(JSON.parse(String(init?.body))); return Promise.resolve(ok({ valid: true })); }
      return Promise.resolve(ok({ ads: [ad("c1"), ad("c2")] }));
    });
    const deps = baseDeps({ fetchFn, loadState: store.loadState, saveState: store.saveState });

    await runStatusLine({ ...deps, now: () => 1000 });       // show c1, open window
    let line = await runStatusLine({ ...deps, now: () => 6500 }); // 5.5s: still c1 (hold 8s), bill c1
    expect(line).toBe("Sponsored: copy c1 · x.dev");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ campaignId: "c1" });

    line = await runStatusLine({ ...deps, now: () => 9500 });  // 8.5s elapsed → rotate to c2
    expect(line).toBe("Sponsored: copy c2 · x.dev");
    expect(store.current).toMatchObject({ campaignId: "c2", billed: false });

    // c2 reaches its own threshold → a second, distinct impression with a different nonce.
    line = await runStatusLine({ ...deps, now: () => 15000 });
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ campaignId: "c2" });
    expect(events[1].nonce).not.toBe(events[0].nonce);
  });

  // 2. graceful no-op on host/network error → stock spinner shows through
  it("renders nothing when /serve returns not-ok", async () => {
    const fetchFn = vi.fn().mockResolvedValue(notOk());
    const write = vi.fn();
    const line = await runStatusLine(baseDeps({ fetchFn, write }));
    expect(line).toBe("");
    expect(write).not.toHaveBeenCalled();
  });

  it("renders nothing and never throws when /serve rejects (network down / abort)", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("aborted"));
    const write = vi.fn();
    let line = "unset";
    await expect((async () => { line = await runStatusLine(baseDeps({ fetchFn, write })); })()).resolves.toBeUndefined();
    expect(line).toBe("");
    expect(write).not.toHaveBeenCalled();
  });

  it("renders nothing when there is no inventory", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ ads: [] }));
    const write = vi.fn();
    const line = await runStatusLine(baseDeps({ fetchFn, write }));
    expect(line).toBe("");
    expect(write).not.toHaveBeenCalled();
  });

  it("does not let a failing /events post break the status line (still renders the ad)", async () => {
    const store = memStore();
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/events")) return Promise.reject(new Error("events down"));
      return Promise.resolve(ok({ ads: [ad("c1")] }));
    });
    const write = vi.fn();
    const deps = baseDeps({ fetchFn, write, loadState: store.loadState, saveState: store.saveState });

    await runStatusLine({ ...deps, now: () => 1000 });
    const line = await runStatusLine({ ...deps, now: () => 6000 }); // bill attempt fails internally
    expect(line).toBe("Sponsored: copy c1 · x.dev"); // ad still rendered
    expect(write).toHaveBeenLastCalledWith(ansiStyle("Sponsored: copy c1 · x.dev"));
  });
});
