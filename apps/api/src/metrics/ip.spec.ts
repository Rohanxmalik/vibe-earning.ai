import { clientIp, clientIpHash } from "./ip";

describe("clientIp", () => {
  it("prefers the first hop of x-forwarded-for", () => {
    expect(clientIp({ headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" }, ip: "10.0.0.1" })).toBe("1.2.3.4");
  });
  it("falls back to req.ip then socket.remoteAddress", () => {
    expect(clientIp({ headers: {}, ip: "9.9.9.9" })).toBe("9.9.9.9");
    expect(clientIp({ socket: { remoteAddress: "8.8.8.8" } })).toBe("8.8.8.8");
  });
  it("returns null when no IP is discoverable", () => {
    expect(clientIp({ headers: {} })).toBeNull();
  });
});

describe("clientIpHash", () => {
  it("is deterministic, opaque (never the raw IP) and 32 hex chars", () => {
    const req = { ip: "1.2.3.4" };
    const h = clientIpHash(req)!;
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(h).not.toContain("1.2.3.4");
    expect(clientIpHash(req)).toBe(h); // deterministic
  });
  it("maps different IPs to different hashes", () => {
    expect(clientIpHash({ ip: "1.1.1.1" })).not.toBe(clientIpHash({ ip: "2.2.2.2" }));
  });
  it("returns null when there is no IP", () => {
    expect(clientIpHash({ headers: {} })).toBeNull();
  });
});
