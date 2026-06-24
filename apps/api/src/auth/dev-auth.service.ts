import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { TokenService } from "./token.service";

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

  async register(email: string, password: string, country: string | null = null) {
    const existing = await this.prisma.account.findFirst({ where: { email, type: "dev" } });
    if (existing) throw new BadRequestException("email_taken");
    const passwordHash = await bcrypt.hash(password, 8);
    const account = await this.prisma.account.create({ data: { type: "dev", email, passwordHash, country } });
    return this.result(account);
  }

  async login(email: string, password: string) {
    const account = await this.prisma.account.findFirst({ where: { email, type: "dev" } });
    if (!account?.passwordHash || !(await bcrypt.compare(password, account.passwordHash))) {
      throw new UnauthorizedException("invalid_credentials");
    }
    return this.result(account);
  }
}
