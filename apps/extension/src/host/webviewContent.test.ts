import { describe, it, expect } from "vitest";
import { adViewModel, safeAccent, safeImageUrl, formatEarnings, webviewHtml, DEFAULT_ACCENT, liveStateText, LIVE_EARNING, LIVE_SIGNIN, WEBVIEW_BUILD } from "./webviewContent";
import type { ServeResponse } from "@vibearning/shared";

const ad = (over: Partial<ServeResponse> = {}): ServeResponse => ({
  adId: "a1", campaignId: "c1", copy: "Ship faster with TurboDB",
  url: "https://turbodb.example.com/start", iconUrl: null, isHouseAd: false, ...over,
});

describe("adViewModel", () => {
  it("uses headline — tagline when structured fields are set, with the url host", () => {
    const v = adViewModel(ad({ headline: "Zomato", tagline: "Delivering Happiness", emoji: "🍔" }));
    expect(v).toMatchObject({ title: "Zomato", tagline: "Delivering Happiness", emoji: "🍔", host: "turbodb.example.com", sponsored: true });
  });

  it("carries the campaign id so the line-up can mark the live card", () => {
    expect(adViewModel(ad({ campaignId: "c42" })).id).toBe("c42");
  });

  it("falls back to copy (and no tagline) when there's no headline", () => {
    const v = adViewModel(ad({ tagline: "ignored without a headline" }));
    expect(v.title).toBe("Ship faster with TurboDB");
    expect(v.tagline).toBeNull();
  });

  it("marks house ads as not sponsored (no disclosure badge)", () => {
    expect(adViewModel(ad({ isHouseAd: true })).sponsored).toBe(false);
  });

  it("validates the brand color: a good hex passes, junk falls back to the vibearning default", () => {
    expect(adViewModel(ad({ brandColor: "#E23744" })).accent).toBe("#E23744");
    expect(adViewModel(ad({ brandColor: "red; background:url(x)" })).accent).toBe(DEFAULT_ACCENT);
    expect(adViewModel(ad({ brandColor: null })).accent).toBe(DEFAULT_ACCENT);
  });

  it("drops a blank emoji/tagline to null", () => {
    const v = adViewModel(ad({ emoji: "   ", headline: "Acme", tagline: "  " }));
    expect(v.emoji).toBeNull();
    expect(v.tagline).toBeNull();
  });

  it("maps a safe (https/data) iconUrl to logo, and drops unsafe ones", () => {
    expect(adViewModel(ad({ iconUrl: "https://cdn.acme.com/logo.png" })).logo).toBe("https://cdn.acme.com/logo.png");
    expect(adViewModel(ad({ iconUrl: "http://insecure.acme.com/logo.png" })).logo).toBeNull(); // blocked by CSP
    expect(adViewModel(ad({ iconUrl: null })).logo).toBeNull();
  });
});

describe("safeImageUrl", () => {
  it("allows https and data:image; rejects http, javascript:, and junk", () => {
    expect(safeImageUrl("https://x.com/a.png")).toBe("https://x.com/a.png");
    expect(safeImageUrl("data:image/svg+xml;base64,AAAA")).toBe("data:image/svg+xml;base64,AAAA");
    expect(safeImageUrl("http://localhost:3000/uploads/a.png")).toBe("http://localhost:3000/uploads/a.png"); // dev storage
    expect(safeImageUrl("http://x.com/a.png")).toBeNull(); // non-local http still blocked
    expect(safeImageUrl("javascript:alert(1)")).toBeNull();
    expect(safeImageUrl("data:text/html,<script>")).toBeNull(); // only image data URIs
    expect(safeImageUrl(null)).toBeNull();
  });
});

describe("safeAccent", () => {
  it("accepts #rgb, #rrggbb, #rrggbbaa; rejects everything else", () => {
    expect(safeAccent("#fff")).toBe("#fff");
    expect(safeAccent("#84cc16")).toBe("#84cc16");
    expect(safeAccent("#84cc16ff")).toBe("#84cc16ff");
    expect(safeAccent("84cc16")).toBe(DEFAULT_ACCENT); // no hash
    expect(safeAccent("javascript:alert(1)")).toBe(DEFAULT_ACCENT);
    expect(safeAccent(undefined)).toBe(DEFAULT_ACCENT);
  });
});

describe("formatEarnings", () => {
  it("renders paise as ₹ with two decimals", () => {
    expect(formatEarnings(0)).toBe("₹0.00");
    expect(formatEarnings(12345)).toBe("₹123.45");
  });
});

describe("liveStateText (auth-honest live line)", () => {
  it("claims earnings only when signed in; otherwise nudges sign-in (anonymous = no earnings)", () => {
    expect(liveStateText(true)).toBe(LIVE_EARNING);
    expect(liveStateText(false)).toBe(LIVE_SIGNIN);
    expect(LIVE_SIGNIN).not.toContain("earning while"); // signed-out copy must not claim earning
  });
});

describe("webviewHtml", () => {
  it("locks the CSP to nonce-gated script/style and default-src none", () => {
    const html = webviewHtml({ nonce: "N0NCE", cspSource: "vscode-resource://x" });
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'nonce-N0NCE'");
    expect(html).toContain("style-src 'nonce-N0NCE'");
    expect(html).toContain("vscode-resource://x"); // img/font source allowed
  });

  it("never emits an inline script/style without the nonce (no CSP bypass)", () => {
    const html = webviewHtml({ nonce: "N0NCE", cspSource: "x" });
    expect(html).not.toMatch(/<script(?![^>]*nonce=)/);
    expect(html).not.toMatch(/<style(?![^>]*nonce=)/);
  });

  it("ships both auth-state live strings so the client can switch copy without a round-trip", () => {
    const html = webviewHtml({ nonce: "N0NCE", cspSource: "x" });
    expect(html).toContain(LIVE_EARNING);
    expect(html).toContain(LIVE_SIGNIN);
  });

  it("includes the lifetime + session-delta pill elements", () => {
    const html = webviewHtml({ nonce: "N0NCE", cspSource: "x" });
    expect(html).toContain('id="earnLifetime"');
    expect(html).toContain('id="earnSession"');
  });

  it("includes a brand-logo <img> and allows https/data images in the CSP", () => {
    const html = webviewHtml({ nonce: "N0NCE", cspSource: "x" });
    expect(html).toContain('id="logo"');
    expect(html).toMatch(/img-src[^;]*https:[^;]*data:/);
  });

  it("includes the line-up (up-next) container", () => {
    const html = webviewHtml({ nonce: "N0NCE", cspSource: "x" });
    expect(html).toContain('id="lineup"');
    expect(html).toContain('id="lineupRows"');
    expect(html).toContain("In rotation");
  });

  it("stamps the build marker into the debug line (confirms a fresh bundle is loaded)", () => {
    const html = webviewHtml({ nonce: "N0NCE", cspSource: "x" });
    expect(html).toContain('id="dbg"');
    expect(html).toContain(WEBVIEW_BUILD);
  });
});
