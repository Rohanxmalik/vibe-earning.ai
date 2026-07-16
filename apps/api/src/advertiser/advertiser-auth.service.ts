import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TokenService } from "../auth/token.service";
import { hashPassword, verifyPassword } from "../auth/password";

@Injectable()
export class AdvertiserAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  private result(account: { id: string; email: string | null; type: string }) {
    return { token: this.tokens.issue(account.id), account: { id: account.id, email: account.email, type: account.type } };
  }

  async register(email: string, password: string, country: string | null = null) {
    const existing = await this.prisma.account.findFirst({ where: { email, type: "advertiser" } });
    if (existing) throw new BadRequestException("email_taken");
    const passwordHash = await hashPassword(password);
    const account = await this.prisma.account.create({ data: { type: "advertiser", email, passwordHash, country } });
    return this.result(account);
  }

  async login(email: string, password: string) {
    const account = await this.prisma.account.findFirst({ where: { email, type: "advertiser" } });
    if (!(await verifyPassword(password, account?.passwordHash))) {
      throw new UnauthorizedException("invalid_credentials");
    }
    return this.result(account!);
  }
}
