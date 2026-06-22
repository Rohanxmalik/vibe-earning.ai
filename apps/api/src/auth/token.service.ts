import { Injectable } from "@nestjs/common";
import jwt from "jsonwebtoken";

export interface TokenClaims { sub: string } // sub = accountId

@Injectable()
export class TokenService {
  private secret(): string {
    const s = process.env.AUTH_JWT_SECRET;
    if (!s) throw new Error("AUTH_JWT_SECRET not configured");
    return s;
  }

  issue(accountId: string): string {
    return jwt.sign({ sub: accountId }, this.secret(), { expiresIn: "30d" });
  }

  verify(token: string): TokenClaims | null {
    try {
      const decoded = jwt.verify(token, this.secret()) as { sub?: string };
      return decoded.sub ? { sub: decoded.sub } : null;
    } catch {
      return null;
    }
  }
}
