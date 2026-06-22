import { describe, it, expect, vi } from "vitest";
import { Killswitch } from "./killswitch";

const resp = (active: boolean) => ({ ok: true, json: async () => ({ active }) } as Response);

describe("Killswitch", () => {
  it("starts inactive", () => {
    const ks = new Killswitch("http://api/config", vi.fn() as unknown as typeof fetch);
    expect(ks.isActive()).toBe(false);
  });
  it("activates from a poll response", async () => {
    const ks = new Killswitch("http://api/config", vi.fn().mockResolvedValue(resp(true)) as unknown as typeof fetch);
    expect(await ks.poll()).toBe(true);
    expect(ks.isActive()).toBe(true);
  });
  it("keeps the last known state on poll error (fail-open to previous)", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(resp(true)).mockRejectedValueOnce(new Error("net"));
    const ks = new Killswitch("http://api/config", fetchFn as unknown as typeof fetch);
    await ks.poll();          // → active true
    expect(await ks.poll()).toBe(true); // error → unchanged
  });
});
