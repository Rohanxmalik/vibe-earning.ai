import { Test } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { AdvertiserAuthService } from "./advertiser-auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { TokenService } from "../auth/token.service";

const prismaMock = { account: { findFirst: jest.fn(), create: jest.fn() } };
const tokenMock = { issue: jest.fn().mockReturnValue("kbi.jwt") };

describe("AdvertiserAuthService", () => {
  let svc: AdvertiserAuthService;
  beforeEach(async () => {
    jest.resetAllMocks();
    tokenMock.issue.mockReturnValue("kbi.jwt");
    const mod = await Test.createTestingModule({
      providers: [
        AdvertiserAuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TokenService, useValue: tokenMock },
      ],
    }).compile();
    svc = mod.get(AdvertiserAuthService);
  });

  it("registers a new advertiser and returns a token", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);
    prismaMock.account.create.mockResolvedValue({ id: "adv1", email: "a@b.com", type: "advertiser" });
    const res = await svc.register("a@b.com", "password1");
    expect(prismaMock.account.create).toHaveBeenCalled();
    expect(res).toEqual({ token: "kbi.jwt", account: { id: "adv1", email: "a@b.com", type: "advertiser" } });
  });

  it("rejects duplicate registration", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "adv1" });
    await expect(svc.register("a@b.com", "password1")).rejects.toBeTruthy();
  });

  it("logs in with correct password and rejects wrong password", async () => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("password1", 8);
    prismaMock.account.findFirst.mockResolvedValue({ id: "adv1", email: "a@b.com", type: "advertiser", passwordHash: hash });
    await expect(svc.login("a@b.com", "password1")).resolves.toMatchObject({ token: "kbi.jwt" });
    await expect(svc.login("a@b.com", "wrong")).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
