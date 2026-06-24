import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { countryFromRequest, type GeoRequest } from "../me/geo";
import { GoogleVerifier } from "./google-verifier";
import { TokenService } from "./token.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verifier: GoogleVerifier,
    private readonly tokens: TokenService,
  ) {}

  async loginWithGoogle(idToken: string, geo: GeoRequest = {}) {
    const profile = await this.verifier.verify(idToken);
    // Stamp country only for brand-new accounts, and only if we can infer one —
    // never overwrite a country an existing account already has.
    const country = countryFromRequest({ headers: geo.headers });
    const account = await this.prisma.account.upsert({
      where: { oauthSub: profile.sub },
      update: { email: profile.email },
      create: { type: "dev", oauthSub: profile.sub, email: profile.email, country },
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
