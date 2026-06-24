import { TokenService } from "./token.service";

describe("TokenService", () => {
  let svc: TokenService;
  beforeAll(() => { process.env.AUTH_JWT_SECRET = "test-secret"; });
  beforeEach(() => { svc = new TokenService(); });

  it("round-trips an accountId", () => {
    const token = svc.issue("acc_1");
    expect(svc.verify(token)).toEqual({ sub: "acc_1" });
  });
  it("returns null for a garbage token", () => {
    expect(svc.verify("not.a.jwt")).toBeNull();
  });
  it("returns null for a token signed with a different secret", () => {
    const other = svc.issue("acc_1");
    process.env.AUTH_JWT_SECRET = "rotated-secret";
    const svc2 = new TokenService();
    expect(svc2.verify(other)).toBeNull();
    process.env.AUTH_JWT_SECRET = "test-secret";
  });

  it("round-trips a purpose-scoped token", () => {
    const t = svc.issuePurpose("acc_1", "pwreset", "1h");
    expect(svc.verifyPurpose(t, "pwreset")).toBe("acc_1");
  });
  it("rejects a purpose token used for the wrong purpose", () => {
    const t = svc.issuePurpose("acc_1", "pwreset", "1h");
    expect(svc.verifyPurpose(t, "verify")).toBeNull();
  });
  it("a session token is not accepted as a purpose token", () => {
    const session = svc.issue("acc_1");
    expect(svc.verifyPurpose(session, "pwreset")).toBeNull();
  });
});
