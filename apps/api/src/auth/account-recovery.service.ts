import { BadRequestException, Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { TokenService } from "./token.service";
import { Notifier } from "../notifications/notifier";

const RESET_TTL = "1h";
const VERIFY_TTL = "24h";

/** Email verification + password reset, shared across dev/advertiser/admin accounts. */
@Injectable()
export class AccountRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly notifier: Notifier,
  ) {}

  private portalBase(): string {
    return process.env.PORTAL_BASE_URL ?? "http://localhost:3001";
  }

  async requestPasswordReset(email: string, type: string): Promise<{ ok: true }> {
    const account = await this.prisma.account.findFirst({ where: { email, type } });
    // Always return ok — never reveal whether an email is registered.
    if (account) {
      const token = this.tokens.issuePurpose(account.id, "pwreset", RESET_TTL);
      const link = `${this.portalBase()}/reset?token=${token}`;
      await this.notifier.send(email, "Reset your vibearning password", `Reset your password (valid 1 hour): ${link}`);
    }
    return { ok: true };
  }

  async resetPassword(token: string, password: string): Promise<{ ok: true }> {
    const accountId = this.tokens.verifyPurpose(token, "pwreset");
    if (!accountId) throw new BadRequestException("invalid_or_expired_token");
    const passwordHash = await bcrypt.hash(password, 8);
    await this.prisma.account.update({ where: { id: accountId }, data: { passwordHash } });
    return { ok: true };
  }

  async requestEmailVerification(accountId: string): Promise<{ ok: true }> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account?.email) throw new BadRequestException("no_email");
    const token = this.tokens.issuePurpose(accountId, "verify", VERIFY_TTL);
    const link = `${this.portalBase()}/verify?token=${token}`;
    await this.notifier.send(account.email, "Verify your vibearning email", `Confirm your email (valid 24 hours): ${link}`);
    return { ok: true };
  }

  async verifyEmail(token: string): Promise<{ ok: true }> {
    const accountId = this.tokens.verifyPurpose(token, "verify");
    if (!accountId) throw new BadRequestException("invalid_or_expired_token");
    await this.prisma.account.update({ where: { id: accountId }, data: { emailVerified: true } });
    return { ok: true };
  }
}
