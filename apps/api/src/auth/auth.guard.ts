import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";

export function bearer(req: { headers?: Record<string, unknown> }): string | undefined {
  const h = req.headers?.authorization;
  return typeof h === "string" && h.startsWith("Bearer ") ? h.slice(7) : undefined;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const account = await this.auth.accountFromToken(bearer(req));
    if (!account) throw new UnauthorizedException();
    (req as { account?: unknown }).account = account;
    return true;
  }
}
