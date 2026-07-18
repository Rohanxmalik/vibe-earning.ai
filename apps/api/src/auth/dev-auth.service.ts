import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { TokenService } from "./token.service";
import { hashPassword, verifyPassword } from "./password";

/**
 * Email/password onboarding for developers (the supply side). Mirrors advertiser
 * auth but stamps accounts as type "dev" so they share the ledger/payout flow with
 * Google-OAuth devs. Lets a developer create an account on the web without the
 * VS Code extension — they paste the issued token back into the extension to earn.
 */
@Injectable()
export class DevAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  private result(account: { id: string; email: string | null; type: string }) {
    return { token: this.tokens.issue(account.id), account: { id: account.id, email: account.email, type: account.type } };
  }

  async register(email: string, password: string, country: string | null = null, ref?: string | null) {
    const existing = await this.prisma.account.findFirst({ where: { email, type: "dev" } });
    if (existing) throw new BadRequestException("email_taken");
    const passwordHash = await hashPassword(password);
    const referredById = ref ? await this.resolveReferrer(ref) : null;
    const account = await this.prisma.account.create({
      data: {
        type: "dev", email, passwordHash, country,
        referralCode: await this.uniqueReferralCode(),
        referredById,
        referredAt: referredById ? new Date() : null,
      },
    });
    return this.result(account);
  }

  /** Resolve a referrer's dev account id from their shareable code (self-referral impossible: the
   *  new account doesn't exist yet). Returns null for an unknown/empty code — a bad ref is ignored. */
  private async resolveReferrer(code: string): Promise<string | null> {
    const trimmed = code.trim();
    if (!trimmed) return null;
    const referrer = await this.prisma.account.findFirst({
      where: { referralCode: trimmed, type: "dev" },
      select: { id: true },
    });
    return referrer?.id ?? null;
  }

  /** Generate a short, URL-safe referral code, retrying on the (rare) unique collision. */
  private async uniqueReferralCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = randomBytes(5).toString("base64url").slice(0, 8).toLowerCase();
      const taken = await this.prisma.account.findUnique({ where: { referralCode: code }, select: { id: true } });
      if (!taken) return code;
    }
    // Astronomically unlikely; fall back to a longer code.
    return randomBytes(9).toString("base64url").slice(0, 14).toLowerCase();
  }

  async login(email: string, password: string) {
    const account = await this.prisma.account.findFirst({ where: { email, type: "dev" } });
    // verifyPassword runs a real bcrypt compare even when the account is missing, so login
    // timing doesn't reveal whether an email is registered (enumeration side-channel).
    if (!(await verifyPassword(password, account?.passwordHash))) {
      throw new UnauthorizedException("invalid_credentials");
    }
    return this.result(account!);
  }
}
