import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { GoogleVerifier } from "./google-verifier";
import { TokenService } from "./token.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verifier: GoogleVerifier,
    private readonly tokens: TokenService,
  ) {}

  async loginWithGoogle(idToken: string) {
    const profile = await this.verifier.verify(idToken);
    const account = await this.prisma.account.upsert({
      where: { oauthSub: profile.sub },
      update: { email: profile.email },
      create: { type: "dev", oauthSub: profile.sub, email: profile.email },
    });
    return {
      token: this.tokens.issue(account.id),
      account: { id: account.id, email: account.email, type: account.type },
    };
  }

  async accountFromToken(token?: string) {
    if (!token) return null;
    const claims = this.tokens.verify(token);
    if (!claims) return null;
    return this.prisma.account.findUnique({ where: { id: claims.sub } });
  }
}
