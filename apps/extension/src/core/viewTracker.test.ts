import { describe, it, expect } from "vitest";
import { ViewTracker } from "./viewTracker";

function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe("ViewTracker", () => {
  it("accumulates only while active", () => {
    const c = fakeClock();
    const vt = new ViewTracker(c.now);
    vt.start();
    c.advance(3000);
    vt.pause();        // not visible/focused
    c.advance(10000);  // should NOT count
    vt.resume();
    c.advance(2000);
    expect(vt.stop()).toBe(5000);
  });

  it("reports live visibleMs while running", () => {
    const c = fakeClock();
    const vt = new ViewTracker(c.now);
    vt.start();
    c.advance(1500);
    expect(vt.visibleMs).toBe(1500);
  });

  it("stop is idempotent and returns the final total", () => {
    const c = fakeClock();
    const vt = new ViewTracker(c.now);
    vt.start();
    c.advance(4000);
    expect(vt.stop()).toBe(4000);
    c.advance(9999);
    expect(vt.stop()).toBe(4000);
  });
});
