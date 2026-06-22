import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { TokenService } from "../auth/token.service";

@Injectable()
export class AdvertiserAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  private result(account: { id: string; email: string | null; type: string }) {
    return { token: this.tokens.issue(account.id), account: { id: account.id, email: account.email, type: account.type } };
  }

  async register(email: string, password: string) {
    const existing = await this.prisma.account.findFirst({ where: { email, type: "advertiser" } });
    if (existing) throw new BadRequestException("email_taken");
    const passwordHash = await bcrypt.hash(password, 8);
    const account = await this.prisma.account.create({ data: { type: "advertiser", email, passwordHash } });
    return this.result(account);
  }

  async login(email: string, password: string) {
    const account = await this.prisma.account.findFirst({ where: { email, type: "advertiser" } });
    if (!account?.passwordHash || !(await bcrypt.compare(password, account.passwordHash))) {
      throw new UnauthorizedException("invalid_credentials");
    }
    return this.result(account);
  }
}
