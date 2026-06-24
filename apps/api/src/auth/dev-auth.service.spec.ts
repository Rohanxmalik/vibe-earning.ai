import { Test } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { DevAuthService } from "./dev-auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { TokenService } from "./token.service";

const prismaMock = { account: { findFirst: jest.fn(), create: jest.fn() } };
const tokenMock = { issue: jest.fn().mockReturnValue("kbi.jwt") };

describe("DevAuthService", () => {
  let svc: DevAuthService;
  beforeEach(async () => {
    jest.resetAllMocks();
    tokenMock.issue.mockReturnValue("kbi.jwt");
    const mod = await Test.createTestingModule({
      providers: [
        DevAuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TokenService, useValue: tokenMock },
      ],
    }).compile();
    svc = mod.get(DevAuthService);
  });

  it("registers a new developer (type 'dev') and returns a token", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);
    prismaMock.account.create.mockResolvedValue({ id: "dev1", email: "d@b.com", type: "dev" });
    const res = await svc.register("d@b.com", "password1");
    expect(prismaMock.account.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "dev", email: "d@b.com" }) }),
    );
    expect(res).toEqual({ token: "kbi.jwt", account: { id: "dev1", email: "d@b.com", type: "dev" } });
  });

  it("persists the inferred country on register", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);
    prismaMock.account.create.mockResolvedValue({ id: "dev1", email: "d@b.com", type: "dev" });
    await svc.register("d@b.com", "password1", "IN");
    expect(prismaMock.account.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ country: "IN" }) }),
    );
  });

  it("stores null country when none can be inferred", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);
    prismaMock.account.create.mockResolvedValue({ id: "dev1", email: "d@b.com", type: "dev" });
    await svc.register("d@b.com", "password1");
    expect(prismaMock.account.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ country: null }) }),
    );
  });

  it("rejects duplicate developer registration", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "dev1" });
    await expect(svc.register("d@b.com", "password1")).rejects.toBeTruthy();
  });

  it("scopes the duplicate check to dev accounts only", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);
    prismaMock.account.create.mockResolvedValue({ id: "dev1", email: "d@b.com", type: "dev" });
    await svc.register("d@b.com", "password1");
    expect(prismaMock.account.findFirst).toHaveBeenCalledWith({ where: { email: "d@b.com", type: "dev" } });
  });

  it("logs in with correct password and rejects wrong password", async () => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("password1", 8);
    prismaMock.account.findFirst.mockResolvedValue({ id: "dev1", email: "d@b.com", type: "dev", passwordHash: hash });
    await expect(svc.login("d@b.com", "password1")).resolves.toMatchObject({ token: "kbi.jwt" });
    await expect(svc.login("d@b.com", "wrong")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects login for an unknown developer email", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);
    await expect(svc.login("nobody@b.com", "password1")).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
