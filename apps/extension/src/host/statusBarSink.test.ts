import { describe, it, expect } from "vitest";
import { StatusBarSink, type StatusItemLike } from "./statusBarSink";

function fakeItem() {
  const item: StatusItemLike & { shown: number; hidden: number } = {
    text: "", shown: 0, hidden: 0,
    show() { this.shown += 1; },
    hide() { this.hidden += 1; },
  };
  return item;
}

describe("StatusBarSink", () => {
  it("write sets sparkle-prefixed text, shows the item, and tracks the url", () => {
    const item = fakeItem();
    const sink = new StatusBarSink(item);
    sink.write("Sponsored: Acme · acme.dev", "https://acme.dev");
    expect(item.text).toBe("$(sparkle) Sponsored: Acme · acme.dev");
    expect(item.shown).toBe(1);
    expect(sink.currentUrl()).toBe("https://acme.dev");
  });

  it("restore hides the item", () => {
    const item = fakeItem();
    const sink = new StatusBarSink(item);
    sink.write("x", "https://x.dev");
    sink.restore();
    expect(item.hidden).toBe(1);
  });

  it("write swallows a throwing item (fail-safe)", () => {
    const item: StatusItemLike = {
      text: "",
      show() { throw new Error("host down"); },
      hide() {},
    };
    const sink = new StatusBarSink(item);
    expect(() => sink.write("x", "https://x.dev")).not.toThrow();
  });

  it("restore swallows a throwing item (fail-safe)", () => {
    const item: StatusItemLike = {
      text: "",
      show() {},
      hide() { throw new Error("host down"); },
    };
    const sink = new StatusBarSink(item);
    expect(() => sink.restore()).not.toThrow();
  });
});
