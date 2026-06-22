import { Test } from "@nestjs/testing";
import { AuthService } from "./auth.service";
import { GoogleVerifier } from "./google-verifier";
import { TokenService } from "./token.service";
import { PrismaService } from "../prisma/prisma.service";

const prismaMock = { account: { upsert: jest.fn(), findUnique: jest.fn() } };
const verifierMock = { verify: jest.fn() };
const tokenMock = { issue: jest.fn(), verify: jest.fn() };

describe("AuthService", () => {
  let svc: AuthService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: GoogleVerifier, useValue: verifierMock },
        { provide: TokenService, useValue: tokenMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    svc = mod.get(AuthService);
  });

  it("logs in: verifies google, upserts account, issues token", async () => {
    verifierMock.verify.mockResolvedValue({ sub: "g-123", email: "dev@x.com" });
    prismaMock.account.upsert.mockResolvedValue({ id: "acc_1", email: "dev@x.com", type: "dev" });
    tokenMock.issue.mockReturnValue("kbi.jwt");

    const res = await svc.loginWithGoogle("idtok");
    expect(verifierMock.verify).toHaveBeenCalledWith("idtok");
    expect(prismaMock.account.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { oauthSub: "g-123" } }),
    );
    expect(res).toEqual({ token: "kbi.jwt", account: { id: "acc_1", email: "dev@x.com", type: "dev" } });
  });

  it("accountFromToken returns null for no token / bad token", async () => {
    expect(await svc.accountFromToken(undefined)).toBeNull();
    tokenMock.verify.mockReturnValue(null);
    expect(await svc.accountFromToken("bad")).toBeNull();
  });

  it("accountFromToken loads the account for a valid token", async () => {
    tokenMock.verify.mockReturnValue({ sub: "acc_1" });
    prismaMock.account.findUnique.mockResolvedValue({ id: "acc_1", email: null, type: "dev" });
    expect(await svc.accountFromToken("good")).toMatchObject({ id: "acc_1" });
  });
});
