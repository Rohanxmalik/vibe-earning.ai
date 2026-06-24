import { countryFromRequest } from "./geo";

describe("countryFromRequest", () => {
  it("prefers the account's stored country (normalized upper-case)", () => {
    expect(countryFromRequest({ account: { country: "in" }, headers: { "x-vercel-ip-country": "US" } })).toBe("IN");
  });

  it("falls back to the Vercel geo header", () => {
    expect(countryFromRequest({ account: null, headers: { "x-vercel-ip-country": "us" } })).toBe("US");
  });

  it("falls back to the Cloudflare geo header", () => {
    expect(countryFromRequest({ headers: { "cf-ipcountry": "DE" } })).toBe("DE");
  });

  it("ignores Cloudflare's 'XX' unknown sentinel", () => {
    expect(countryFromRequest({ headers: { "cf-ipcountry": "XX" } })).toBeNull();
  });

  it("returns null when nothing is available", () => {
    expect(countryFromRequest({})).toBeNull();
    expect(countryFromRequest({ account: { country: null }, headers: {} })).toBeNull();
  });
});
