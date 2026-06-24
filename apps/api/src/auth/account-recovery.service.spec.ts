import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { AccountRecoveryService } from "./account-recovery.service";
import { PrismaService } from "../prisma/prisma.service";
import { TokenService } from "./token.service";
import { Notifier } from "../notifications/notifier";

const prismaMock = { account: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() } };
const tokenMock = { issuePurpose: jest.fn(), verifyPurpose: jest.fn() };
const notifierMock = { send: jest.fn() };

describe("AccountRecoveryService", () => {
  let svc: AccountRecoveryService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        AccountRecoveryService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TokenService, useValue: tokenMock },
        { provide: Notifier, useValue: notifierMock },
      ],
    }).compile();
    svc = mod.get(AccountRecoveryService);
  });

  describe("password reset", () => {
    it("emails a reset link for an existing account", async () => {
      prismaMock.account.findFirst.mockResolvedValue({ id: "a1", email: "a@b.com", type: "advertiser" });
      tokenMock.issuePurpose.mockReturnValue("reset.jwt");
      const r = await svc.requestPasswordReset("a@b.com", "advertiser");
      expect(tokenMock.issuePurpose).toHaveBeenCalledWith("a1", "pwreset", expect.any(String));
      expect(notifierMock.send).toHaveBeenCalledWith("a@b.com", expect.any(String), expect.stringContaining("reset.jwt"));
      expect(r).toEqual({ ok: true });
    });

    it("does not reveal whether an unknown email exists (no send, still ok)", async () => {
      prismaMock.account.findFirst.mockResolvedValue(null);
      const r = await svc.requestPasswordReset("nobody@b.com", "advertiser");
      expect(notifierMock.send).not.toHaveBeenCalled();
      expect(r).toEqual({ ok: true });
    });

    it("resets the password for a valid token", async () => {
      tokenMock.verifyPurpose.mockReturnValue("a1");
      await svc.resetPassword("good.jwt", "newpassword1");
      expect(tokenMock.verifyPurpose).toHaveBeenCalledWith("good.jwt", "pwreset");
      const arg = prismaMock.account.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: "a1" });
      const bcrypt = await import("bcryptjs");
      expect(await bcrypt.compare("newpassword1", arg.data.passwordHash)).toBe(true);
    });

    it("rejects an invalid/expired reset token", async () => {
      tokenMock.verifyPurpose.mockReturnValue(null);
      await expect(svc.resetPassword("bad", "newpassword1")).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.account.update).not.toHaveBeenCalled();
    });
  });

  describe("email verification", () => {
    it("emails a verification link to the account's email", async () => {
      prismaMock.account.findUnique.mockResolvedValue({ id: "a1", email: "a@b.com" });
      tokenMock.issuePurpose.mockReturnValue("verify.jwt");
      const r = await svc.requestEmailVerification("a1");
      expect(tokenMock.issuePurpose).toHaveBeenCalledWith("a1", "verify", expect.any(String));
      expect(notifierMock.send).toHaveBeenCalledWith("a@b.com", expect.any(String), expect.stringContaining("verify.jwt"));
      expect(r).toEqual({ ok: true });
    });

    it("rejects verification request when the account has no email", async () => {
      prismaMock.account.findUnique.mockResolvedValue({ id: "a1", email: null });
      await expect(svc.requestEmailVerification("a1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("marks the email verified for a valid token", async () => {
      tokenMock.verifyPurpose.mockReturnValue("a1");
      await svc.verifyEmail("good.jwt");
      expect(tokenMock.verifyPurpose).toHaveBeenCalledWith("good.jwt", "verify");
      expect(prismaMock.account.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { emailVerified: true } });
    });

    it("rejects an invalid verification token", async () => {
      tokenMock.verifyPurpose.mockReturnValue(null);
      await expect(svc.verifyEmail("bad")).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
